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

    (async () => {
      try {
        // A. Fetch User Details
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

        // B. Group Lots by Job Number
        const jobsMap = {};
        const allLotIds = [];

        selectedLots.forEach((lot) => {
          if (!jobsMap[lot.jobNo]) {
            jobsMap[lot.jobNo] = {
              jobNo: lot.jobNo,
              lots: [],
              grossWeight: 0,
              netWeight: 0,
            };
          }
          jobsMap[lot.jobNo].lots.push(lot);
          jobsMap[lot.jobNo].grossWeight += parseFloat(lot.grossWeight) || 0;
          jobsMap[lot.jobNo].netWeight += parseFloat(lot.netWeight) || 0;

          if (lot.lotId) allLotIds.push(lot.lotId);
        });

        // C. Fetch Related Reports (Lot Discrepancies & Duplicates)
        let lotReportsMap = {};
        let jobReportsMap = {}; // Maps jobNo to array of reports

        if (allLotIds.length > 0) {
          // Fetch Lot Reports
          const lotReports = await db.sequelize.query(
            `SELECT * FROM public.lot_reports WHERE "lotId" IN (:ids)`,
            {
              replacements: { ids: allLotIds },
              type: db.sequelize.QueryTypes.SELECT,
            }
          );

          // Fetch Duplicate Reports
          const dupReports = await db.sequelize.query(
            `SELECT * FROM public.lot_duplicate WHERE "lotId" IN (:ids)`,
            {
              replacements: { ids: allLotIds },
              type: db.sequelize.QueryTypes.SELECT,
            }
          );

          // Map them
          lotReports.forEach((r) => {
            if (!lotReportsMap[r.lotId]) lotReportsMap[r.lotId] = [];
            lotReportsMap[r.lotId].push({
              type: "Discrepancy",
              status: r.reportStatus,
              date: r.reportedOn,
            });
          });
          dupReports.forEach((r) => {
            if (!lotReportsMap[r.lotId]) lotReportsMap[r.lotId] = [];
            lotReportsMap[r.lotId].push({
              type: "Duplicate",
              status: r.reportStatus,
              date: r.reportedOn,
            });
          });
        }

        // Fetch Job Reports (Discrepancy by Job)
        const uniqueJobNos = Object.keys(jobsMap);
        if (uniqueJobNos.length > 0) {
          const jobReports = await db.sequelize.query(
            `SELECT * FROM public.job_reports WHERE "jobNo" IN (:jobs)`,
            {
              replacements: { jobs: uniqueJobNos },
              type: db.sequelize.QueryTypes.SELECT,
            }
          );

          jobReports.forEach((r) => {
            if (!jobReportsMap[r.jobNo]) jobReportsMap[r.jobNo] = [];
            jobReportsMap[r.jobNo].push({
              type: r.discrepancyType,
              status: r.reportStatus,
              reportedAt: r.reportedOn,
            });
          });
        }

        // D. Generate JSON for each Job
        const timestamp = new Date().toLocaleString("en-SG", {
          timeZone: "Asia/Singapore",
        });

        for (const jobNo in jobsMap) {
          const jobData = jobsMap[jobNo];

          // Construct Lot Details List
          const lotsDetailed = jobData.lots.map((l) => ({
            lotId: l.lotId,
            lotNo: l.lotNo,
            exWarehouseLot: l.exWarehouseLot,
            exWarehouseWarrant: l.exWarehouseWarrant,
            bundleCount: l.expectedBundleCount,
            weights: {
              gross: l.grossWeight,
              net: l.netWeight,
            },
            reports: lotReportsMap[l.lotId] || null,
          }));

          const fileContent = {
            header: {
              jobNo: jobNo,
              confirmedAt: timestamp,
              confirmedBy: {
                userId: userId,
                username: username,
                userRole: userRole,
              },
            },
            summary: {
              totalLots: jobData.lots.length,
              totalGrossWeight: parseFloat(jobData.grossWeight.toFixed(3)),
              totalNetWeight: parseFloat(jobData.netWeight.toFixed(3)),
            },
            jobReports: jobReportsMap[jobNo] || "None", // Job-level discrepancies
            lotDetails: lotsDetailed, // Lot-level details & reports
          };

          // E. Write File
          const filePath = generateUniqueFilename(CONFIRM_LOGS_DIR, jobNo);
          fs.writeFile(
            filePath,
            JSON.stringify(fileContent, null, 2),
            (err) => {
              if (err)
                console.error(
                  `Failed to write confirmed log for ${jobNo}:`,
                  err
                );
              else console.log(`[LOG CREATED] ${filePath}`);
            }
          );
        }
      } catch (logError) {
        console.error("Critical Error in Confirm Inbound Logging:", logError);
      }
    })();
    // --- END LOGGING ---

    res.status(200).json({ success: true, inserted: result });
  } catch (error) {
    console.error("Error inserting inbounds:", error);
    res
      .status(500)
      .json({ error: "Failed to insert inbounds.", details: error.message });
  }
});

module.exports = router;
