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

// --- SETUP LOGGING DIRECTORY ---
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

      // --- DATA NORMALIZATION ---
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

      // --- UPSERT PARENT ---
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

      // --- UPSERT CHILDREN ---
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

    // --- LOGGING SYSTEM ---
    try {
      const timestamp = new Date().toLocaleString();
      const isoTimestamp = new Date().toISOString();

      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }

      for (const jobNo in jobDataMap) {
        const currentLots = jobDataMap[jobNo].lots || [];
        const lotCount = currentLots.length;

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
      }
    } catch (logError) {
      console.error("[LOGGING SYSTEM FAILURE]", logError);
    }
    // --- LOGGING END ---

    res.status(200).json({
      message: "Inbound schedule and lots created/updated successfully!",
    });
  } catch (dbError) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {}

    console.error("Database error during scheduling:", dbError);

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

// --- DROPDOWN FETCHING ENDPOINTS ---

exports.getAllBrands = async (req, res) => {
  try {
    const [results] = await sequelize.query(
      'SELECT "brandName" FROM public.brands ORDER BY "brandName" ASC'
    );
    res.status(200).json(results.map((row) => row.brandName));
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({ message: "Error fetching brands" });
  }
};

exports.getAllCommodities = async (req, res) => {
  try {
    const [results] = await sequelize.query(
      'SELECT "commodityName" FROM public.commodities ORDER BY "commodityName" ASC'
    );
    res.status(200).json(results.map((row) => row.commodityName));
  } catch (error) {
    console.error("Error fetching commodities:", error);
    res.status(500).json({ message: "Error fetching commodities" });
  }
};

exports.getAllShapes = async (req, res) => {
  try {
    const [results] = await sequelize.query(
      'SELECT "shapeName" FROM public.shapes ORDER BY "shapeName" ASC'
    );
    res.status(200).json(results.map((row) => row.shapeName));
  } catch (error) {
    console.error("Error fetching shapes:", error);
    res.status(500).json({ message: "Error fetching shapes" });
  }
};

exports.getAllExWarehouseLocations = async (req, res) => {
  try {
    const [results] = await sequelize.query(
      'SELECT "exWarehouseLocationName" FROM public.exwarehouselocations ORDER BY "exWarehouseLocationName" ASC'
    );
    res.status(200).json(results.map((row) => row.exWarehouseLocationName));
  } catch (error) {
    console.error("Error fetching Ex-Warehouse Locations:", error);
    res.status(500).json({ message: "Error fetching Ex-Warehouse Locations" });
  }
};

exports.getAllExLmeWarehouses = async (req, res) => {
  try {
    const [results] = await sequelize.query(
      'SELECT "exLmeWarehouseName" FROM public.exlmewarehouses ORDER BY "exLmeWarehouseName" ASC'
    );
    res.status(200).json(results.map((row) => row.exLmeWarehouseName));
  } catch (error) {
    console.error("Error fetching Ex LME Warehouses:", error);
    res.status(500).json({ message: "Error fetching Ex LME Warehouses" });
  }
};

exports.getAllInboundWarehouses = async (req, res) => {
  try {
    const [results] = await sequelize.query(
      'SELECT "inboundWarehouseName" FROM public.inboundwarehouses ORDER BY "inboundWarehouseName" ASC'
    );
    res.status(200).json(results.map((row) => row.inboundWarehouseName));
  } catch (error) {
    console.error("Error fetching Inbound Warehouses:", error);
    res.status(500).json({ message: "Error fetching Inbound Warehouses" });
  }
};

// --- MONITORING API ENDPOINTS ---
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
  const safeFilename = path.basename(filename);
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
    console.error("[UPLOAD ERROR] No file received in request.");
    return res
      .status(400)
      .json({ message: "No file uploaded. Please select an Excel file." });
  }

  console.log(`[UPLOAD START] Processing file: ${req.file.originalname}`);

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
    const forbiddenLotNoIndex = headers.indexOf("Lot No");
    if (forbiddenLotNoIndex !== -1) {
      return res.status(400).json({
        errorCode: "REMOVE_LOT_NO_COLUMN",
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
        return res.status(409).json({
          message: "The file contains data that already exists in the system.",
          errors: duplicateErrors,
        });
      }
    }

    const responseData = Object.fromEntries(jobDataMap);
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
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err)
          console.error("[CLEANUP ERROR] Failed to delete temp file:", err);
      });
    }
  }
};