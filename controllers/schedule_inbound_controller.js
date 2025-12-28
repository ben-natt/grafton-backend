const XLSX = require("xlsx");
const fs = require("fs");

// Import the db object to get the sequelize instance for queries
const db = require("../database");
const { sequelize, DataTypes } = db;

// We only need to initialize the models that this controller is directly responsible for: ScheduleInbound and Lot.
const { ScheduleInbound, Lot } = require("../models/schedule_inbound.model.js")(
  sequelize,
  DataTypes
);

// This function will find or create a record using raw SQL, mimicking your project's style.
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

exports.createScheduleInbound = async (req, res) => {
  const userId = req.user.userId;
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

      // --- VALIDATION WITH LOGS ---
      for (const lot of lots) {
        
        // Log what we are looking for
        console.log(`[VALIDATION CHECK] Searching DB for Job: "${jobNo}" AND Lot: "${lot.lotNo}"...`);

        const existingLot = await Lot.findOne({
          where: {
            jobNo: jobNo, 
            lotNo: lot.lotNo, 
          },
          transaction: transaction,
        });

        if (existingLot) {
          // Log EXACTLY what was found so you can debug
          console.error("---------------------------------------------------------------");
          console.error(`[DUPLICATE FOUND] System blocked Job: ${jobNo}, Lot: ${lot.lotNo}`);
          console.error(`   -> FOUND DB ID:      ${existingLot.id || existingLot.lotId || 'Unknown ID'}`);
          console.error(`   -> FOUND Job No:     ${existingLot.jobNo}`);
          console.error(`   -> FOUND Lot No:     ${existingLot.lotNo}`);
          console.error(`   -> FOUND Status:     ${existingLot.status}`); // Check if this is 'Cancelled' or 'Pending'
          console.error(`   -> FOUND Created At: ${existingLot.createdAt}`);
          console.error("---------------------------------------------------------------");

          const error = new Error(
            `Lot No ${lot.lotNo} is already scheduled for Job No ${jobNo}. (Ref ID: ${existingLot.id || 'N/A'})`
          );
          error.code = "DUPLICATE_SCHEDULE";
          throw error;
        } else {
            console.log(`[VALIDATION PASS] No existing record for Job: "${jobNo}", Lot: "${lot.lotNo}". Proceeding.`);
        }
      }
      // ------------------------------------------

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

      // Helper table insertions
      for (const lot of lots) {
        await findOrCreateRaw("commodities", "commodityName", lot.commodity, transaction);
        await findOrCreateRaw("brands", "brandName", lot.brand, transaction);
        await findOrCreateRaw("shapes", "shapeName", lot.shape, transaction);
        await findOrCreateRaw("exwarehouselocations", "exWarehouseLocationName", lot.exWarehouseLocation, transaction);
        await findOrCreateRaw("exlmewarehouses", "exLmeWarehouseName", lot.exLmeWarehouse, transaction);
        await findOrCreateRaw("inboundwarehouses", "inboundWarehouseName", lot.inboundWarehouse, transaction);
      }

      // Create/Update ScheduleInbound
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
    // --- LOGGING ---
    const timestamp = new Date().toLocaleString(); 

    for (const jobNo in jobDataMap) {
      const currentLots = jobDataMap[jobNo].lots || [];
      const lotCount = currentLots.length;
      const exWarehouseLotList = currentLots
        .map((lot) => lot.exWarehouseLot)
        .filter((val) => val) 
        .join(", ");

      console.log(
        `[SCHEDULE SUCCESS] User: ${userId} | Job No: ${jobNo} | Total Lots: ${lotCount} | Inbound Date: ${inboundDate} | Ex-Whse Lots: [${exWarehouseLotList}] | Timestamp: ${timestamp}`
      );
    }
    
    res.status(200).json({
      message: "Inbound schedule and lots created/updated successfully!",
    });
    console.log("Inbound schedule and lots created/updated successfully!");
  } catch (dbError) {
    await transaction.rollback();
    console.error("Database error during scheduling:", dbError);

    if (dbError.code === "DUPLICATE_SCHEDULE") {
      return res.status(409).json({
        message: dbError.message,
        errorCode: "DUPLICATE_SCHEDULE",
      });
    }

    res.status(500).json({
      message: "An error occurred during the scheduling process.",
      error: dbError.message,
    });
  }
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
        console.warn("Row skipped due to missing Job No:", row);
        continue;
      }

      if (!jobDataMap.has(jobNo)) {
        jobDataMap.set(jobNo, { lots: [] });
      }

      const lotNoValue = parseInt(row[lotNoIndex], 10);
      if (isNaN(lotNoValue)) {
        console.warn(
          `Row skipped for Job No ${jobNo} due to invalid Lot No:`,
          row[lotNoIndex]
        );
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