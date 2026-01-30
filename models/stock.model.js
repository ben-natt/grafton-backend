const db = require("../database");
const fs = require("fs");
const path = require("path");
const usersModel = require("../models/users.model"); // Ensure this path is correct relative to stock.model.js

// --- LOGGING CONFIG (EDITED LOGS) ---
const EDIT_LOGS_DIR = path.join(__dirname, "../logs/Edited");
if (!fs.existsSync(EDIT_LOGS_DIR)) {
  fs.mkdirSync(EDIT_LOGS_DIR, { recursive: true });
}

const OUTBOUND_LOGS_DIR = path.join(__dirname, "../logs/Scheduled Outbounds");
if (!fs.existsSync(OUTBOUND_LOGS_DIR)) {
  fs.mkdirSync(OUTBOUND_LOGS_DIR, { recursive: true });
}

// --- HELPER: Generate Unique Filename ---
const generateUniqueFilename = (dir, jobNo) => {
  let filename = `${jobNo}.json`;
  let counter = 1;
  while (fs.existsSync(path.join(dir, filename))) {
    filename = `${jobNo}_${counter}.json`;
    counter++;
  }
  return path.join(dir, filename);
};

// --- HELPER: Create Log Entry for Edits ---
const createEditLogEntry = async (
  jobNo,
  userId,
  actionType,
  summaryData,
  detailsData,
) => {
  try {
    // 1. Fetch User Details
    let username = "Unknown";
    let userRole = "Unknown";
    try {
      if (userId && userId !== "N/A") {
        const userDetails = await usersModel.getUserById(userId);
        if (userDetails) {
          username = userDetails.username;
          userRole = userDetails.rolename;
        }
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
        action: actionType,
        timestamp: timestamp,
        performedBy: {
          userId: userId || "N/A",
          username: username,
          userRole: userRole,
        },
      },
      summary: summaryData,
      details: detailsData,
    };

    // 3. Write File
    const filePath = generateUniqueFilename(EDIT_LOGS_DIR, jobNo);
    fs.writeFile(filePath, JSON.stringify(fileContent, null, 2), (err) => {
      if (err) console.error(`Failed to write log for ${jobNo}:`, err);
      else console.log(`[LOG CREATED] ${filePath}`);
    });
  } catch (error) {
    console.error(`Error generating log for ${jobNo}:`, error);
  }
};

const getAllStock = async () => {
  try {
    const query = `
        SELECT
            c."commodityName" AS "Metal",
            SUM(i."noOfBundle") AS "Bundles",
            COUNT(DISTINCT i."inboundId") AS "Lots",
            s."shapeName" AS "Shape",
            SUM(i."netWeight") AS "TotalWeight(KG)"
        FROM
            public.inbounds i
        LEFT JOIN
            public.selectedInbounds o ON o."inboundId" = i."inboundId"
        -- MODIFICATION: Join with outboundtransactions to filter out processed lots
        LEFT JOIN
            public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
        JOIN
            public.commodities c ON i."commodityId" = c."commodityId"
        JOIN
            public.shapes s ON i."shapeId" = s."shapeId"
        WHERE
            o."inboundId" IS NULL
            -- MODIFICATION: Ensure the lot is not in outboundtransactions
            AND ot."inboundId" IS NULL
        GROUP BY
            c."commodityName", s."shapeName"
        ORDER BY
            c."commodityName";
        `;

    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching all stock records:", error);
    throw error;
  }
};

const getInventory = async (filters) => {
  try {
    const page = parseInt(filters.page, 10) || 1;
    const pageSize = parseInt(filters.pageSize, 10) || 25;
    const offset = (page - 1) * pageSize;
    const replacements = { pageSize, offset };

    const cteQuery = `
      WITH grouped_inventory AS (
          SELECT
              i."jobNo" AS "Job No",
              COUNT(DISTINCT i."crewLotNo") AS "Lot No",
              c."commodityName" AS "Metal",
              b."brandName" AS "Brand",
              s."shapeName" AS "Shape",
              SUM(i."noOfBundle") AS "Qty",
              SUM(CASE WHEN i."isWeighted" = true THEN i."actualWeight" ELSE 0 END) AS "Weight",
              SUM(i."grossWeight") AS "GrossWeight",
              SUM(i."actualWeight") AS "ActualWeight"
          FROM public.inbounds i
          JOIN public.brands b ON b."brandId" = i."brandId"
          JOIN public.commodities c ON c."commodityId" = i."commodityId"
          JOIN public.shapes s ON s."shapeId" = i."shapeId"
          WHERE NOT EXISTS (
              SELECT 1 FROM public.selectedInbounds o 
              WHERE o."inboundId" = i."inboundId"
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.outboundtransactions ot 
              WHERE ot."inboundId" = i."inboundId"
          )
          GROUP BY i."jobNo", c."commodityName", b."brandName", s."shapeName"
      )
    `;

    let finalWhereClause = "";
    if (filters.search) {
      replacements.search = `%${filters.search}%`;
      finalWhereClause = `
        WHERE
            "Job No" ILIKE :search OR
            "Metal" ILIKE :search OR
            "Brand" ILIKE :search OR
            "Shape" ILIKE :search OR
            CAST("Lot No" AS TEXT) ILIKE :search OR
            CAST("Qty" AS TEXT) ILIKE :search OR
            CAST("Weight" AS TEXT) ILIKE :search OR
            CAST("GrossWeight" AS TEXT) ILIKE :search OR
            CAST("ActualWeight" AS TEXT) ILIKE :search
      `;
    }

    const sortableColumns = {
      JobNo: '"Job No"', // Matches frontend sending 'JobNo'
      LotNo: '"Lot No"', // Matches frontend sending 'LotNo'
      Metal: '"Metal"', // Matches frontend sending 'Metal'
      Brand: '"Brand"', // Matches frontend sending 'Brand'
      Shape: '"Shape"', // Matches frontend sending 'Shape'
      Qty: '"Qty"', // Matches frontend sending 'Qty'
      Weight: '"Weight"', // Matches frontend sending 'Weight'
    };

    let orderByClause = 'ORDER BY "Job No" ASC'; // Default sort

    if (filters.sortBy && sortableColumns[filters.sortBy]) {
      const sortColumn = sortableColumns[filters.sortBy];
      const sortOrder = filters.sortOrder === "desc" ? "DESC" : "ASC";
      orderByClause = `ORDER BY ${sortColumn} ${sortOrder}`;
    }

    const countQuery = `${cteQuery} SELECT COUNT(*)::int AS "totalItems" FROM grouped_inventory ${finalWhereClause};`;

    const dataQuery = `
      ${cteQuery}
      SELECT *
      FROM grouped_inventory
      ${finalWhereClause}
      ${orderByClause}
      LIMIT :pageSize OFFSET :offset;
    `;

    const countReplacements = { ...replacements };
    delete countReplacements.pageSize;
    delete countReplacements.offset;

    const [countResult, items] = await Promise.all([
      db.sequelize.query(countQuery, {
        replacements: countReplacements,
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(dataQuery, {
        replacements,
        type: db.sequelize.QueryTypes.SELECT,
      }),
    ]);

    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;
    return { items, totalItems };
  } catch (error) {
    console.error("Error fetching inventory records:", error);
    throw error;
  }
};

const getFilterOptions = async () => {
  try {
    const brandsQuery =
      'SELECT DISTINCT "brandName" FROM public.brands WHERE "brandName" IS NOT NULL ORDER BY "brandName";';
    const shapesQuery =
      'SELECT DISTINCT "shapeName" FROM public.shapes WHERE "shapeName" IS NOT NULL ORDER BY "shapeName";';
    const commoditiesQuery =
      'SELECT DISTINCT "commodityName" FROM public.commodities WHERE "commodityName" IS NOT NULL ORDER BY "commodityName";';
    const jobNosQuery =
      'SELECT DISTINCT "jobNo" FROM public.inbounds WHERE "jobNo" IS NOT NULL ORDER BY "jobNo";';
    const exLMEWarehouseQuery =
      'SELECT DISTINCT "exLmeWarehouseName" FROM public.exlmewarehouses WHERE "exLmeWarehouseName" IS NOT NULL ORDER BY "exLmeWarehouseName";';
    const exWarehouseLocationQuery =
      'SELECT DISTINCT "exWarehouseLocationName" FROM public.exwarehouselocations WHERE "exWarehouseLocationName" IS NOT NULL ORDER BY "exWarehouseLocationName";';
    const inboundWarehouseQuery =
      'SELECT DISTINCT "inboundWarehouseName" FROM public.inboundwarehouses WHERE "inboundWarehouseName" IS NOT NULL ORDER BY "inboundWarehouseName";';

    const [
      brands,
      shapes,
      commodities,
      jobNos,
      exlmewarehouse,
      exWarehouseLocation,
      inboundWarehouse,
    ] = await Promise.all([
      db.sequelize.query(brandsQuery, { type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(shapesQuery, { type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(commoditiesQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(jobNosQuery, { type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(exLMEWarehouseQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(exWarehouseLocationQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(inboundWarehouseQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
    ]);
    if (
      !brands ||
      !shapes ||
      !commodities ||
      !jobNos ||
      !exlmewarehouse ||
      !exWarehouseLocation ||
      !inboundWarehouse
    ) {
      throw new Error("Failed to fetch filter options");
    }

    return {
      brands: brands.map((item) => item.brandName),
      shapes: shapes.map((item) => item.shapeName),
      commodities: commodities.map((item) => item.commodityName),
      jobNos: jobNos.map((item) => item.jobNo),
      exLMEWarehouse: exlmewarehouse.map((item) => item.exLmeWarehouseName),
      exWarehouseLocation: exWarehouseLocation.map(
        (item) => item.exWarehouseLocationName,
      ),
      inboundWarehouse: inboundWarehouse.map(
        (item) => item.inboundWarehouseName,
      ),
    };
  } catch (error) {
    console.error("Error fetching filter options:", error);
    throw error;
  }
};

const getLotSummary = async (jobNo, lotNo) => {
  try {
    // Query 1: Get the details for the specific AVAILABLE lot you clicked on
    const detailsQuery = `
      SELECT
        i."jobNo" AS "JobNo", i."noOfBundle" AS "NoOfBundle",
        i."crewLotNo" AS "CrewLotNo",
        i."inboundId", i."barcodeNo" AS "Barcode", c."commodityName" AS "Commodity", b."brandName" AS "Brand",
        s."shapeName" AS "Shape", exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
        i."exWarehouseLot" AS "ExWarehouseLot", i."exWarehouseWarrant" AS "ExWarehouseWarrant",
        exwhl."exWarehouseLocationName" AS "ExWarehouseLocation", iw."inboundWarehouseName" AS "InboundWarehouse",
        i."createdAt" AS "InboundDate", TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ScheduleInboundDate",
        si."createdAt" AS "CreatedAt",
        i."grossWeight" AS "GrossWeight", i."netWeight" AS "NetWeight", i."actualWeight" AS "ActualWeight",
        
        -- [NEW] Added Fields
        i."tareWeight" AS "TareWeight",
        i."scaleNo" AS "ScaleNo",
        TO_CHAR(i."lottedAt" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "LottedAt",
        u3."username" AS "LottedBy",

        i."isRebundled" AS "IsRebundled", i."isRepackProvided" AS "IsRepackProvided",
        u1."username" AS "ScheduledBy",
        u2."username" AS "ProcessedBy",
        i."updatedAt" AS "UpdatedAt"
      FROM public.inbounds i
      LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
      -- MODIFICATION: Join with outboundtransactions to filter out processed lots
      LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
      LEFT JOIN public.lot l on l."jobNo" = i."jobNo" AND l."exWarehouseLot" = i."exWarehouseLot"
      LEFT JOIN public.scheduleinbounds si ON si."scheduleInboundId" = l."scheduleInboundId"
      LEFT JOIN public.brands b ON b."brandId" = i."brandId"
      LEFT JOIN public.commodities c ON c."commodityId" = i."commodityId"
      LEFT JOIN public.shapes s ON s."shapeId" = i."shapeId"
      LEFT JOIN public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
      LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
      LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
      LEFT JOIN public.users u1 ON u1.userid = i."userId"
      LEFT JOIN public.users u2 ON u2.userid = i."processedId"
      -- [NEW] Join to get Lotted By username
      LEFT JOIN public.users u3 ON u3.userid = i."lottedById"
      WHERE o."inboundId" IS NULL
        -- MODIFICATION: Ensure the lot is not in outboundtransactions
        AND ot."inboundId" IS NULL
        AND i."jobNo" = :jobNo
        AND i."exWarehouseLot" = :lotNo
      LIMIT 1;
    `;

    const lotDetailsResult = await db.sequelize.query(detailsQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      replacements: { jobNo, lotNo },
    });

    if (lotDetailsResult.length === 0) {
      return null;
    }

    const lotDetails = lotDetailsResult[0];
    const exactJobNo = lotDetails.JobNo;

    // --- Outbound Activities ---
    let outboundActivities = [];

    if (exactJobNo) {
      const outboundQuery = `
        SELECT "jobNo", "lotNo", "createdAt"
        FROM public.outboundtransactions
        WHERE "jobNo" = :jobNo
        ORDER BY "createdAt" DESC;
      `;

      outboundActivities = await db.sequelize.query(outboundQuery, {
        type: db.sequelize.QueryTypes.SELECT,
        replacements: { jobNo: exactJobNo },
      });
    }

    // --- Lot Count Info ---
    const countsQuery = `
      SELECT
        COUNT(*) AS "TotalCount",
        COUNT(CASE WHEN o."inboundId" IS NULL AND ot."inboundId" IS NULL THEN 1 END) AS "AvailableCount"
      FROM public.inbounds i
      LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
      -- MODIFICATION: Join with outboundtransactions to get an accurate available count
      LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
      WHERE i."jobNo" = :jobNo;
    `;

    const lotCountsResult = await db.sequelize.query(countsQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      replacements: { jobNo: exactJobNo },
    });

    // Merge all results into one object
    const finalResult = {
      ...lotDetails,
      ...lotCountsResult[0],
      OutboundActivities: outboundActivities,
    };

    return finalResult;
  } catch (error) {
    console.error("Error fetching lot summary records:", error);
    throw error;
  }
};

const getLotDetails = async (filters) => {
  try {
    const replacements = {};
    let whereClauses = ['o."inboundId" IS NULL', 'ot."inboundId" IS NULL'];

    if (filters.selectedMetal) {
      whereClauses.push('c."commodityName" ILIKE :selectedMetal');
      replacements.selectedMetal = `%${filters.selectedMetal}%`;
    }
    if (filters.selectedShape) {
      whereClauses.push('s."shapeName" ILIKE :selectedShape');
      replacements.selectedShape = `%${filters.selectedShape}%`;
    }
    if (filters.jobNo) {
      whereClauses.push('i."jobNo" ILIKE :jobNo');
      replacements.jobNo = `%${filters.jobNo}%`;
    }
    if (filters.brands) {
      try {
        const brandsList = JSON.parse(filters.brands);
        if (Array.isArray(brandsList) && brandsList.length > 0) {
          whereClauses.push('b."brandName" IN (:brands)');
          replacements.brands = brandsList;
        }
      } catch (e) {
        console.error("Error parsing brands filter:", e);
      }
    }
    if (filters.exWarehouseLocation) {
      whereClauses.push(
        'exwhl."exWarehouseLocationName" = :exWarehouseLocation',
      );
      replacements.exWarehouseLocation = filters.exWarehouseLocation;
    }
    if (filters.exLMEWarehouse) {
      whereClauses.push('elme."exLmeWarehouseName" = :exLMEWarehouse');
      replacements.exLMEWarehouse = filters.exLMEWarehouse;
    }
    if (filters.noOfBundle) {
      const noOfBundleInt = parseInt(filters.noOfBundle, 10);
      if (!isNaN(noOfBundleInt)) {
        whereClauses.push('i."noOfBundle" = :noOfBundle');
        replacements.noOfBundle = noOfBundleInt;
      }
    }
    if (filters.inboundWarehouse) {
      whereClauses.push('iw."inboundWarehouseName" = :inboundWarehouse');
      replacements.inboundWarehouse = filters.inboundWarehouse;
    }
    if (filters.exWarehouseLot) {
      whereClauses.push('i."exWarehouseLot" ILIKE :exWarehouseLot');
      replacements.exWarehouseLot = `%${filters.exWarehouseLot}%`;
    }
    if (filters.search) {
      const comboMatch = filters.search.match(/^(.*?)[\s_-]+(\d+)$/i);

      if (comboMatch && comboMatch[1] && comboMatch[1].trim() !== "") {
        const [_, jobNoPart, lotNoPart] = comboMatch;
        const normalizedJobNo = jobNoPart.replace(/[^a-zA-Z0-9]/g, "");
        const normalizedLotNo = parseInt(lotNoPart, 10); // remove leading zeros

        replacements.jobNoSearch = `%${normalizedJobNo}%`;
        replacements.lotNoSearch = normalizedLotNo;

        whereClauses.push(`(
            REGEXP_REPLACE(i."jobNo", '[^a-zA-Z0-9]', '', 'g') ILIKE :jobNoSearch
            AND i."crewLotNo" = :lotNoSearch
        )`);
      } else {
        const normalizedSearch = filters.search.replace(/[^a-zA-Z0-9]/g, "");
        replacements.normalizedSearch = `%${normalizedSearch}%`;
        replacements.search = `%${filters.search}%`;

        whereClauses.push(`(
          i."jobNo" ILIKE :search OR
          REGEXP_REPLACE(i."jobNo", '[^a-zA-Z0-9]', '', 'g') ILIKE :normalizedSearch OR
          i."exWarehouseLot" ILIKE :search OR
          c."commodityName" ILIKE :search OR
          b."brandName" ILIKE :search OR
          s."shapeName" ILIKE :search OR
          CAST(i."crewLotNo" AS TEXT) ILIKE :search OR
          CAST(i."netWeight" AS TEXT) ILIKE :search OR
          CAST(i."noOfBundle" AS TEXT) ILIKE :search OR
          CAST(i."grossWeight" AS TEXT) ILIKE :search OR
          CAST(i."actualWeight" AS TEXT) ILIKE :search OR
          elme."exLmeWarehouseName" ILIKE :search OR
          exwhl."exWarehouseLocationName" ILIKE :search OR
          i."exWarehouseWarrant" ILIKE :search OR
          iw."inboundWarehouseName" ILIKE :search OR
          u1."username" ILIKE :search OR
          u2."username" ILIKE :search
        )`);
      }
    }

    const whereString = " WHERE " + whereClauses.join(" AND ");

    const sortableColumns = {
      LotNo: 'i."jobNo" ASC, i."crewLotNo"',
      "Ex-WarehouseLot": 'i."exWarehouseLot"',
      Metal: 'c."commodityName"',
      Brand: 'b."brandName"',
      Shape: 's."shapeName"',
      Qty: 'i."noOfBundle"',
      Weight: '"Weight"',
    };
    let orderByClause = 'ORDER BY i."inboundId" ASC';
    if (filters.sortBy && sortableColumns[filters.sortBy]) {
      const sortOrder = filters.sortOrder === "desc" ? "DESC" : "ASC";
      if (filters.sortBy === "LotNo" || filters.sortBy === "Lot No") {
        orderByClause = `ORDER BY i."jobNo" ${sortOrder}, i."crewLotNo" ${sortOrder}`;
      } else {
        orderByClause = `ORDER BY ${
          sortableColumns[filters.sortBy]
        } ${sortOrder}`;
      }
    }

    const baseQuery = `
      FROM public.inbounds i
      LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
      LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
      JOIN public.commodities c ON i."commodityId" = c."commodityId"
      JOIN public.shapes s ON i."shapeId" = s."shapeId"
      LEFT JOIN public.brands b ON i."brandId" = b."brandId"
      LEFT JOIN public.exlmewarehouses elme ON elme."exLmeWarehouseId" = i."exLmeWarehouseId"
      LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
      LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
      LEFT JOIN public.users u1 ON u1.userid = i."userId"
      LEFT JOIN public.users u2 ON u2.userid = i."processedId"
      ${whereString}
    `;

    const countQuery = `SELECT COUNT(DISTINCT i."inboundId")::int AS "totalItems" ${baseQuery}`;

    const countResult = await db.sequelize.query(countQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      replacements: { ...replacements },
    });
    const totalItems = countResult[0].totalItems;

    const page = parseInt(filters.page, 10) || 1;
    const pageSize = parseInt(filters.pageSize, 10) || 25;
    const offset = (page - 1) * pageSize;
    replacements.pageSize = pageSize;
    replacements.offset = offset;

    const dataQuery = `
      SELECT
        i."inboundId" as id, i."jobNo" AS "JobNo",
        i."crewLotNo", i."isWeighted",
        i."exWarehouseLot" AS "Ex-WarehouseLot", elme."exLmeWarehouseName" AS "ExLMEWarehouse",
        c."commodityName" AS "Metal", b."brandName" AS "Brand", s."shapeName" AS "Shape",
        i."noOfBundle" AS "Qty", 
        CASE WHEN i."isWeighted" = true THEN i."actualWeight" ELSE '0.0' END AS "Weight",
        i."grossWeight" AS "GrossWeight", i."actualWeight" AS "ActualWeight",
        exwhl."exWarehouseLocationName" AS "ExWarehouseLocation",
        iw."inboundWarehouseName" AS "InboundWarehouse",
        i."exWarehouseWarrant" AS "ExWarehouseWarrant",
        u1."username" AS "ScheduledBy", u2."username" AS "ProcessedBy"
      ${baseQuery}
      GROUP BY
        i."inboundId", elme."exLmeWarehouseName", c."commodityName", b."brandName", s."shapeName",
        exwhl."exWarehouseLocationName", iw."inboundWarehouseName", u1."username", u2."username"
      ${orderByClause}
      LIMIT :pageSize OFFSET :offset;
    `;

    const items = await db.sequelize.query(dataQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      replacements,
    });
    return { items, totalItems };
  } catch (error) {
    console.error("Error fetching lot details:", error);
    throw error;
  }
};

const createScheduleOutbound = async (scheduleData, userId, files = []) => {
  const t = await db.sequelize.transaction();
  console.log(
    "Creating schedule outbound with data:",
    scheduleData,
    "and userId:",
    userId,
  );
  try {
    const {
      releaseStartDate,
      releaseEndDate,
      jobNumber,
      lotReleaseWeight,
      exportDate,
      stuffingDate,
      containerNo,
      sealNo,
      deliveryDate,
      storageReleaseLocation,
      releaseWarehouse,
      transportVendor,
      selectedLots,
      tareWeight,
      uom,
    } = scheduleData;

    const parsedLots = JSON.parse(selectedLots);

    // FIX START: Determine outboundType based on presence of container info
    const outboundType = containerNo ? "container" : "flatbed";
    // FIX END

    const scheduleInsertQuery = `
     INSERT INTO public.scheduleoutbounds (
        "releaseDate", "releaseEndDate", "userId", "lotReleaseWeight", "outboundType", "exportDate",
        "stuffingDate", "containerNo", "sealNo", "createdAt", "updatedAt",
        "deliveryDate", "storageReleaseLocation", "releaseWarehouse", "transportVendor","outboundJobNo",
        "tareWeight", "uom"
      )
      VALUES (
        :releaseDate, :releaseEndDate, :userId, :lotReleaseWeight, :outboundType, :exportDate,
        :stuffingDate, :containerNo, :sealNo, NOW(), NOW(),
        :deliveryDate, :storageReleaseLocation, :releaseWarehouse, :transportVendor, :outboundJobNo,
        :tareWeight, :uom
      )
      RETURNING "scheduleOutboundId";
      `;
    const insertResult = await db.sequelize.query(scheduleInsertQuery, {
      replacements: {
        releaseDate: releaseStartDate,
        releaseEndDate: releaseEndDate,
        outboundJobNo: jobNumber,
        userId,
        lotReleaseWeight: parseFloat(lotReleaseWeight),
        outboundType,
        // FIX START: Ensure all optional fields default to null if not provided
        exportDate: exportDate || null,
        stuffingDate: stuffingDate || null,
        containerNo: containerNo || null,
        sealNo: sealNo || null,
        deliveryDate: deliveryDate || null,
        // FIX END
        storageReleaseLocation,
        releaseWarehouse,
        transportVendor,
        tareWeight: tareWeight || null,
        uom: uom || null,
      },
      type: db.sequelize.QueryTypes.INSERT,
      transaction: t,
    });

    const scheduleOutboundId = insertResult?.[0]?.[0]?.scheduleOutboundId;

    if (!scheduleOutboundId) {
      throw new Error("Failed to retrieve scheduleOutboundId.");
    }

    // --- REVERTED CODE SECTION ---
    // This query is now simpler because "outboundId" can be null by default.
    if (files && files.length > 0) {
      const stuffingPhotosQuery = `
            INSERT INTO public.stuffing_photos ("scheduleoutboundId", "imageUrl", "createdAt", "updatedAt")
            VALUES (:scheduleOutboundId, :imageUrl, NOW(), NOW());
        `;
      for (const file of files) {
        await db.sequelize.query(stuffingPhotosQuery, {
          replacements: {
            scheduleOutboundId: scheduleOutboundId,
            imageUrl: `/uploads/img/stuffing_photos/${file.filename}`,
          },
          type: db.sequelize.QueryTypes.INSERT,
          transaction: t,
        });
      }
    }
    // --- END REVERTED CODE SECTION ---

    if (parsedLots?.length > 0) {
      const selectedInboundsQuery = `
        INSERT INTO public.selectedinbounds (
          "inboundId", "scheduleOutboundId", "lotNo", "jobNo", "createdAt", "updatedAt",
          "releaseDate", "releaseEndDate", "exportDate", "deliveryDate", "storageReleaseLocation"
        )
        VALUES (
          :inboundId, :scheduleOutboundId, :lotNo, :jobNo, NOW(), NOW(),
          :releaseDate, :releaseEndDate, :exportDate, :deliveryDate, :storageReleaseLocation
        )
        ON CONFLICT ("jobNo", "lotNo") DO NOTHING;
      `;

      const updateInboundQuantityQuery = `
       UPDATE public.inbounds
        SET "noOfBundle" = :quantity
        WHERE "inboundId" = :inboundId;
      `;

      for (const lot of parsedLots) {
        const inboundId = lot.id;
        const quantity = lot.Bdl;

        if (!inboundId) {
          console.warn("Skipping lot due to missing inboundId:", lot);
          continue;
        }

        const lotNoDisplay = lot["Lot No"]?.toString() ?? "";
        const parts = lotNoDisplay.split("-");
        const jobNo =
          parts.length > 1 ? parts.slice(0, -1).join("-") : lot.jobNo;
        const lotNo =
          parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : lot.lotNo;

        if (!jobNo || isNaN(lotNo)) continue;

        await db.sequelize.query(selectedInboundsQuery, {
          replacements: {
            inboundId,
            scheduleOutboundId,
            lotNo,
            jobNo,
            releaseDate: releaseStartDate,
            releaseEndDate: releaseEndDate || null,
            // FIX START: Ensure exportDate and deliveryDate are handled here too
            exportDate: exportDate || null,
            deliveryDate: deliveryDate || null,
            // FIX END
            storageReleaseLocation:
              lot.storageReleaseLocation || storageReleaseLocation,
          },
          type: db.sequelize.QueryTypes.INSERT,
          transaction: t,
        });

        if (quantity != null) {
          await db.sequelize.query(updateInboundQuantityQuery, {
            replacements: {
              quantity,
              inboundId,
            },
            type: db.sequelize.QueryTypes.UPDATE,
            transaction: t,
          });
        }
      }
    }

    await t.commit();

    // ========================================================
    // --- START LOGGING SYSTEM (Scheduled Outbounds) ---
    // ========================================================
    try {
      // 1. Fetch full user details from DB to get Username and Role for logs
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
          console.warn(
            "Could not fetch user details for logging:",
            err.message,
          );
        }
      }

      // 2. Prepare uploaded photos paths if available
      const uploadedPhotoPaths = files.map(
        (f) => `/uploads/img/stuffing_photos/${f.filename}`,
      );

      // 3. Prepare JSON Data
      const logData = {
        jobNo: jobNumber,
        outboundJobNo: jobNumber,
        action: "Schedule Outbound Created",
        updatedBy: {
          userId: userId,
          username: username,
          userRole: userRole,
        },
        updateTime: new Date().toLocaleString(),
        isoTimestamp: new Date().toISOString(),
        scheduleDetails: {
          releaseDate: releaseStartDate,
          releaseEndDate: releaseEndDate,
          lotReleaseWeight,
          outboundType,
          exportDate,
          stuffingDate,
          containerNo,
          sealNo,
          deliveryDate,
          storageReleaseLocation,
          releaseWarehouse,
          transportVendor,
          tareWeight,
          uom,
          selectedLots: parsedLots,
        },
        uploadedPhotos: uploadedPhotoPaths,
      };

      // 4. Determine Filename based on DB Sequence [UPDATED LOGIC]
      let logFilename = `${jobNumber}.json`;

      try {
        // Count how many times this Job No exists in the table (including the one just committed)
        const countQuery = `SELECT COUNT(*)::int as "count" FROM public.scheduleoutbounds WHERE "outboundJobNo" = :jobNumber`;
        const countResult = await db.sequelize.query(countQuery, {
          replacements: { jobNumber },
          type: db.sequelize.QueryTypes.SELECT,
        });

        // Get the count (e.g., 1 for the first one, 2 for the second)
        const count = countResult[0]?.count || 1;

        // If count > 1, it means the job number existed previously, so we append the sequence
        // Example: JOB123.json (1st), JOB123-2.json (2nd), JOB123-3.json (3rd)
        if (count > 1) {
          logFilename = `${jobNumber}-${count}.json`;
        }
      } catch (seqError) {
        console.warn(
          "[LOG SEQ ERROR] Failed to fetch DB sequence, using timestamp fallback:",
          seqError,
        );
        // Fallback to timestamp if DB count fails
        logFilename = `${jobNumber}_${Date.now()}.json`;
      }

      const logFilePath = path.join(OUTBOUND_LOGS_DIR, logFilename);

      // 5. Write to File
      fs.writeFile(logFilePath, JSON.stringify(logData, null, 2), (err) => {
        if (err) {
          console.error(
            `[LOG ERROR] Failed to write outbound log for ${jobNumber}:`,
            err,
          );
        } else {
          console.log(`[LOG CREATED] ${logFilePath}`);
        }
      });
    } catch (logError) {
      console.error(
        "[LOGGING SYSTEM FAILURE] Error creating outbound log:",
        logError,
      );
    }
    // ========================================================
    // --- END LOGGING SYSTEM ---
    // ========================================================

    return {
      success: true,
      message: "Schedule created successfully.",
      outboundJobNo: jobNumber,
    };
  } catch (error) {
    await t.rollback();
    console.error("Error in createScheduleOutbound transaction:", error);
    throw new Error(
      "Failed to create outbound schedule due to a database error.",
    );
  }
};

const EditInformation = async (inboundId, updateData, userId) => {
  console.log(`[EditInfo] Processing Update for ID: ${inboundId}`, updateData);

  try {
    // --- STEP 1: PRE-FETCH CURRENT DATA FOR LOGGING ---
    const preFetchQuery = `
      SELECT 
        i."jobNo", i."crewLotNo", i."inboundId",
        i."noOfBundle", i."barcodeNo",
        c."commodityName" AS "commodity",
        b."brandName" AS "brand",
        s."shapeName" AS "shape",
        el."exLmeWarehouseName" AS "exLMEWarehouse",
        i."exWarehouseLot",
        i."exWarehouseWarrant",
        eloc."exWarehouseLocationName" AS "exWarehouseLocation",
        iw."inboundWarehouseName" AS "inboundWarehouse",
        i."grossWeight", i."netWeight", i."actualWeight",
        i."isRelabelled", i."isRebundled", i."isRepackProvided"
      FROM public.inbounds i
      LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
      LEFT JOIN public.brands b ON i."brandId" = b."brandId"
      LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
      LEFT JOIN public.exlmewarehouses el ON i."exLmeWarehouseId" = el."exLmeWarehouseId"
      LEFT JOIN public.exwarehouselocations eloc ON i."exWarehouseLocationId" = eloc."exWarehouseLocationId"
      LEFT JOIN public.inboundwarehouses iw ON i."inboundWarehouseId" = iw."inboundWarehouseId"
      WHERE i."inboundId" = :inboundId
    `;

    const currentDataResult = await db.sequelize.query(preFetchQuery, {
      replacements: { inboundId: parseInt(inboundId) },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });

    if (!currentDataResult) {
      console.error(
        `[EditInfo] Inbound ID ${inboundId} not found in database.`,
      );
      return { success: false, message: "Record not found." };
    }

    // --- STEP 2: PREPARE UPDATE CLAUSES ---
    const setClauses = [];
    const replacements = { inboundId: parseInt(inboundId) };

    for (const key in updateData) {
      // Map frontend keys to DB columns
      let dbColumnName;
      switch (key) {
        case "noOfBundle":
          dbColumnName = "noOfBundle";
          break;
        case "barcodeNo":
          dbColumnName = "barcodeNo";
          break;
        case "commodity":
          dbColumnName = "commodityId";
          break;
        case "brand":
          dbColumnName = "brandId";
          break;
        case "shape":
          dbColumnName = "shapeId";
          break;
        case "exLMEWarehouse":
          dbColumnName = "exLmeWarehouseId";
          break;
        case "exWarehouseLot":
          dbColumnName = "exWarehouseLot";
          break;
        case "exWarehouseWarrant":
          dbColumnName = "exWarehouseWarrant";
          break;
        case "exWarehouseLocation":
          dbColumnName = "exWarehouseLocationId";
          break;
        case "inboundWarehouse":
          dbColumnName = "inboundWarehouseId";
          break;
        case "grossWeight":
          dbColumnName = "grossWeight";
          break;
        case "netWeight":
          dbColumnName = "netWeight";
          break;
        case "actualWeight":
          dbColumnName = "actualWeight";
          break;
        case "isRelabelled":
          dbColumnName = "isRelabelled";
          break;
        case "isRebundled":
          dbColumnName = "isRebundled";
          break;
        case "isRepackProvided":
          dbColumnName = "isRepackProvided";
          break;
        default:
          console.warn(`[EditInfo] Unknown key skipped: ${key}`);
          continue;
      }

      // 1. Handle Lookup Fields (Foreign Keys) with "Find or Create"
      if (
        [
          "commodityId",
          "brandId",
          "shapeId",
          "exLmeWarehouseId",
          "exWarehouseLocationId",
          "inboundWarehouseId",
        ].includes(dbColumnName)
      ) {
        // [FIX]: If value is null/empty, set DB column to NULL directly
        if (
          !updateData[key] ||
          updateData[key] === "null" ||
          updateData[key] === ""
        ) {
          setClauses.push(`"${dbColumnName}" = NULL`);
          continue;
        }

        let lookupTable, lookupNameCol, lookupIdCol;
        switch (dbColumnName) {
          case "commodityId":
            lookupTable = "commodities";
            lookupNameCol = "commodityName";
            lookupIdCol = "commodityId";
            break;
          case "brandId":
            lookupTable = "brands";
            lookupNameCol = "brandName";
            lookupIdCol = "brandId";
            break;
          case "shapeId":
            lookupTable = "shapes";
            lookupNameCol = "shapeName";
            lookupIdCol = "shapeId";
            break;
          case "exLmeWarehouseId":
            lookupTable = "exlmewarehouses";
            lookupNameCol = "exLmeWarehouseName";
            lookupIdCol = "exLmeWarehouseId";
            break;
          case "exWarehouseLocationId":
            lookupTable = "exwarehouselocations";
            lookupNameCol = "exWarehouseLocationName";
            lookupIdCol = "exWarehouseLocationId";
            break;
          case "inboundWarehouseId":
            lookupTable = "inboundwarehouses";
            lookupNameCol = "inboundWarehouseName";
            lookupIdCol = "inboundWarehouseId";
            break;
        }

        // A. Try to find existing ID
        const lookupQuery = `SELECT "${lookupIdCol}" FROM public."${lookupTable}" WHERE "${lookupNameCol}" = :value LIMIT 1;`;
        const lookupResult = await db.sequelize.query(lookupQuery, {
          type: db.sequelize.QueryTypes.SELECT,
          replacements: { value: updateData[key] },
        });

        if (lookupResult.length > 0) {
          setClauses.push(`"${dbColumnName}" = :${key}_id`);
          replacements[`${key}_id`] = lookupResult[0][lookupIdCol];
        } else {
          // B. If not found, CREATE new record (Fixes "Others" Issue)
          console.log(
            `[EditInfo] Value '${updateData[key]}' not found in ${lookupTable}. Creating new entry...`,
          );

          try {
            const insertQuery = `
              INSERT INTO public."${lookupTable}" ("${lookupNameCol}", "createdAt", "updatedAt")
              VALUES (:value, NOW(), NOW())
              RETURNING "${lookupIdCol}";
            `;

            const insertResult = await db.sequelize.query(insertQuery, {
              type: db.sequelize.QueryTypes.INSERT,
              replacements: { value: updateData[key] },
            });

            // Retrieve the new ID safely
            // Sequelize return format for INSERT can vary: [[{ id: 1 }], 1] or similar
            const newId = insertResult[0][0][lookupIdCol];

            if (newId) {
              setClauses.push(`"${dbColumnName}" = :${key}_new_id`);
              replacements[`${key}_new_id`] = newId;
            } else {
              throw new Error("Failed to retrieve new ID after insert");
            }
          } catch (insertError) {
            console.error(
              `[EditInfo] Failed to create new ${key}:`,
              insertError,
            );
            // Skip updating this field if creation fails to prevent crashing the whole request
            continue;
          }
        }
      }
      // 2. Handle Boolean Fields
      else if (
        ["isRelabelled", "isRebundled", "isRepackProvided"].includes(
          dbColumnName,
        )
      ) {
        setClauses.push(`"${dbColumnName}" = :${key}`);
        replacements[key] = updateData[key] === "Yes";
      }
      // 3. Handle Simple Fields (Text/Number)
      else {
        setClauses.push(`"${dbColumnName}" = :${key}`);
        replacements[key] = updateData[key];
      }
    }

    if (setClauses.length === 0) {
      console.error("[EditInfo] No valid fields to update.");
      return { success: false, message: "No valid fields to update." };
    }

    const query = `
            UPDATE public.inbounds
            SET ${setClauses.join(", ")}, "updatedAt" = NOW()
            WHERE "inboundId" = :inboundId;
        `;

    console.log(`[EditInfo] Executing Update Query...`);
    const [results, metadata] = await db.sequelize.query(query, {
      replacements,
      type: db.sequelize.QueryTypes.UPDATE,
    });

    const affectedRows = metadata
      ? metadata.rowCount !== undefined
        ? metadata.rowCount
        : metadata
      : 0;
    console.log(`[EditInfo] Rows Affected: ${affectedRows}`);

    if (affectedRows > 0) {
      if (
        updateData.exWarehouseLot &&
        currentDataResult.jobNo &&
        currentDataResult.exWarehouseLot
      ) {
        // Only update if the value actually changed
        if (updateData.exWarehouseLot !== currentDataResult.exWarehouseLot) {
          try {
            const syncLotQuery = `
                  UPDATE public.lot
                  SET "exWarehouseLot" = :newExWarehouseLot, "updatedAt" = NOW()
                  WHERE "jobNo" = :jobNo AND "exWarehouseLot" = :oldExWarehouseLot;
              `;
            await db.sequelize.query(syncLotQuery, {
              replacements: {
                newExWarehouseLot: updateData.exWarehouseLot,
                jobNo: currentDataResult.jobNo,
                oldExWarehouseLot: currentDataResult.exWarehouseLot,
              },
              type: db.sequelize.QueryTypes.UPDATE,
            });
            console.log(`[EditInfo] Synced exWarehouseLot to 'lot' table.`);
          } catch (err) {
            console.error(`[EditInfo] Failed to sync 'lot' table:`, err);
          }
        }
      }

      // --- STEP 3: LOGGING ---
      if (currentDataResult) {
        const jobNo = currentDataResult.jobNo || "UnknownJob";
        const changes = [];
        for (const key in updateData) {
          const oldVal =
            currentDataResult[key] !== null
              ? String(currentDataResult[key])
              : "";
          const newVal =
            updateData[key] !== null ? String(updateData[key]) : "";
          if (oldVal !== newVal) {
            changes.push(key);
          }
        }

        await createEditLogEntry(
          jobNo,
          userId,
          "Edit Lot Information",
          {
            lotNo: currentDataResult.crewLotNo,
            fieldsChanged: changes,
          },
          {
            previousData: currentDataResult,
            updatedRequest: updateData,
          },
        );
      }

      return {
        success: true,
        message: "Lot information updated successfully.",
      };
    } else {
      return {
        success: false,
        message: "No rows updated. Data might be identical to existing record.",
      };
    }
  } catch (error) {
    console.error("Error in EditInformation:", error);
    throw error;
  }
};

const getLotsByJobNo = async (jobNo, brandName, shapeName, filters) => {
  // Accept brandName, shapeName, and filters
  try {
    const page = parseInt(filters.page, 10) || 1;
    const pageSize = parseInt(filters.pageSize, 10) || 100; // Default to a higher page size for this bulk action
    const offset = (page - 1) * pageSize;

    const whereClause = `
            WHERE
                i."jobNo" = :jobNo
                AND b."brandName" = :brandName
                AND s."shapeName" = :shapeName
                AND o."inboundId" IS NULL
                -- MODIFICATION: Ensure the lot is not in outboundtransactions
                AND ot."inboundId" IS NULL
        `;

    const baseQuery = `
            FROM
                public.inbounds i
            LEFT JOIN
                public.selectedInbounds o ON o."inboundId" = i."inboundId"
            -- MODIFICATION: Join with outboundtransactions to filter out processed lots
            LEFT JOIN
                public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
            JOIN
                public.commodities c ON i."commodityId" = c."commodityId"
            JOIN
                public.shapes s ON i."shapeId" = s."shapeId"
            LEFT JOIN
                public.brands b ON i."brandId" = b."brandId"
            LEFT JOIN
                public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
            LEFT JOIN
                public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
            LEFT JOIN
                public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
            ${whereClause}
        `;

    const countQuery = `SELECT COUNT(i."inboundId")::int AS "totalItems" ${baseQuery}`;

    const dataQuery = `
            SELECT
                i."inboundId" as id,
                i."jobNo" AS "JobNo",
                i."lotNo" AS "LotNo",
                i."crewLotNo",
                i."exWarehouseLot" AS "Ex-WarehouseLot",
                c."commodityName" AS "Metal",
                b."brandName" AS "Brand",
                s."shapeName" AS "Shape",
                i."noOfBundle" AS "Qty",
                i."netWeight" AS "Weight",
                exwhl."exWarehouseLocationName" AS "ExWarehouseLocation",
                exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
                iw."inboundWarehouseName" AS "InboundWarehouse"
            ${baseQuery}
            ORDER BY i."lotNo"
            LIMIT :pageSize OFFSET :offset;
        `;

    const replacements = { jobNo, brandName, shapeName, pageSize, offset };

    const [countResult, items] = await Promise.all([
      db.sequelize.query(countQuery, {
        replacements: { jobNo, brandName, shapeName },
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(dataQuery, {
        replacements,
        type: db.sequelize.QueryTypes.SELECT,
      }),
    ]);

    const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;

    return { items, totalItems };
  } catch (error) {
    console.error("Error fetching lots by job number and brand:", error);
    throw error;
  }
};

const getInventory1 = async () => {
  try {
    const query = `
            SELECT
                    i."jobNo" AS "Job No",
                    COUNT(i."lotNo") AS "Lot No",
                    c."commodityName" AS "Metal",
                    b."brandName" AS "Brand",
                    s."shapeName" AS "Shape",
                    SUM(i."noOfBundle") AS "Qty",
                    SUM(i."netWeight") AS "Weight"
                FROM
                    public.inbounds i
                LEFT JOIN
                    public.selectedInbounds o ON o."inboundId" = i."inboundId"
                LEFT JOIN
                    public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
                JOIN
                    public.brands b ON b."brandId" = i."brandId"
                JOIN
                    public.commodities c ON c."commodityId" = i."commodityId"
                JOIN
                    public.shapes s ON s."shapeId" = i."shapeId"
                WHERE
                    o."inboundId" IS NULL
                    AND ot."inboundId" IS NULL
                GROUP BY
                    i."jobNo", c."commodityName", b."brandName", s."shapeName"
                ORDER BY
                    i."jobNo"
        `;
    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching inventory records:", error);
    throw error;
  }
};

const getAllLotsForExport = async () => {
  try {
    const replacements = {};
    const dataQuery = `
        SELECT
            i."jobNo" AS "JobNo",
            i."crewLotNo" AS "LotNo",
            i."actualWeight",
            i."exWarehouseLot" AS "ExWarehouseLot",
            c."commodityName" AS "Metal",
            b."brandName" AS "Brand",
            s."shapeName" AS "Shape",
            i."noOfBundle" AS "Bundles",
            i."grossWeight" AS "GrossWeight",
            i."netWeight" AS "NetWeight",
            iw."inboundWarehouseName" AS "InboundWarehouse",
            TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'FMDD/FMMM/YYYY') AS "ReleaseDate"
        FROM public.inbounds i
        LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
        LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
        JOIN public.commodities c ON i."commodityId" = c."commodityId"
        JOIN public.shapes s ON i."shapeId" = s."shapeId"
        LEFT JOIN public.brands b ON i."brandId" = b."brandId"
        LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
        ORDER BY i."jobNo", i."crewLotNo" ASC;
    `;

    const items = await db.sequelize.query(dataQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      replacements,
    });

    return items; // Return the array of items directly
  } catch (error) {
    console.error("Error fetching lots for export:", error);
    throw error;
  }
};

/**
 * @description Retrieves all bundle details for a specific lot for the individual bundle sheet export.
 * @param {string} jobNo - The job number of the lot.
 * @param {number} lotNo - The lot number.
 * @param {string} exWarehouseLot - The ex-warehouse lot identifier.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of bundle objects for the specified lot.
 */
async function getIndividualBundleSheet(jobNo, exWarehouseLot) {
  const query = `
    SELECT 
      i."jobNo" As "ourReference", 
      c."commodityName", 
      s."shapeName", 
      b."brandName", 
      w."inboundWarehouseName",
      i."jobNo" || '-' || LPAD(i."crewLotNo"::text, 3, '0') AS "lotNoWarrantNo", 
      i."exWarehouseLot",
      ib."bundleNo" AS "bundleNo", 
      ib."meltNo" AS "heatCastNo",
      i."jobNo" || '-' || LPAD(i."crewLotNo"::text, 3, '0') || '-' || LPAD(ib."bundleNo"::text, 2, '0') AS "batchNo",
      ib."stickerWeight" AS "producerGW", 
      ib."stickerWeight" AS "producerNW", 
      ib."weight" AS "weighedGW"
    FROM inbounds i
    JOIN commodities c ON i."commodityId" = c."commodityId"
    JOIN shapes s ON i."shapeId" = s."shapeId"
    JOIN brands b ON i."brandId" = b."brandId"
    JOIN inboundwarehouses w ON i."inboundWarehouseId" = w."inboundWarehouseId"
    JOIN inboundbundles ib ON i."inboundId" = ib."inboundId"
    WHERE i."exWarehouseLot" = $1 AND i."jobNo" = $2
    ORDER BY ib."bundleNo" ASC;
  `;
  const replacements = [exWarehouseLot, jobNo];

  try {
    const bundles = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
      bind: replacements,
    });
    return bundles;
  } catch (error) {
    console.error("Error fetching individual bundle sheet:", error);
    throw error;
  }
}

const getUniqueExWarehouseLotsByJobNo = async (jobNo) => {
  try {
    const query = `
      SELECT DISTINCT i."exWarehouseLot",
       i."lotNo",
       i."crewLotNo",
       s."shapeName",
       c."commodityName",
       b."brandName",
       w."inboundWarehouseName"
FROM public.inbounds i
LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
JOIN public.shapes s ON s."shapeId" = i."shapeId"
JOIN public.commodities c ON c."commodityId" = i."commodityId"
JOIN public.brands b ON b."brandId" = i."brandId"
JOIN public.inboundwarehouses w ON w."inboundWarehouseId" = i."inboundWarehouseId"
WHERE i."jobNo" = :jobNo
  AND o."inboundId" IS NULL
  AND ot."inboundId" IS NULL
  AND i."exWarehouseLot" IS NOT NULL
ORDER BY i."crewLotNo" ASC;

    `;
    const results = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return results.map((result) => ({
      exWarehouseLot: result.exWarehouseLot,
      lotNo: result.lotNo,
      shapeName: result.shapeName,
      commodityName: result.commodityName,
      brandName: result.brandName,
      inboundWarehouseName: result.inboundWarehouseName,
    }));
  } catch (error) {
    console.error("Error fetching unique exWarehouseLots:", error);
    throw error;
  }
};
module.exports = {
  getAllStock,
  getLotDetails,
  getInventory,
  getFilterOptions,
  getLotSummary,
  createScheduleOutbound,
  EditInformation,
  getLotsByJobNo,
  getInventory1,
  getAllLotsForExport,
  getIndividualBundleSheet,
  getUniqueExWarehouseLotsByJobNo,
};
