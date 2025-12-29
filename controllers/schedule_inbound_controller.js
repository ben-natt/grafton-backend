const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const db = require("../database");
const { sequelize, DataTypes } = db;

// Initialize Models
const { ScheduleInbound, Lot } = require("../models/schedule_inbound.model.js")(
  sequelize,
  DataTypes
);

// --- SETUP LOGGING DIRECTORY (From Current) ---
const LOGS_DIR = path.join(__dirname, "../logs/Scheduled Inbound");

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// --- HELPER FUNCTION ---
const findOrCreateRaw = async (table, nameColumn, name, transaction) => {
  if (!name || typeof name !== "string" || name.trim() === "") {
    return;
  }
  const aName = name.trim();

  try {
    const query = `
      INSERT INTO public."${table}" ("${nameColumn}", "createdAt", "updatedAt")
      VALUES (:aName, NOW(), NOW())
      ON CONFLICT ("${nameColumn}") DO NOTHING;
    `;
    await sequelize.query(query, {
      replacements: { aName },
      type: sequelize.QueryTypes.INSERT,
      transaction,
    });
  } catch (error) {
    console.error(`Error in findOrCreateRaw for table ${table}:`, error);
    throw error;
  }
};

// --- MAIN CONTROLLER ---
exports.createScheduleInbound = async (req, res) => {
  // Safe access to user properties (From Current - more robust)
  const user = req.user || {};
  const userId = user.userId;
  const username = user.username || "Unknown User";
  const roleId = user.roleId || null;

  const { inboundDate, jobDataMap } = req.body;

  if (!jobDataMap || Object.keys(jobDataMap).length === 0) {
    return res
      .status(400)
      .json({ message: "No lot data provided for scheduling." });
  }

  if (!inboundDate) {
    return res
      .status(400)
      .json({ message: "Inbound Date is required for scheduling." });
  }

  const transaction = await sequelize.transaction();

  try {
    for (const jobNo in jobDataMap) {
      const { lots } = jobDataMap[jobNo];

      // --- VALIDATION (From Incoming - Granular Lot Check) ---
      for (const lot of lots) {
        // Log what we are looking for
        console.log(
          `[VALIDATION CHECK] Searching DB for Job: "${jobNo}" AND Lot: "${lot.lotNo}"...`
        );

        const existingLot = await Lot.findOne({
          where: {
            jobNo: jobNo,
            lotNo: lot.lotNo,
          },
          transaction: transaction,
        });

        if (existingLot) {
          // Log EXACTLY what was found
          console.error(
            "---------------------------------------------------------------"
          );
          console.error(
            `[DUPLICATE FOUND] System blocked Job: ${jobNo}, Lot: ${lot.lotNo}`
          );
          console.error(
            `   -> FOUND DB ID:      ${
              existingLot.id || existingLot.lotId || "Unknown ID"
            }`
          );
          console.error(`   -> FOUND Job No:     ${existingLot.jobNo}`);
          console.error(`   -> FOUND Lot No:     ${existingLot.lotNo}`);
          console.error(`   -> FOUND Status:     ${existingLot.status}`);
          console.error(`   -> FOUND Created At: ${existingLot.createdAt}`);
          console.error(
            "---------------------------------------------------------------"
          );

          const error = new Error(
            `Lot No ${lot.lotNo} is already scheduled for Job No ${jobNo}.`
          );
          error.code = "DUPLICATE_SCHEDULE";
          throw error;
        } else {
          console.log(
            `[VALIDATION PASS] No existing record for Job: "${jobNo}", Lot: "${lot.lotNo}". Proceeding.`
          );
        }
      }

      // --- DATA NORMALIZATION (From Incoming) ---
      for (const lot of lots) {
        if (lot.shape && typeof lot.shape === "string") {
          const shapeLower = lot.shape.toLowerCase();
          if (shapeLower === "ing" || shapeLower === "ingot") {
            lot.shape = "Ingot";
          } else if (shapeLower === "tbar") {
            lot.shape = "T-bar";
          }
        }

        if (lot.commodity && typeof lot.commodity === "string") {
          if (lot.commodity.toUpperCase() === "LEAD") {
            lot.commodity = "Lead";
          } else if (lot.commodity.toUpperCase() === "ZINC") {
            lot.commodity = "Zinc";
          }
        }
      }

      // --- HELPER TABLE INSERTIONS ---
      for (const lot of lots) {
        await findOrCreateRaw(
          "commodities",
          "commodityName",
          lot.commodity,
          transaction
        );
        await findOrCreateRaw("brands", "brandName", lot.brand, transaction);
        await findOrCreateRaw("shapes", "shapeName", lot.shape, transaction);
        await findOrCreateRaw(
          "exwarehouselocations",
          "exWarehouseLocationName",
          lot.exWarehouseLocation,
          transaction
        );
        await findOrCreateRaw(
          "exlmewarehouses",
          "exLmeWarehouseName",
          lot.exLmeWarehouse,
          transaction
        );
        await findOrCreateRaw(
          "inboundwarehouses",
          "inboundWarehouseName",
          lot.inboundWarehouse,
          transaction
        );
      }

      // --- UPSERT PARENT (ScheduleInbound) ---
      const [scheduleInbound] = await ScheduleInbound.upsert(
        {
          jobNo: jobNo,
          inboundDate: new Date(inboundDate),
          userId: userId,
        },
        {
          transaction: transaction,
          returning: true,
        }
      );

      const scheduleInboundId = scheduleInbound.scheduleInboundId;

      // --- UPSERT CHILDREN (Lots) ---
      for (const lot of lots) {
        await Lot.upsert(
          {
            ...lot,
            scheduleInboundId: scheduleInboundId,
            inbounddate: new Date(inboundDate),
          },
          {
            transaction: transaction,
          }
        );
      }
    }

    await transaction.commit();

    // --- LOGGING SYSTEM (From Current - Writes JSON Files) ---
    // We wrap this in its own try-catch so logging errors don't crash the response
    try {
      const timestamp = new Date().toLocaleString();
      const isoTimestamp = new Date().toISOString();

      // Ensure directory exists again just in case
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }

      for (const jobNo in jobDataMap) {
        const currentLots = jobDataMap[jobNo].lots || [];
        const lotCount = currentLots.length;

        // Prepare data for JSON file
        const logData = {
          jobNo: jobNo,
          updatedBy: {
            userId: userId,
            username: username,
            roleId: roleId,
          },
          updateTime: timestamp,
          isoTimestamp: isoTimestamp,
          totalLots: lotCount,
          inboundDate: inboundDate,
          lotsDetails: currentLots,
        };

        const logFilePath = path.join(LOGS_DIR, `${jobNo}.json`);

        fs.writeFile(logFilePath, JSON.stringify(logData, null, 2), (err) => {
          if (err) {
            console.error(`[LOG ERROR] Failed to write log for ${jobNo}:`, err);
          } else {
            console.log(`[LOG CREATED] ${logFilePath}`);
          }
        });

        // Optional: Console log summary (From Incoming style)
        const exWarehouseLotList = currentLots
          .map((lot) => lot.exWarehouseLot)
          .filter((val) => val)
          .join(", ");

        console.log(
          `[SCHEDULE SUCCESS] Job: ${jobNo} | Lots: ${lotCount} | Ex-Whse: [${exWarehouseLotList}]`
        );
      }
    } catch (logError) {
      console.error("[LOGGING SYSTEM FAILURE]", logError);
      // We do NOT throw here, so the user still gets a success response
    }
    // --- LOGGING END ---

    res.status(200).json({
      message: "Inbound schedule and lots created/updated successfully!",
    });
  } catch (dbError) {
    // Only rollback if transaction started AND not yet committed
    // This check handles cases where commit might have happened but logging failed (though logging is outside try block usually)
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      // Transaction might have been already committed or rolled back
    }

    console.error("Database error during scheduling:", dbError);

    // Specific handling for Duplicate Schedule
    if (dbError.code === "DUPLICATE_SCHEDULE") {
      return res.status(409).json({
        message: dbError.message,
        errorCode: "DUPLICATE_SCHEDULE",
      });
    }

    if (!res.headersSent) {
      res.status(500).json({
        message: "An error occurred during the scheduling process.",
        error: dbError.message,
      });
    }
  }
};

// --- MONITORING API ENDPOINTS (From Current) ---
exports.getInboundLogs = async (req, res) => {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      return res.status(200).json({ success: true, data: [] });
    }

    fs.readdir(LOGS_DIR, (err, files) => {
      if (err) {
        console.error("Error reading logs directory:", err);
        return res
          .status(500)
          .json({ message: "Unable to scan logs directory" });
      }

      const logFiles = files.filter((file) => file.endsWith(".json"));

      const fileStats = logFiles
        .map((file) => {
          try {
            const stats = fs.statSync(path.join(LOGS_DIR, file));
            return {
              filename: file,
              jobNo: file.replace(".json", ""),
              createdAt: stats.birthtime,
            };
          } catch (statErr) {
            return null;
          }
        })
        .filter((item) => item !== null);

      // Sort by newest first
      fileStats.sort((a, b) => b.createdAt - a.createdAt);

      res.status(200).json({
        success: true,
        data: fileStats,
      });
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error fetching logs", error: error.message });
  }
};

exports.getInboundLogDetail = async (req, res) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename); // Security: prevent directory traversal
  const filePath = path.join(LOGS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "Log file not found" });
  }

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading log file:", err);
      return res.status(500).json({ message: "Error reading log file" });
    }
    try {
      const jsonData = JSON.parse(data);
      res.status(200).json({ success: true, data: jsonData });
    } catch (parseError) {
      res.status(500).json({ message: "Error parsing log file content" });
    }
  });
};

exports.uploadExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: "yyyy-mm-dd",
      header: 1,
    });

    if (jsonData.length < 2) {
      return res
        .status(400)
        .json({ message: "Excel file is empty or missing data rows." });
    }

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);

    const jobNoIndex = headers.indexOf("Job No");
    const lotNoIndex = headers.indexOf("Lot No");
    // ... (Keep existing index mappings) ...
    const nwIndex = headers.indexOf("NW");
    const gwIndex = headers.indexOf("GW");
    const actualWeightIndex = headers.indexOf("Actual Weight");
    const exLotIndex = headers.indexOf("Ex-Whse Lot");
    const exWarrantIndex = headers.indexOf("Ex-Whse Warrant");
    const bdleIndex = headers.indexOf("Bdle");
    const brandIndex = headers.indexOf("Brand");
    const metalIndex = headers.indexOf("Metal");
    const shapeIndex = headers.indexOf("Shape");
    const exLocIndex = headers.indexOf("Ex-Whse Location");
    const exLMEIndex = headers.indexOf("Ex LME Warehouse");
    const inWarehouseIndex = headers.indexOf("Inbound Warehouse");

    if (jobNoIndex === -1) {
      return res.status(400).json({
        message: "Invalid data in excel file. Please check your file again.",
      });
    }

    const jobDataMap = new Map();
    let totalLotsProcessed = 0;

    for (const row of dataRows) {
      if (
        !row ||
        row.length === 0 ||
        row.every((cell) => cell === null || cell === undefined || cell === "")
      ) {
        continue;
      }

      const jobNo = row[jobNoIndex]?.toString().trim() || null;
      if (!jobNo) {
        continue;
      }

      if (!jobDataMap.has(jobNo)) {
        jobDataMap.set(jobNo, { lots: [] });
      }

      const lotNoValue = parseInt(row[lotNoIndex], 10);
      if (isNaN(lotNoValue)) {
        continue;
      }

      const lotData = {
        jobNo: jobNo,
        lotNo: lotNoValue,
        netWeight: parseFloat(row[nwIndex]) || null,
        grossWeight: parseFloat(row[gwIndex]) || null,
        actualWeight: parseFloat(row[actualWeightIndex]) || null,
        exWarehouseLot: row[exLotIndex]?.toString().trim() || null,
        exWarehouseWarrant: row[exWarrantIndex]?.toString().trim() || null,
        expectedBundleCount: parseInt(row[bdleIndex], 10) || null,
        brand: row[brandIndex]?.toString().trim() || null,
        commodity: row[metalIndex]?.toString().trim() || null,
        shape: row[shapeIndex]?.toString().trim() || null,
        exWarehouseLocation: row[exLocIndex]?.toString().trim() || null,
        exLmeWarehouse: row[exLMEIndex]?.toString().trim() || null,
        inboundWarehouse: row[inWarehouseIndex]?.toString().trim() || null,
        status: "Pending",
      };

      jobDataMap.get(jobNo).lots.push(lotData);
      totalLotsProcessed++;
    }

    // ============================================================
    // NEW VALIDATION LOGIC START
    // ============================================================
    const allJobNos = Array.from(jobDataMap.keys());
    const duplicateErrors = [];

    // 1. Only query if we actually have data
    if (allJobNos.length > 0) {
      // 2. Fetch ALL existing lots for these Job Numbers from the database
      // Sequelize "where: { jobNo: [...] }" acts as an IN clause
      const existingLots = await Lot.findAll({
        where: {
          jobNo: allJobNos,
        },
        attributes: ["jobNo", "lotNo"], // We only need these columns to check
        raw: true,
      });

      // 3. Create a Set for fast lookup (O(1) complexity)
      // Format: "JOB_NO|LOT_NO"
      const dbLotSet = new Set(
        existingLots.map((l) => `${l.jobNo}|${l.lotNo}`)
      );

      // 4. Check every lot in the Excel file against the DB Set
      jobDataMap.forEach((value, jobNo) => {
        value.lots.forEach((lot) => {
          const key = `${jobNo}|${lot.lotNo}`;
          if (dbLotSet.has(key)) {
            duplicateErrors.push(
              `Job: ${jobNo} / Lot: ${lot.lotNo} already exists in the system.`
            );
          }
        });
      });
    }

    // 5. If we found ANY duplicates, block the upload immediately
    if (duplicateErrors.length > 0) {
      return res.status(409).json({
        message: "Upload Blocked: The file contains duplicate data.",
        errors: duplicateErrors, // Frontend can display this list
      });
    }
    // ============================================================
    // NEW VALIDATION LOGIC END
    // ============================================================

    const responseData = {};
    jobDataMap.forEach((value, key) => {
      responseData[key] = value;
    });

    res.status(200).json({
      message: "Excel data parsed successfully. Ready for scheduling.",
      lotCount: totalLotsProcessed,
      data: responseData,
    });
  } catch (error) {
    console.error("Error reading or parsing Excel file:", error);
    res.status(500).json({
      message: "Error reading or parsing Excel file.",
      error: error.message,
    });
  } finally {
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error("Error deleting temp file:", err);
      }
    }
  }
};
