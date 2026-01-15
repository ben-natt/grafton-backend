const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const db = require("../database");
const { sequelize, DataTypes } = db;
const usersModel = require("../models/users.model");

// Initialize Models
const { ScheduleInbound, Lot } = require("../models/schedule_inbound.model.js")(
  sequelize,
  DataTypes
);

// --- SETUP LOGGING DIRECTORY (From Current) ---
const LOGS_DIR = path.join(__dirname, "../logs/Scheduled Inbounds");

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
  // Safe access to user properties
  const userPayload = req.user || {};
  const userId = userPayload.userId;

  // [UPDATED] Fetch full user details from DB to get Username and Role for logs
  let username = "Unknown User";
  let userRole = "Unknown Role";

  if (userId) {
    try {
      const fullUser = await usersModel.getUserById(userId);
      if (fullUser) {
        username = fullUser.username;
        userRole = fullUser.rolename;
      }
    } catch (err) {
      console.warn("Could not fetch user details for logging:", err.message);
    }
  }

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
      // [NOTE] Without lotNo, we can't easily "Update" existing lots via upsert
      // unless we rely on IDs which we don't have from Excel.
      // These will be created as NEW rows.
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
            userRole: userRole,
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

exports.getAllBrands = async (req, res) => {
  try {
    // This fetches all unique brand names from the 'brands' table
    const [results] = await sequelize.query(
      'SELECT "brandName" FROM public.brands ORDER BY "brandName" ASC'
    );

    // Map the result to a simple array of strings
    const brands = results.map((row) => row.brandName);
    res.status(200).json(brands);
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({ message: "Error fetching brands" });
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
  // 1. Initial Check: Was a file actually received?
  if (!req.file) {
    console.error("[UPLOAD ERROR] No file received in request.");
    return res
      .status(400)
      .json({ message: "No file uploaded. Please select an Excel file." });
  }

  console.log(`[UPLOAD START] Processing file: ${req.file.originalname}`);

  try {
    // 2. Read Workbook
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to 2D array (header: 1) for manual header validation
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: "yyyy-mm-dd",
      header: 1,
    });

    // 3. Validation: Empty File
    if (jsonData.length < 2) {
      console.error(
        `[UPLOAD ERROR] File ${req.file.originalname} has no data rows.`
      );
      return res
        .status(400)
        .json({ message: "Excel file is empty or missing data rows." });
    }

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);

    // 4. Validation: Column Requirements
    const jobNoIndex = headers.indexOf("Job No");
    const forbiddenLotNoIndex = headers.indexOf("Lot No");
    if (forbiddenLotNoIndex !== -1) {
      return res.status(400).json({
        errorCode: "REMOVE_LOT_NO_COLUMN", // Special error code for frontend
        message: "Please remove the 'Lot No' column from the Excel file.",
      });
    }
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

    const jobDataMap = new Map();
    let totalLotsProcessed = 0;

    // 5. Parse Rows into jobDataMap
    for (const row of dataRows) {
      if (
        !row ||
        row.length === 0 ||
        row.every((cell) => cell === null || cell === "")
      )
        continue;

      const jobNo = row[jobNoIndex]?.toString().trim() || null;
      if (!jobNo) continue;

      if (!jobDataMap.has(jobNo)) {
        jobDataMap.set(jobNo, { lots: [] });
      }

      const lotData = {
        jobNo: jobNo,
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

    // 6. Database Validation: Check for existing duplicates
    const allJobNos = Array.from(jobDataMap.keys());
    if (allJobNos.length > 0) {
      const existingLots = await Lot.findAll({
        where: {
          jobNo: allJobNos,
        },
        attributes: ["jobNo", "exWarehouseLot"],
        raw: true,
      });

      const dbLotSet = new Set(
        existingLots.map((l) => `${l.jobNo}|${l.exWarehouseLot}`)
      );

      // ✅ FIX: Initialize the array here before using it
      const duplicateErrors = [];

      jobDataMap.forEach((value, jobNo) => {
        value.lots.forEach((lot) => {
          const key = `${jobNo}|${lot.exWarehouseLot}`;
          if (dbLotSet.has(key)) {
            duplicateErrors.push(
              `Job: ${jobNo} / Ex-W-Lot: ${lot.exWarehouseLot} already exists in the system.`
            );
          }
        });
      });

      if (duplicateErrors.length > 0) {
        console.error(
          `[UPLOAD BLOCKED] Found ${duplicateErrors.length} duplicate entries.`
        );
        return res.status(409).json({
          message: "The file contains data that already exists in the system.",
          errors: duplicateErrors,
        });
      }
    }

    // 7. Success Response
    const responseData = Object.fromEntries(jobDataMap);
    console.log(
      `[UPLOAD SUCCESS] Processed ${totalLotsProcessed} lots for ${allJobNos.length} jobs.`
    );

    res.status(200).json({
      message: "Excel data parsed successfully. Ready for scheduling.",
      lotCount: totalLotsProcessed,
      data: responseData,
    });
  } catch (error) {
    console.error("[CRITICAL UPLOAD ERROR]:", error);
    res.status(500).json({
      message: "A server error occurred while reading the Excel file.",
      error: error.message,
    });
  } finally {
    // 8. Cleanup: Always delete the temporary file from /uploads/excel
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err)
          console.error("[CLEANUP ERROR] Failed to delete temp file:", err);
      });
    }
  }
};
