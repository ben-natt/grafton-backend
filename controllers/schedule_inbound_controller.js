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

// --- HELPER FUNCTION: Auto-add missing relational data ---
const findOrCreateRaw = async (table, nameColumn, name, transaction) => {
  if (!name || typeof name !== "string" || name.trim() === "") {
    return;
  }
  const aName = name.trim();

  try {
    // 1. Check if the record already exists (safer than ON CONFLICT if there's no unique constraint)
    const existing = await sequelize.query(
      `SELECT "${nameColumn}" FROM "${table}" WHERE "${nameColumn}" = :aName LIMIT 1`,
      {
        replacements: { aName },
        type: sequelize.QueryTypes.SELECT,
        transaction,
      }
    );

    // 2. Insert if it doesn't exist
    if (!existing || existing.length === 0) {
      const query = `
        INSERT INTO "${table}" ("${nameColumn}", "createdAt", "updatedAt")
        VALUES (:aName, NOW(), NOW());
      `;
      await sequelize.query(query, {
        replacements: { aName },
        type: sequelize.QueryTypes.INSERT,
        transaction,
      });
    }
  } catch (error) {
    console.error(`[INFO] Could not auto-add '${aName}' to ${table}. Reason: ${error.message}`);
  }
};

// --- API ENDPOINTS FOR FRONTEND DROPDOWNS (Resolves 404s) ---
const safeQueryList = async (table, column) => {
  try {
    return await sequelize.query(`SELECT DISTINCT "${column}" AS name FROM "${table}" WHERE "${column}" IS NOT NULL`, { 
        type: sequelize.QueryTypes.SELECT 
    });
  } catch (e) {
    console.warn(`[WARNING] Could not fetch from ${table} (Returning empty list). SQL Message: ${e.message}`);
    return []; // Return empty list to stop 404s instead of crashing
  }
};

exports.getShapes = async (req, res) => res.status(200).json(await safeQueryList("shapes", "shapeName"));
exports.getAllBrands = async (req, res) => res.status(200).json(await safeQueryList("brands", "brandName"));

// FIXED: Passed exact lowercase table names to match Postgres Schema
exports.getExWarehouseLocations = async (req, res) => res.status(200).json(await safeQueryList("exwarehouselocations", "exWarehouseLocationName"));
exports.getExLmeWarehouses = async (req, res) => res.status(200).json(await safeQueryList("exlmewarehouses", "exLmeWarehouseName"));
exports.getInboundWarehouses = async (req, res) => res.status(200).json(await safeQueryList("inboundwarehouses", "inboundWarehouseName"));

// FIXED: Changed table from "metals" to "commodities" and column from "name" to "commodityName"
exports.getCommodities = async (req, res) => res.status(200).json(await safeQueryList("commodities", "commodityName"));
// --- UPLOAD EXCEL FILE ---
// --- UPLOAD EXCEL FILE (With Strict Backend Validation) ---
exports.uploadExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Read as an array of arrays
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ message: "Excel file is empty." });
    }

    // --- 1. FETCH VALID COMMODITIES FROM DATABASE ---
    const dbCommodities = await sequelize.query(
      `SELECT "commodityName" FROM "commodities" WHERE "commodityName" IS NOT NULL`, 
      { type: sequelize.QueryTypes.SELECT }
    );
    
    // Create a Set of lowercase commodity names for easy, case-insensitive validation
    const validCommoditiesSet = new Set(
      dbCommodities.map(c => c.commodityName.trim().toLowerCase())
    );

    // 2. Find Header Row dynamically
    let headerRowIndex = 0;
    let headers = [];
    for (let i = 0; i < rawData.length; i++) {
      if (rawData[i] && rawData[i].length > 0) {
        headerRowIndex = i;
        headers = rawData[i].map((h) => (typeof h === "string" ? h.trim().toLowerCase() : h));
        break;
      }
    }

    const getColIndex = (possibleNames) => {
      for (let name of possibleNames) {
        const idx = headers.findIndex((h) => h === name.toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    // 3. Map Columns
    const colMap = {
      jobNo: getColIndex(["job no", "job number", "jobno"]),
      lotNo: getColIndex(["ex-whse lot", "lot no", "lot", "ex-warehouse lot"]),
      warrant: getColIndex(["ex-whse warrant", "warrant"]),
      metal: getColIndex(["metal"]),
      brandCode: getColIndex(["brand code", "brand"]),
      shape: getColIndex(["shape"]),
      bundles: getColIndex(["bdle", "bundle", "bundles"]),
      nw: getColIndex(["nw", "net weight"]),
      gw: getColIndex(["gw", "gross weight"]),
      exWhseLoc: getColIndex(["ex-whse location", "location"]),
      exLmeWhse: getColIndex(["ex lme warehouse", "lme warehouse"]),
      inboundWhse: getColIndex(["inbound warehouse"]),
    };

    const jobDataMap = new Map();
    let totalLotsProcessed = 0;
    const skippedRows = [];
    const invalidCommoditiesFound = new Set(); // To collect all bad commodities

    // 4. Process Data Rows
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const jobNo = colMap.jobNo !== -1 ? row[colMap.jobNo] : row[0];
      const lotNo = colMap.lotNo !== -1 ? row[colMap.lotNo] : row[2];

      if (!jobNo || !lotNo) {
        skippedRows.push({ rowIndex: i + 1, data: row });
        continue;
      }

      // --- 5. VALIDATE THE COMMODITY ---
      let rawCommodity = colMap.metal !== -1 ? row[colMap.metal] : row[3];
      
      if (rawCommodity) {
        const lowerCommodity = String(rawCommodity).trim().toLowerCase();
        
        // If the database doesn't have this commodity, flag it as invalid
        if (!validCommoditiesSet.has(lowerCommodity)) {
          invalidCommoditiesFound.add(String(rawCommodity).trim());
        }
      } else {
        invalidCommoditiesFound.add("Missing/Empty Commodity");
      }

      const jobKey = String(jobNo).trim();
      const lotKey = String(lotNo).trim();

      if (!jobDataMap.has(jobKey)) {
        jobDataMap.set(jobKey, {
          jobNo: jobKey,
          inboundDate: new Date(),
          lots: [],
        });
      }

      // We still map the data temporarily, but we won't save it if validation fails
      jobDataMap.get(jobKey).lots.push({
        exWarehouseLot: lotKey,
        exWarehouseWarrant: colMap.warrant !== -1 ? row[colMap.warrant] : row[1],
        commodity: rawCommodity ? String(rawCommodity).trim() : null,
        brand: colMap.brandCode !== -1 ? row[colMap.brandCode] : row[4],
        shape: colMap.shape !== -1 ? row[colMap.shape] : row[6],
        expectedBundleCount: colMap.bundles !== -1 ? row[colMap.bundles] : row[7], 
        netWeight: colMap.nw !== -1 ? row[colMap.nw] : row[8],
        grossWeight: colMap.gw !== -1 ? row[colMap.gw] : row[9],
        exWarehouseLocation: colMap.exWhseLoc !== -1 ? row[colMap.exWhseLoc] : row[10],
        exLmeWarehouse: colMap.exLmeWhse !== -1 ? row[colMap.exLmeWhse] : row[11],
        inboundWarehouse: colMap.inboundWhse !== -1 ? row[colMap.inboundWhse] : row[12],
      });
      totalLotsProcessed++;
    }

    // --- 6. BLOCK UPLOAD IF VALIDATION FAILED ---
    if (invalidCommoditiesFound.size > 0) {
      return res.status(400).json({ 
        message: "Validation Failed: Unrecognized commodities found in the Excel file.", 
        invalidItems: Array.from(invalidCommoditiesFound),
        instruction: "Please fix these items in the spreadsheet or add them to the database first."
      });
    }

    // Convert map to standard object to send back
    const responseData = Object.fromEntries(jobDataMap);
    
    res.status(200).json({
      message: "Excel data validated and parsed successfully. Ready for scheduling.",
      lotCount: totalLotsProcessed,
      skippedCount: skippedRows.length,
      data: responseData,
    });
  } catch (error) {
    console.error("[CRITICAL UPLOAD ERROR]:", error);
    res.status(500).json({ message: "A server error occurred", error: error.message });
  }
};

// --- CREATE SCHEDULE INBOUND (Saves data & auto-adds missing fields) ---
exports.createScheduleInbound = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { jobDataMap } = req.body; // <-- Update: matching your Dart payload
    
    // Safety check just in case the frontend sends it wrapped differently
    const dataToProcess = jobDataMap || req.body.data;
    
    for (const jobKey in dataToProcess) {
      const jobData = dataToProcess[jobKey];

      // Create main ScheduleInbound
      const schedule = await ScheduleInbound.create({
        jobNo: jobData.jobNo || jobKey, // fallback to key if missing
        inboundDate: req.body.inboundDate || jobData.inboundDate || new Date(), // Check root payload first
        userId: req.user ? req.user.id : null,
      }, { transaction });

      // Create Lots and auto-add relationships dynamically
      for (const lot of jobData.lots) {
        
        // AUTO-ADD missing values into databases
        if (lot.brand) await findOrCreateRaw("brands", "brandName", lot.brand, transaction);
        if (lot.shape) await findOrCreateRaw("shapes", "shapeName", lot.shape, transaction);
        
        // CHANGED: Auto-add based on frontend 'commodity' key
        if (lot.commodity) await findOrCreateRaw("commodities", "commodityName", lot.commodity, transaction); 
        
        if (lot.exWarehouseLocation) await findOrCreateRaw("exwarehouselocations", "exWarehouseLocationName", lot.exWarehouseLocation, transaction);
        if (lot.exLmeWarehouse) await findOrCreateRaw("exlmewarehouses", "exLmeWarehouseName", lot.exLmeWarehouse, transaction);
        if (lot.inboundWarehouse) await findOrCreateRaw("inboundwarehouses", "inboundWarehouseName", lot.inboundWarehouse, transaction);

        // Finally create the lot
        await Lot.create({
          scheduleInboundId: schedule.scheduleInboundId,
          exWarehouseLot: lot.exWarehouseLot,
          exWarehouseWarrant: lot.exWarehouseWarrant,
          
          // CHANGED: Translating frontend 'commodity' back to database 'metal'
          metal: lot.commodity, 
          brand: lot.brand,
          shape: lot.shape,
          
          // CHANGED: Translating frontend 'expectedBundleCount' back to database 'bundles'
          bundles: lot.expectedBundleCount || 0, 
          netWeight: lot.netWeight || 0,
          grossWeight: lot.grossWeight || 0,
          exWarehouseLocation: lot.exWarehouseLocation,
          exLmeWarehouse: lot.exLmeWarehouse,
          inboundWarehouse: lot.inboundWarehouse,
        }, { transaction });
      }
    }

    await transaction.commit();
    res.status(200).json({ message: "Inbound Schedule created successfully" });
  } catch (error) {
    await transaction.rollback();
    console.error("[CRITICAL] Create Schedule Error:", error);
    res.status(500).json({ message: "Failed to create schedule inbound", error: error.message });
  }
};

// --- LOGGING METHODS ---
exports.getInboundLogs = async (req, res) => {
  try {
    const files = fs.readdirSync(LOGS_DIR);
    res.json(files);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getInboundLogDetail = async (req, res) => {
  try {
    const fileData = fs.readFileSync(path.join(LOGS_DIR, req.params.filename), "utf-8");
    res.json({ content: fileData });
  } catch (err) { res.status(500).json({ error: err.message }); }
};