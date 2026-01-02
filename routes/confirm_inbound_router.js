const express = require("express");
const {
  reportConfirmation,
  insertInboundFromLots,
  reportDuplication,
} = require("../models/confirm_inbound_model");
const usersModel = require("../models/users.model");
const db = require("../database");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const CONFIRM_LOGS_DIR = path.join(__dirname, "../logs/Confirmed Inbounds");
if (!fs.existsSync(CONFIRM_LOGS_DIR)) {
  fs.mkdirSync(CONFIRM_LOGS_DIR, { recursive: true });
}

const generateUniqueFilename = (dir, jobNo) => {
  let filename = `${jobNo}.json`;
  let counter = 1;
  while (fs.existsSync(path.join(dir, filename))) {
    counter++;
    filename = `${jobNo}_${counter}.json`;
  }
  return path.join(dir, filename);
};

const createLogEntry = async (
  jobNo,
  userId,
  actionType,
  summaryData,
  detailsData
) => {
  try {
    // 1. Fetch User Details
    let username = "Unknown";
    let userRole = "Unknown";
    try {
      const userDetails = await usersModel.getUserById(userId);
      if (userDetails) {
        username = userDetails.username;
        userRole = userDetails.rolename;
      }
    } catch (e) {
      console.error("Log User Fetch Error", e);
    }

    // 2. Prepare Log Content
    const timestamp = new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    });

    const fileContent = {
      header: {
        jobNo: jobNo,
        action: actionType, // Added action type (e.g., "Report Discrepancy", "Confirm Finish")
        timestamp: timestamp,
        performedBy: {
          userId: userId,
          username: username,
          userRole: userRole,
        },
      },
      summary: summaryData, // Object containing totalLots, weights, etc.
      details: detailsData, // Array or Object with specific details
    };

    // 3. Write File
    const filePath = generateUniqueFilename(CONFIRM_LOGS_DIR, jobNo);
    fs.writeFile(filePath, JSON.stringify(fileContent, null, 2), (err) => {
      if (err) console.error(`Failed to write log for ${jobNo}:`, err);
      else console.log(`[LOG CREATED] ${filePath}`);
    });
  } catch (error) {
    console.error(`Error generating log for ${jobNo}:`, error);
  }
};

// ROUTER TO DO REPORT
router.post("/tasks-report-confirmation", async (req, res) => {
  try {
    const { lotIds, reportedBy } = req.body;

    if (!Array.isArray(lotIds) || lotIds.length === 0) {
      return res
        .status(400)
        .json({ error: "lotIds must be a non-empty array" });
    }

    if (!reportedBy) {
      return res.status(400).json({ error: "reportedBy is required" });
    }

    const createdReports = await reportConfirmation(lotIds, reportedBy);

    if (!createdReports || createdReports.length === 0) {
      return res
        .status(404)
        .json({ error: "No reports were created. Please check lotIds." });
    }

    // --- LOGGING START ---
    (async () => {
      try {
        // Fetch Lot Details to group by JobNo and get info for logs
        const lots = await db.sequelize.query(
          `SELECT "lotId", "lotNo", "jobNo", "exWarehouseLot", "exWarehouseWarrant" 
           FROM public.lot WHERE "lotId" IN (:ids)`,
          {
            replacements: { ids: lotIds },
            type: db.sequelize.QueryTypes.SELECT,
          }
        );

        const jobsMap = {};
        lots.forEach((lot) => {
          if (!jobsMap[lot.jobNo]) jobsMap[lot.jobNo] = [];
          jobsMap[lot.jobNo].push(lot);
        });

        for (const jobNo in jobsMap) {
          const jobLots = jobsMap[jobNo];
          await createLogEntry(
            jobNo,
            reportedBy,
            "Report Discrepancy (Lot Level)",
            { totalReportedLots: jobLots.length },
            jobLots.map((l) => ({
              lotId: l.lotId,
              lotNo: l.lotNo,
              exWarehouseLot: l.exWarehouseLot,
              issue: "Pending Verification", // Or map specific status if available
            }))
          );
        }
      } catch (logErr) {
        console.error("Logging error in report confirmation:", logErr);
      }
    })();
    // --- LOGGING END ---

    res.status(200).json({
      message: "Lot reports created successfully.",
      createdReports,
    });
  } catch (error) {
    console.error("Error creating reports:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ROUTER TO REPORT DUPLICATE LOTS
router.post("/tasks-report-duplication", async (req, res) => {
  try {
    const { lotIds, reportedBy } = req.body;

    // Validate the incoming request body
    if (!Array.isArray(lotIds) || lotIds.length === 0) {
      return res
        .status(400)
        .json({ error: "lotIds must be a non-empty array" });
    }

    if (!reportedBy) {
      return res.status(400).json({ error: "reportedBy is required" });
    }

    // Call the model function to handle the database insertion
    const createdReports = await reportDuplication(lotIds, reportedBy);

    if (!createdReports || createdReports.length === 0) {
      return res.status(404).json({
        error: "No duplicate reports were created. Please check lotIds.",
      });
    }

    // --- LOGGING START ---
    (async () => {
      try {
        const lots = await db.sequelize.query(
          `SELECT "lotId", "lotNo", "jobNo", "exWarehouseLot" 
           FROM public.lot WHERE "lotId" IN (:ids)`,
          {
            replacements: { ids: lotIds },
            type: db.sequelize.QueryTypes.SELECT,
          }
        );

        const jobsMap = {};
        lots.forEach((lot) => {
          if (!jobsMap[lot.jobNo]) jobsMap[lot.jobNo] = [];
          jobsMap[lot.jobNo].push(lot);
        });

        for (const jobNo in jobsMap) {
          const jobLots = jobsMap[jobNo];
          await createLogEntry(
            jobNo,
            reportedBy,
            "Report Duplication",
            { totalDuplicatedLots: jobLots.length },
            jobLots.map((l) => ({
              lotId: l.lotId,
              lotNo: l.lotNo,
              exWarehouseLot: l.exWarehouseLot,
            }))
          );
        }
      } catch (logErr) {
        console.error("Logging error in report duplication:", logErr);
      }
    })();
    // --- LOGGING END --

    res.status(200).json({
      message: "Lot duplicate reports created successfully.",
      createdReports,
    });
  } catch (error) {
    console.error("Error creating duplicate reports:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ROUTER TO DO THE UPDATE AND ADDING OF INBOUND
router.post("/tasks-complete-inbound", async (req, res) => {
  const { selectedLots, userId } = req.body;

  if (!Array.isArray(selectedLots) || selectedLots.length === 0) {
    return res
      .status(400)
      .json({ error: "Lots array is required and cannot be empty." });
  }

  if (!userId) {
    return res.status(400).json({ error: "User ID is required." });
  }

  try {
    const result = await insertInboundFromLots(selectedLots, userId);

    // --- LOGGING START ---
    (async () => {
      try {
        const jobsMap = {};
        const allLotIds = [];

        selectedLots.forEach((lot) => {
          if (!jobsMap[lot.jobNo])
            jobsMap[lot.jobNo] = { jobNo: lot.jobNo, lots: [] };
          jobsMap[lot.jobNo].lots.push(lot);
          if (lot.lotId) allLotIds.push(lot.lotId);
        });

        let lotWeightsMap = {};
        if (allLotIds.length > 0) {
          const dbLots = await db.sequelize.query(
            `SELECT "lotId", "grossWeight", "netWeight" FROM public.lot WHERE "lotId" IN (:ids)`,
            {
              replacements: { ids: allLotIds },
              type: db.sequelize.QueryTypes.SELECT,
            }
          );
          dbLots.forEach((l) => {
            lotWeightsMap[l.lotId] = {
              gross: parseFloat(l.grossWeight) || 0,
              net: parseFloat(l.netWeight) || 0,
            };
          });
        }

        for (const jobNo in jobsMap) {
          const jobData = jobsMap[jobNo];
          let jobTotalGross = 0.0;
          let jobTotalNet = 0.0;

          const lotsDetailed = jobData.lots.map((l) => {
            const dbWeights = lotWeightsMap[l.lotId] || { gross: 0, net: 0 };
            jobTotalGross += dbWeights.gross;
            jobTotalNet += dbWeights.net;

            return {
              lotId: l.lotId,
              lotNo: l.lotNo,
              exWarehouseLot: l.exWarehouseLot,
              bundleCount: l.expectedBundleCount,
              weights: { gross: dbWeights.gross, net: dbWeights.net },
            };
          });

          await createLogEntry(
            jobNo,
            userId,
            "Confirm Inbound",
            {
              totalLots: jobData.lots.length,
              totalGrossWeight: parseFloat(jobTotalGross.toFixed(3)),
              totalNetWeight: parseFloat(jobTotalNet.toFixed(3)),
            },
            lotsDetailed
          );
        }
      } catch (logError) {
        console.error("Critical Error in Confirm Inbound Logging:", logError);
      }
    })();
    // --- LOGGING END ---

    res.status(200).json({ success: true, inserted: result });
  } catch (error) {
    console.error("Error inserting inbounds:", error);
    res
      .status(500)
      .json({ error: "Failed to insert inbounds.", details: error.message });
  }
});

module.exports = router;
