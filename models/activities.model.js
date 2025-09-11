const db = require("../database");

//Display in inbound summary card
const getInboundSummary = async () => {
  try {
    const query = `SELECT 
        c."commodityName" AS "Metal",
        SUM(i."noOfBundle") AS "Bundles",
        COUNT(DISTINCT i."inboundId") AS "Lots",
        s."shapeName" AS "Shape",
        SUM(i."netWeight") AS "totalWeight"
      FROM 
        public.inbounds i
      JOIN 
        public.commodities c ON i."commodityId" = c."commodityId"
      JOIN 
        public.shapes s ON i."shapeId" = s."shapeId"
      WHERE i."inboundDate" IS NOT NULL
      GROUP BY 
        c."commodityName", s."shapeName"
      ORDER BY 
        c."commodityName";`;

    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching all stock records:", error);
    throw error;
  }
};
//Display in outbound summary card
const getOutboundSummary = async () => {
  try {
    const query = `SELECT 
        o."commodity" AS "Metal",
        SUM(o."noOfBundle") AS "Bundles",
        COUNT(DISTINCT o."outboundTransactionId") AS "Lots",
        o."shape" AS "Shape",
        SUM(o."netWeight") AS "totalWeight"
      FROM 
        public.outboundtransactions o
      LEFT JOIN 
        public.inbounds i ON o."inboundId" = i."inboundId"
      WHERE o."releaseDate" IS NOT NULL
      GROUP BY 
        o."commodity", o."shape"
      ORDER BY 
        o."commodity";`;
    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching all outbounded records:", error);
    throw error;
  }
};

const getInboundRecord = async ({ page = 1, pageSize = 25, filters = {} }) => {
  try {
    const offset = (page - 1) * pageSize;
    let whereClauses = ['i."inboundDate" IS NOT NULL']; // Base condition
    const replacements = { limit: pageSize, offset };

    // Build WHERE clause from filters
    if (filters.commodity) {
      whereClauses.push(`c."commodityName" ILIKE :commodity`);
      replacements.commodity = `%${filters.commodity}%`;
    }
    if (filters.shape) {
      whereClauses.push(`s."shapeName" ILIKE :shape`);
      replacements.shape = `%${filters.shape}%`;
    }
    if (filters.jobNo) {
      whereClauses.push(`i."jobNo" ILIKE :jobNo`);
      replacements.jobNo = `%${filters.jobNo}%`;
    }
    if (filters.brand) {
      const brands = filters.brand.split(",").map((b) => b.trim());
      const brandClauses = brands.map(
        (_, index) => `b."brandName" ILIKE :brand${index}`
      );
      whereClauses.push(`(${brandClauses.join(" OR ")})`);
      brands.forEach((brand, index) => {
        replacements[`brand${index}`] = `%${brand}%`;
      });
    }
    if (filters.startDate && filters.endDate) {
      whereClauses.push(
        `i."inboundDate"::date BETWEEN :startDate::date AND :endDate::date`
      );
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }
    if (filters.quantity) {
      whereClauses.push(`i."noOfBundle" = :quantity`);
      replacements.quantity = parseInt(filters.quantity, 10);
    }
    if (filters.inboundWarehouse) {
      whereClauses.push(`iw."inboundWarehouseName" ILIKE :inboundWarehouse`);
      replacements.inboundWarehouse = `%${filters.inboundWarehouse}%`;
    }
    if (filters.exWarehouseLocation) {
      whereClauses.push(
        `exwhl."exWarehouseLocationName" ILIKE :exWarehouseLocation`
      );
      replacements.exWarehouseLocation = `%${filters.exWarehouseLocation}%`;
    }
    if (filters.exLmeWarehouse) {
      whereClauses.push(`exlme."exLmeWarehouseName" ILIKE :exLmeWarehouse`);
      replacements.exLmeWarehouse = `%${filters.exLmeWarehouse}%`;
    }

    if (filters.search) {
      whereClauses.push(`(
        CAST(i."inboundId" AS TEXT) ILIKE :searchQuery OR
        i."jobNo" ILIKE :searchQuery OR
        CAST(i."lotNo" AS TEXT) ILIKE :searchQuery OR
        CAST(i."noOfBundle" AS TEXT) ILIKE :searchQuery OR
        c."commodityName" ILIKE :searchQuery OR
        b."brandName" ILIKE :searchQuery OR
        s."shapeName" ILIKE :searchQuery OR
        CAST(i."grossWeight" AS TEXT) ILIKE :searchQuery OR
        CAST(i."netWeight" AS TEXT) ILIKE :searchQuery OR
        CAST(i."actualWeight" AS TEXT) ILIKE :searchQuery OR
        exlme."exLmeWarehouseName" ILIKE :searchQuery OR
        i."exWarehouseLot" ILIKE :searchQuery OR
        i."exWarehouseWarrant" ILIKE :searchQuery OR
        exwhl."exWarehouseLocationName" ILIKE :searchQuery OR
        iw."inboundWarehouseName" ILIKE :searchQuery OR
        u_scheduled."username" ILIKE :searchQuery OR
        u_processed."username" ILIKE :searchQuery
      )`);
      replacements.searchQuery = `%${filters.search}%`;
    }

    const whereString =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const sortableColumns = {
      Date: 'i."inboundDate"',
      "Job No": 'i."jobNo"',
      "Lot No": 'i."lotNo"',
      "Ex-W Lot": 'i."exWarehouseLot"',
      Metal: 'c."commodityName"',
      Brand: 'b."brandName"',
      Shape: 's."shapeName"',
      BDL: 'i."noOfBundle"',
      "Scheduled By": 'u_scheduled."username"',
    };

    let orderByClause = 'ORDER BY i."inboundDate" DESC NULLS LAST';
    if (filters.sortBy && sortableColumns[filters.sortBy]) {
      const sortColumn = sortableColumns[filters.sortBy];
      const sortOrder = filters.sortOrder === "DESC" ? "DESC" : "ASC";
      orderByClause = `ORDER BY ${sortColumn} ${sortOrder} NULLS LAST`;
    }

    const baseQuery = `FROM 
        public.inbounds i 
      LEFT JOIN 
        public.brands b ON b."brandId" = i."brandId"
      LEFT JOIN 
        public.commodities c ON c."commodityId" = i."commodityId"
      LEFT JOIN 
        public.shapes s ON s."shapeId" = i."shapeId"
      LEFT JOIN 
        public.users u_scheduled ON u_scheduled.userid = i."userId"
      LEFT JOIN
        public.users u_processed ON u_processed.userid = i."processedId"
      LEFT JOIN 
        public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
      LEFT JOIN 
        public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
      LEFT JOIN 
        public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
      ${whereString}`;

    const countQuery = `SELECT COUNT(i."inboundId")::int ${baseQuery}`;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;

    const dataQuery = `SELECT 
        i."inboundId" as id,
        TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
        i."jobNo" AS "Job No",
        i."lotNo" AS "Lot No",
        i."exWarehouseLot" AS "Ex-W Lot",
        c."commodityName" AS "Metal",
        b."brandName" AS "Brand",
        s."shapeName" AS "Shape",
        i."noOfBundle" AS "Qty", 
        u_scheduled."username" AS "Scheduled By",
        u_processed."username" AS "Processed By"
      ${baseQuery}
      ${orderByClause}
      LIMIT :limit OFFSET :offset;`;
    const data = await db.sequelize.query(dataQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    return { totalCount, data };
  } catch (error) {
    console.error("Error fetching paginated inbound records:", error);
    throw error;
  }
};

const getOutboundRecord = async ({ page = 1, pageSize = 10, filters = {} }) => {
  try {
    const offset = (page - 1) * pageSize;
    let whereClauses = ['o."releaseDate" IS NOT NULL'];
    const replacements = { limit: pageSize, offset };

    if (filters.commodity) {
      whereClauses.push(`o."commodity" ILIKE :commodity`);
      replacements.commodity = `%${filters.commodity}%`;
    }
    if (filters.shape) {
      whereClauses.push(`o."shape" ILIKE :shape`);
      replacements.shape = `%${filters.shape}%`;
    }
    if (filters.jobNo) {
      whereClauses.push(`o."jobNo" ILIKE :jobNo`);
      replacements.jobNo = `%${filters.jobNo}%`;
    }
    if (filters.brand) {
      const brands = filters.brand.split(",");
      const brandClauses = brands.map((brand, index) => {
        const key = `brand${index}`;
        replacements[key] = `%${brand}%`;
        return `o."brands" ILIKE :${key}`;
      });
      whereClauses.push(`(${brandClauses.join(" OR ")})`);
    }
    if (filters.startDate && filters.endDate) {
      whereClauses.push(
        `o."releaseDate"::date BETWEEN :startDate::date AND :endDate::date`
      );
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }
    if (filters.quantity) {
      whereClauses.push(`o."noOfBundle" = :quantity`);
      replacements.quantity = parseInt(filters.quantity, 10);
    }
    if (filters.inboundWarehouse) {
      whereClauses.push(`o."inboundWarehouse" ILIKE :inboundWarehouse`);
      replacements.inboundWarehouse = `%${filters.inboundWarehouse}%`;
    }
    if (filters.exWarehouseLocation) {
      whereClauses.push(`o."exWarehouseLocation" ILIKE :exWarehouseLocation`);
      replacements.exWarehouseLocation = `%${filters.exWarehouseLocation}%`;
    }
    if (filters.exLmeWarehouse) {
      whereClauses.push(`o."exLmeWarehouse" ILIKE :exLmeWarehouse`);
      replacements.exLmeWarehouse = `%${filters.exLmeWarehouse}%`;
    }

    if (filters.search) {
      whereClauses.push(`(
        o."jobNo" ILIKE :searchQuery OR
        CAST(o."lotNo" AS TEXT) ILIKE :searchQuery OR
        CAST(o."noOfBundle" AS TEXT) ILIKE :searchQuery OR
        o."commodity" ILIKE :searchQuery OR
        o."brands" ILIKE :searchQuery OR
        o."shape" ILIKE :searchQuery OR
        CAST(o."actualWeight" AS TEXT) ILIKE :searchQuery OR
        o."exLmeWarehouse" ILIKE :searchQuery OR
        o."exWarehouseLot" ILIKE :searchQuery OR
        o."releaseWarehouse" ILIKE :searchQuery OR
        o."storageReleaseLocation" ILIKE :searchQuery OR
        o."transportVendor" ILIKE :searchQuery OR
        u_scheduled."username" ILIKE :searchQuery OR
        u_processed."username" ILIKE :searchQuery
      )`);
      replacements.searchQuery = `%${filters.search}%`;
    }

    const whereString =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const sortableColumns = {
      Date: 'o."releaseDate"',
      "Job No": 'o."jobNo"',
      "Lot No": 'o."lotNo"',
      "Ex-W Lot": 'o."exWarehouseLot"',
      Metal: 'o."commodity"',
      Brand: 'o."brands"',
      Shape: 'o."shape"',
      BDL: 'o."noOfBundle"',
      "Scheduled By": 'u_scheduled."username"',
    };

    let orderByClause = 'ORDER BY o."releaseDate" DESC NULLS LAST';
    if (filters.sortBy && sortableColumns[filters.sortBy]) {
      const sortColumn = sortableColumns[filters.sortBy];
      const sortOrder = filters.sortOrder === "DESC" ? "DESC" : "ASC";
      orderByClause = `ORDER BY ${sortColumn} ${sortOrder} NULLS LAST`;
    }

    const baseQuery = `FROM 
          public.outboundtransactions o
        LEFT JOIN
          public.users u_scheduled ON u_scheduled.userid = o."scheduledBy"
        LEFT JOIN
          public.users u_processed ON u_processed.userid = o."outboundedBy"
        ${whereString}`;

    const countQuery = `SELECT COUNT(o."outboundTransactionId")::int ${baseQuery}`;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;

    const dataQuery = `SELECT 
        o."outboundTransactionId" AS id,
        TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
        o."jobNo" AS "Job No",
        o."lotNo" AS "Lot No",
        o."exWarehouseLot" AS "Ex-W Lot",
        o."commodity" AS "Metal",
        o."brands" AS "Brand",
        o."shape" AS "Shape",
        o."noOfBundle" AS "Qty",
        u_scheduled."username" AS "Scheduled By",
        u_processed."username" AS "Processed By"
      ${baseQuery}
      ${orderByClause}
      LIMIT :limit OFFSET :offset;`;
    const data = await db.sequelize.query(dataQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    return { totalCount, data };
  } catch (error) {
    console.error("Error fetching paginated outbound records:", error);
    throw error;
  }
};

const getFilterOptions = async () => {
  try {
    const brandsQuery = `
      SELECT "brandName" FROM (
          SELECT DISTINCT b."brandName"
          FROM public.inbounds i
          JOIN public.brands b ON i."brandId" = b."brandId"
          WHERE i."inboundDate" IS NOT NULL AND b."brandName" IS NOT NULL
          UNION
          SELECT DISTINCT trim(unnest(string_to_array(o.brands, ','))) AS "brandName"
          FROM public.outboundtransactions o
          WHERE o."releaseDate" IS NOT NULL AND o.brands IS NOT NULL AND o.brands != ''
      ) AS all_brands
      WHERE "brandName" IS NOT NULL AND "brandName" != ''
      ORDER BY "brandName";
    `;

    const shapesQuery = `
      SELECT "shapeName" FROM (
          SELECT DISTINCT s."shapeName"
          FROM public.inbounds i
          JOIN public.shapes s ON i."shapeId" = s."shapeId"
          WHERE i."inboundDate" IS NOT NULL AND s."shapeName" IS NOT NULL
          UNION
          SELECT DISTINCT o."shape" AS "shapeName"
          FROM public.outboundtransactions o
          WHERE o."releaseDate" IS NOT NULL AND o."shape" IS NOT NULL
      ) AS all_shapes
      WHERE "shapeName" IS NOT NULL
      ORDER BY "shapeName";
    `;

    const commoditiesQuery = `
      SELECT "commodityName" FROM (
          SELECT DISTINCT c."commodityName"
          FROM public.inbounds i
          JOIN public.commodities c ON i."commodityId" = c."commodityId"
          WHERE i."inboundDate" IS NOT NULL AND c."commodityName" IS NOT NULL
          UNION
          SELECT DISTINCT o."commodity" AS "commodityName"
          FROM public.outboundtransactions o
          WHERE o."releaseDate" IS NOT NULL AND o."commodity" IS NOT NULL
      ) AS all_commodities
      WHERE "commodityName" IS NOT NULL
      ORDER BY "commodityName";
    `;

    const jobNosQuery = `
      SELECT "jobNo" FROM (
          SELECT "jobNo" FROM public.inbounds WHERE "jobNo" IS NOT NULL AND "inboundDate" IS NOT NULL
          UNION
          SELECT "jobNo" FROM public.outboundtransactions WHERE "jobNo" IS NOT NULL AND "releaseDate" IS NOT NULL
      ) AS all_jobs
      WHERE "jobNo" IS NOT NULL
      ORDER BY "jobNo";
    `;

    const inboundWarehousesQuery = `
      SELECT DISTINCT iw."inboundWarehouseName"
      FROM public.inbounds i
      JOIN public.inboundwarehouses iw ON i."inboundWarehouseId" = iw."inboundWarehouseId"
      WHERE i."inboundDate" IS NOT NULL AND iw."inboundWarehouseName" IS NOT NULL
      ORDER BY iw."inboundWarehouseName";
    `;

    const exWarehouseLocationsQuery = `
      SELECT "exWarehouseLocationName" FROM (
          SELECT DISTINCT exwhl."exWarehouseLocationName"
          FROM public.inbounds i
          JOIN public.exwarehouselocations exwhl ON i."exWarehouseLocationId" = exwhl."exWarehouseLocationId"
          WHERE i."inboundDate" IS NOT NULL AND exwhl."exWarehouseLocationName" IS NOT NULL
          UNION
          SELECT DISTINCT o."exWarehouseLocation" AS "exWarehouseLocationName"
          FROM public.outboundtransactions o
          WHERE o."releaseDate" IS NOT NULL AND o."exWarehouseLocation" IS NOT NULL AND o."exWarehouseLocation" != ''
      ) AS all_locations
      WHERE "exWarehouseLocationName" IS NOT NULL
      ORDER BY "exWarehouseLocationName";
    `;

    const exLmeWarehousesQuery = `
      SELECT "exLmeWarehouseName" FROM (
          SELECT DISTINCT exlme."exLmeWarehouseName"
          FROM public.inbounds i
          JOIN public.exlmewarehouses exlme ON i."exLmeWarehouseId" = exlme."exLmeWarehouseId"
          WHERE i."inboundDate" IS NOT NULL AND exlme."exLmeWarehouseName" IS NOT NULL
          UNION
          SELECT DISTINCT o."exLmeWarehouse" AS "exLmeWarehouseName"
          FROM public.outboundtransactions o
          WHERE o."releaseDate" IS NOT NULL AND o."exLmeWarehouse" IS NOT NULL AND o."exLmeWarehouse" != ''
      ) AS all_lme
      WHERE "exLmeWarehouseName" IS NOT NULL
      ORDER BY "exLmeWarehouseName";
    `;

    const [
      brands,
      shapes,
      commodities,
      jobNos,
      inboundWarehouses,
      exWarehouseLocations,
      exLmeWarehouses,
    ] = await Promise.all([
      db.sequelize.query(brandsQuery, { type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(shapesQuery, { type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(commoditiesQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(jobNosQuery, { type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(inboundWarehousesQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(exWarehouseLocationsQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(exLmeWarehousesQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
    ]);
    if (
      !brands ||
      !shapes ||
      !commodities ||
      !jobNos ||
      !inboundWarehouses ||
      !exWarehouseLocations ||
      !exLmeWarehouses
    ) {
      throw new Error("Failed to fetch filter options");
    }

    return {
      brands: brands.map((item) => item.brandName),
      shapes: shapes.map((item) => item.shapeName),
      commodities: commodities.map((item) => item.commodityName),
      jobNos: jobNos.map((item) => item.jobNo),
      inboundWarehouses: inboundWarehouses.map(
        (item) => item.inboundWarehouseName
      ),
      exWarehouseLocations: exWarehouseLocations.map(
        (item) => item.exWarehouseLocationName
      ),
      exLmeWarehouses: exLmeWarehouses.map((item) => item.exLmeWarehouseName),
    };
  } catch (error) {
    console.error("Error fetching filter options:", error);
    throw error;
  }
};

const getInboundRecordByInboundId = async (inboundId) => {
  try {
    const query = `SELECT
          i."jobNo" AS "JobNo", i."lotNo" AS "LotNo", i."noOfBundle" AS "NoOfBundle",
          i."inboundId", i."barcodeNo" AS "Barcode", c."commodityName" AS "Commodity", b."brandName" AS "Brand",
          s."shapeName" AS "Shape", exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
          i."exWarehouseLot" AS "ExWarehouseLot", i."exWarehouseWarrant" AS "ExWarehouseWarrant",
          exwhl."exWarehouseLocationName" AS "ExWarehouseLocation", iw."inboundWarehouseName" AS "InboundWarehouse",
          l."inbounddate" AS "InboundDate", si."createdAt" AS "ScheduleInboundDate", i."updatedAt" AS "CreatedAt",
          i."grossWeight" AS "GrossWeight", i."netWeight" AS "NetWeight", i."actualWeight" AS "ActualWeight",
          i."isRebundled" AS "IsRebundled", i."isRepackProvided" AS "IsRepackProvided",
          u_scheduler."username" AS "ScheduledBy",
          u_processor."username" AS "ProcessedBy",
          i."updatedAt" AS "UpdatedAt"
        FROM public.inbounds i
        LEFT JOIN public.lot l ON l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
        LEFT JOIN public.scheduleinbounds si ON si."scheduleInboundId" = l."scheduleInboundId"
        LEFT JOIN public.brands b ON b."brandId" = i."brandId"
        LEFT JOIN public.commodities c ON c."commodityId" = i."commodityId"
        LEFT JOIN public.shapes s ON s."shapeId" = i."shapeId"
        LEFT JOIN public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
        LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
        LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
        LEFT JOIN public.users u_scheduler ON u_scheduler.userid = i."userId"
        LEFT JOIN public.users u_processor ON u_processor.userid = i."processedId"
        WHERE i."inboundId" = :inboundId
        LIMIT 1;`;

    const result = await db.sequelize.query(query, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching inbound record by inboundId:", error);
    throw error;
  }
};

const getOutboundRecordByOutboundId = async (outboundId) => {
  try {
    const query = `SELECT
          o."jobNo" AS "JobNo", o."lotNo" AS "LotNo", o."noOfBundle" AS "NoOfBundle",
          o."actualWeight" AS "ActualWeight",
          o."grossWeight" AS "GrossWeight",
          o."outboundTransactionId", o."commodity" AS "Commodity", o."brands" AS "Brand",
          o."shape" AS "Shape", o."exLmeWarehouse" AS "ExLMEWarehouse",
          o."exWarehouseLot" AS "ExWarehouseLot", o."releaseWarehouse" AS "ReleaseWarehouse",
          si."releaseDate" AS "ReleaseDate",
          si."releaseEndDate" AS "ReleaseEndDate", 
          so."createdAt" AS "ScheduleOutboundDate",
          so."containerNo" AS "ContainerNo",
          so."sealNo" AS "SealNo",
          si."exportDate" AS "ExportDate", si."deliveryDate" AS "DeliveryDate",
          o."stuffingDate" AS "StuffingDate",
          o."createdAt" AS "CreatedAt",
          o."lotReleaseWeight" AS "TotalReleaseWeight",
          o."storageReleaseLocation" AS "StorageReleaseLocation", o."transportVendor" AS "TransportVendor",
          scheduler."username" AS "ScheduledBy",
          processor."username" AS "ProcessedBy",
          o."updatedAt" AS "UpdatedAt",
          -- NEW FIELDS FROM outbounds table
          ob."tareWeight" AS "TareWeight",
          ob.uom AS "UOM",
          o."outboundId" as "OutboundId", -- Expose outboundId to fetch photos
          (
          SELECT COUNT(*) 
          FROM public.outboundtransactions 
          WHERE "outboundId" = o."outboundId"
        ) AS "TotalLotsToRelease"
        FROM public.outboundtransactions o
        LEFT JOIN public.outbounds ob ON o."outboundId" = ob."outboundId" -- NEW JOIN
        LEFT JOIN public.users scheduler ON scheduler.userid = o."scheduledBy"
        LEFT JOIN public.users processor ON processor.userid = o."outboundedBy"
        LEFT JOIN public.selectedinbounds si ON si."inboundId" = o."inboundId"
        LEFT JOIN public.scheduleoutbounds so ON so."scheduleOutboundId" = si."scheduleOutboundId"
        WHERE o."outboundTransactionId" = :outboundId
        LIMIT 1;`;

    const result = await db.sequelize.query(query, {
      replacements: { outboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching outbound record by outboundId:", error);
    throw error;
  }
};

const getStuffingPhotosByOutboundId = async (outboundId) => {
  try {
    const query = `
      SELECT "imageUrl"
      FROM public.stuffing_photos
      WHERE "outboundId" = :outboundId
      ORDER BY "createdAt" ASC;
    `;
    const results = await db.sequelize.query(query, {
      replacements: { outboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return results.map((row) => row.imageUrl);
  } catch (error) {
    console.error("Error fetching stuffing photos by outboundId:", error);
    throw error;
  }
};

////////////////////////////////////////////////////////////////////////////////
////////////      Scheduled Inbound Activities Details Page    ////////////////
////////////////////////////////////////////////////////////////////////////////
const getAllScheduleInbound = async ({
  filters = {},
  page = 1,
  pageSize = 25,
}) => {
  try {
    let whereClauses = [];
    const replacements = {};

    if (filters.commodity) {
      whereClauses.push(`l."commodity" ILIKE :commodity`);
      replacements.commodity = `%${filters.commodity}%`;
    }
    if (filters.shape) {
      whereClauses.push(`l."shape" ILIKE :shape`);
      replacements.shape = `%${filters.shape}%`;
    }
    if (filters.jobNo) {
      whereClauses.push(`l."jobNo" ILIKE :jobNo`);
      replacements.jobNo = `%${filters.jobNo}%`;
    }
    if (filters.brand) {
      const brands = filters.brand.split(",").map((b) => b.trim());
      const brandClauses = brands.map(
        (_, index) => `l."brand" ILIKE :brand${index}`
      );
      whereClauses.push(`(${brandClauses.join(" OR ")})`);
      brands.forEach((brand, index) => {
        replacements[`brand${index}`] = `%${brand}%`;
      });
    }
    if (filters.startDate && filters.endDate) {
      whereClauses.push(
        `(l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate::date AND :endDate::date`
      );
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }
    if (filters.quantity) {
      whereClauses.push(`l."expectedBundleCount" = :quantity`);
      replacements.quantity = parseInt(filters.quantity, 10);
    }
    if (filters.inboundWarehouse) {
      whereClauses.push(`l."inboundWarehouse" ILIKE :inboundWarehouse`);
      replacements.inboundWarehouse = `%${filters.inboundWarehouse}%`;
    }
    if (filters.exWarehouseLocation) {
      whereClauses.push(`l."exWarehouseLocation" ILIKE :exWarehouseLocation`);
      replacements.exWarehouseLocation = `%${filters.exWarehouseLocation}%`;
    }
    if (filters.exLmeWarehouse) {
      whereClauses.push(`l."exLmeWarehouse" ILIKE :exLmeWarehouse`);
      replacements.exLmeWarehouse = `%${filters.exLmeWarehouse}%`;
    }
    if (filters.search) {
      whereClauses.push(`(
        l."jobNo" ILIKE :searchQuery OR
        CAST(l."lotNo" AS TEXT) ILIKE :searchQuery OR
        CAST(l."expectedBundleCount" AS TEXT) ILIKE :searchQuery OR
        l."commodity" ILIKE :searchQuery OR
        l."brand" ILIKE :searchQuery OR
        l."shape" ILIKE :searchQuery OR
        l."exLmeWarehouse" ILIKE :searchQuery OR
        l."exWarehouseLot" ILIKE :searchQuery OR
        l."exWarehouseWarrant" ILIKE :searchQuery OR
        l."exWarehouseLocation" ILIKE :searchQuery OR
        l."inboundWarehouse" ILIKE :searchQuery OR
        CAST(l."grossWeight" AS TEXT) ILIKE :searchQuery OR
        CAST(l."netWeight" AS TEXT) ILIKE :searchQuery OR
        CAST(l."actualWeight" AS TEXT) ILIKE :searchQuery OR
        u1."username" ILIKE :searchQuery OR
        u2."username" ILIKE :searchQuery
      )`);
      replacements.searchQuery = `%${filters.search}%`;
    }

    const whereString =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // --- SORTING LOGIC --- (remains the same)
    const sortableColumns = {
      Date: 'l."inbounddate"',
      "Job No.": 'l."jobNo"',
      "Lot No.": 'l."lotNo"',
      "Ex-Whse Lot": 'l."exWarehouseLot"',
      Metal: 'l."commodity"',
      Brand: 'l."brand"',
      Shape: 'l."shape"',
      BDL: 'l."expectedBundleCount"',
      "Scheduled By": 'u1."username"',
    };

    let orderByClause = 'ORDER BY l."inbounddate" DESC NULLS LAST'; // Default sort
    if (filters.sortBy && sortableColumns[filters.sortBy]) {
      const sortColumn = sortableColumns[filters.sortBy];
      const sortOrder = filters.sortOrder === "DESC" ? "DESC" : "ASC";
      orderByClause = `ORDER BY ${sortColumn} ${sortOrder} NULLS LAST`;
    }

    // NEW: Pagination Logic
    const limit = parseInt(pageSize, 10);
    const offset = (page - 1) * limit;
    const paginationClause = `LIMIT :limit OFFSET :offset`;
    replacements.limit = limit;
    replacements.offset = offset;

    // NEW: Query for total count
    const countQuery = `SELECT COUNT(*) FROM public.lot l 
                        JOIN public.scheduleinbounds si ON l."scheduleInboundId" = si."scheduleInboundId"
                        LEFT JOIN public.inbounds i ON i."jobNo" = l."jobNo" AND i."lotNo" = l."lotNo"
                        LEFT JOIN public.users u1 ON si."userId" = u1.userid
                        LEFT JOIN public.users u2 ON u2.userid = i."processedId"
                        ${whereString}`;

    const totalResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    const total = parseInt(totalResult[0].count, 10);

    // MODIFIED: Data query with pagination
    const dataQuery = `SELECT
                      l."lotId" AS id,
                      TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                      l."jobNo" AS "Job No",
                      l."lotNo" AS "Lot No",
                      l."exWarehouseLot" AS "Ex-W Lot",
                      l."exLmeWarehouse" AS "exLmeWarehouse",
                      l."commodity" AS "Metal",
                      l."brand" AS "Brand",
                      l."shape" AS "Shape",
                      l."expectedBundleCount" AS "Qty", 
                      l."isRepackProvided", 
                      l."isRebundled",
                      u1."username" AS "Scheduled By",
                      u2."username" AS "Processed By"
                    FROM public.lot l 
                    JOIN public.scheduleinbounds si ON l."scheduleInboundId" = si."scheduleInboundId"
                     LEFT JOIN public.inbounds i ON i."jobNo" = l."jobNo" AND i."lotNo" = l."lotNo"
                    LEFT JOIN public.users u1 ON si."userId" = u1.userid
                   
                    LEFT JOIN public.users u2 ON u2.userid = i."processedId"
                    ${whereString}
                    ${orderByClause}
                    ${paginationClause}`;

    const data = await db.sequelize.query(dataQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    return { data, total };
  } catch (error) {
    console.error("Error fetching all schedule inbound records:", error);
    throw error;
  }
};

////////////////////////////////////////////////////////////////////////////////
////////////      Scheduled Outbound Activities Page    ////////////////
////////////////////////////////////////////////////////////////////////////////
const getAllScheduleOutbound = async ({
  filters = {},
  page = 1,
  pageSize = 25,
}) => {
  try {
    let whereClauses = [];
    const replacements = {};

    if (filters.commodity) {
      whereClauses.push(`c."commodityName" ILIKE :commodity`);
      replacements.commodity = `%${filters.commodity}%`;
    }
    if (filters.shape) {
      whereClauses.push(`s."shapeName" ILIKE :shape`);
      replacements.shape = `%${filters.shape}%`;
    }
    if (filters.jobNo) {
      whereClauses.push(`i."jobNo" ILIKE :jobNo`);
      replacements.jobNo = `%${filters.jobNo}%`;
    }
    if (filters.brand) {
      const brands = filters.brand.split(",").map((b) => b.trim());
      const brandClauses = brands.map(
        (_, index) => `b."brandName" ILIKE :brand${index}`
      );
      whereClauses.push(`(${brandClauses.join(" OR ")})`);
      brands.forEach((brand, index) => {
        replacements[`brand${index}`] = `%${brand}%`;
      });
    }
    if (filters.startDate && filters.endDate) {
      whereClauses.push(`
          (si."releaseDate" AT TIME ZONE 'Asia/Singapore')::date <= :endDate::date
          AND
          (si."releaseEndDate" AT TIME ZONE 'Asia/Singapore')::date >= :startDate::date
        `);
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }
    if (filters.quantity) {
      whereClauses.push(`i."noOfBundle" = :quantity`);
      replacements.quantity = parseInt(filters.quantity, 10);
    }
    if (filters.inboundWarehouse) {
      whereClauses.push(`iw."inboundWarehouseName" ILIKE :inboundWarehouse`);
      replacements.inboundWarehouse = `%${filters.inboundWarehouse}%`;
    }
    if (filters.exWarehouseLocation) {
      whereClauses.push(
        `exwhl."exWarehouseLocationName" ILIKE :exWarehouseLocation`
      );
      replacements.exWarehouseLocation = `%${filters.exWarehouseLocation}%`;
    }
    if (filters.exLmeWarehouse) {
      whereClauses.push(`exlme."exLmeWarehouseName" ILIKE :exLmeWarehouse`);
      replacements.exLmeWarehouse = `%${filters.exLmeWarehouse}%`;
    }

    if (filters.search) {
      whereClauses.push(`(
        i."jobNo" ILIKE :searchQuery OR
        CAST(i."lotNo" AS TEXT) ILIKE :searchQuery OR
        CAST(i."noOfBundle" AS TEXT) ILIKE :searchQuery OR
        c."commodityName" ILIKE :searchQuery OR
        b."brandName" ILIKE :searchQuery OR
        s."shapeName" ILIKE :searchQuery OR
        exlme."exLmeWarehouseName" ILIKE :searchQuery OR
        i."exWarehouseLot" ILIKE :searchQuery OR
        o."releaseWarehouse" ILIKE :searchQuery OR
        CAST(o."lotReleaseWeight" AS TEXT) ILIKE :searchQuery OR
        o."storageReleaseLocation" ILIKE :searchQuery OR
        o."transportVendor" ILIKE :searchQuery OR
        u1."username" ILIKE :searchQuery OR
        u2."username" ILIKE :searchQuery
      )`);
      replacements.searchQuery = `%${filters.search}%`;
    }

    const whereString =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const sortableColumns = {
      Date: 'si."releaseDate"',
      "Job No.": 'i."jobNo"', // FIX: Added sort key for Job No.
      "Lot No.": 'i."lotNo"',
      "Ex-Whse Lot": 'i."exWarehouseLot"',
      Metal: 'c."commodityName"',
      Brand: 'b."brandName"',
      Shape: 's."shapeName"',
      BDL: 'i."noOfBundle"',
      "Scheduled By": 'u1."username"',
    };

    let orderByClause = 'ORDER BY si."releaseDate" DESC NULLS LAST'; // Default sort
    if (filters.sortBy && sortableColumns[filters.sortBy]) {
      const sortColumn = sortableColumns[filters.sortBy];
      const sortOrder = filters.sortOrder === "DESC" ? "DESC" : "ASC";
      orderByClause = `ORDER BY ${sortColumn} ${sortOrder} NULLS LAST`;
    }

    const limit = parseInt(pageSize, 10);
    const offset = (page - 1) * limit;
    replacements.limit = limit;
    replacements.offset = offset;

    const fromAndJoins = `FROM public.scheduleoutbounds o 
      JOIN public.selectedinbounds si ON o."scheduleOutboundId" = si."scheduleOutboundId"
      LEFT JOIN public.inbounds i on si."inboundId" = i."inboundId"
      LEFT JOIN public.commodities c on i."commodityId" = c."commodityId"
      LEFT JOIN public.brands b on i."brandId" = b."brandId"
      LEFT JOIN public.shapes s on i."shapeId" = s."shapeId"
      LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
      LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
      LEFT JOIN public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
      LEFT JOIN public.users u1 ON o."userId" = u1.userid
      LEFT JOIN public.outboundtransactions ot ON si."inboundId" = ot."inboundId"
      LEFT JOIN public.users u2 ON u2.userid = ot."outboundedBy"`;

    const countQuery = `SELECT COUNT(DISTINCT si."inboundId") ${fromAndJoins} ${whereString}`;

    const totalResult = await db.sequelize.query(countQuery, {
      replacements: { ...replacements }, // Use a copy to avoid mutation by sequelize
      type: db.sequelize.QueryTypes.SELECT,
    });
    const total = parseInt(totalResult[0].count, 10);

    const dataQuery = `SELECT 
        TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
        TO_CHAR(si."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ReleaseEndDate",
        si."inboundId" AS id,
        i."jobNo" AS "Job No",
        i."lotNo" AS "Lot No",
        i."exWarehouseLot" AS "Ex-W Lot",
        exlme."exLmeWarehouseName" AS "exLmeWarehouse",
        c."commodityName" AS "Metal",
        b."brandName" AS "Brand",
        s."shapeName" AS "Shape",
        i."noOfBundle" AS "Qty",
        u1."username" AS "Scheduled By",
        u2."username" AS "Processed By"
      ${fromAndJoins}
      ${whereString}
      ${orderByClause}
      LIMIT :limit OFFSET :offset`;

    const data = await db.sequelize.query(dataQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    return { data, total };
  } catch (error) {
    console.error("Error fetching all schedule outbound records:", error);
    throw error;
  }
};

////////////////////////////////////////////////////////////////////////////////
////////////      Scheduled Inbound Activities Details Page    ////////////////
////////////////////////////////////////////////////////////////////////////////
const getScheduleInboundRecordByLotId = async (lotId) => {
  try {
    const query = `SELECT
          l."jobNo" AS "JobNo",
          l."lotNo" AS "LotNo",
          l."expectedBundleCount" AS "NoOfBundle",
          l."lotId",
          l."commodity" AS "Commodity",
          l."brand" AS "Brand",
          l."shape" AS "Shape",
          l."exLmeWarehouse" AS "ExLMEWarehouse",
          l."exWarehouseLot" AS "ExWarehouseLot",
          l."exWarehouseWarrant" AS "ExWarehouseWarrant",
          l."exWarehouseLocation" AS "ExWarehouseLocation",
          l."inboundWarehouse" AS "InboundWarehouse",
          i."createdAt" AS "InboundDate",
          si."createdAt" AS "ScheduleInboundDate",
          l."grossWeight" AS "GrossWeight",
          l."netWeight" AS "NetWeight",
          l."actualWeight" AS "ActualWeight",
          l."isRepackProvided" AS "IsRepackProvided", 
          l."isRebundled" AS "IsRebundled",
          u1."username" AS "ScheduledBy",
          u2."username" AS "ProcessedBy",
          TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD hh12:mi AM') AS "UpdatedAt",
          TO_CHAR(i."updatedAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD hh12:mi AM') AS "UpdatedAt1",
          TO_CHAR(si."updatedAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD hh12:mi AM') AS "UpdatedAt2"
        FROM public.lot l
        LEFT JOIN public.scheduleinbounds si ON si."scheduleInboundId" = l."scheduleInboundId"
        LEFT JOIN public.inbounds i on i."jobNo" = l."jobNo" AND i."lotNo" = l."lotNo"
        LEFT JOIN public.users u1 ON u1.userid = si."userId"
        LEFT JOIN public.users u2 ON u2.userid = i."processedId"
        WHERE l."lotId" = :lotId
        LIMIT 1;`;

    const result = await db.sequelize.query(query, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching inbound record by lotId:", error);
    throw error;
  }
};

////////////////////////////////////////////////////////////////////////////////
////////////      Scheduled Outbound Activities Details Page    ////////////////
////////////////////////////////////////////////////////////////////////////////
const getScheduleOutboundRecordById = async (id) => {
  try {
    const query = `SELECT
        i."jobNo" AS "JobNo", 
        i."lotNo" AS "LotNo", 
        i."noOfBundle" AS "NoOfBundle",
        so."lotReleaseWeight" AS "LotReleaseWeight",
        i."inboundId", 
        c."commodityName" AS "Commodity", 
        b."brandName" AS "Brand",
        s."shapeName" AS "Shape",
        CASE WHEN i."isWeighted" = true THEN i."actualWeight" ELSE i."netWeight" END AS "GrossWeight", 
        exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
        i."exWarehouseLot" AS "ExWarehouseLot",
        i."exWarehouseWarrant" AS "ExWarehouseWarrant",
        so."releaseWarehouse" AS "ReleaseWarehouse",
        TO_CHAR(so."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ScheduleOutboundDate",
        TO_CHAR(selin."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ReleaseDate",
        TO_CHAR(selin."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ReleaseEndDate",
        TO_CHAR(selin."exportDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ExportDate",
        TO_CHAR(so."stuffingDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "StuffingDate",
        TO_CHAR(selin."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DeliveryDate",
        i."netWeight" AS "TotalReleaseWeight",
        so."storageReleaseLocation" AS "StorageReleaseLocation",
        so."transportVendor" AS "TransportVendor",
        so."containerNo" AS "ContainerNo",
        so."sealNo" AS "SealNo",
        scheduler."username" AS "ScheduledBy",
        processor."username" AS "ProcessedBy",
        TO_CHAR(selin."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD hh12:mi AM') AS "UpdatedAt",
        TO_CHAR(ot."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD hh12:mi AM') AS "UpdatedAt1",
        TO_CHAR(so."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD hh12:mi AM') AS "UpdatedAt2",
        
        (
          SELECT COUNT(*)
          FROM public.selectedinbounds si2
          WHERE si2."scheduleOutboundId" = selin."scheduleOutboundId"
        ) AS "TotalLots"
        
      FROM public.selectedinbounds selin
      LEFT JOIN public.inbounds i ON i."inboundId" = selin."inboundId"
      LEFT JOIN public.brands b ON b."brandId" = i."brandId"
      LEFT JOIN public.commodities c ON c."commodityId" = i."commodityId"
      LEFT JOIN public.shapes s ON s."shapeId" = i."shapeId"
      LEFT JOIN public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
      LEFT JOIN public.scheduleoutbounds so ON so."scheduleOutboundId" = selin."scheduleOutboundId"
      LEFT JOIN public.users scheduler ON scheduler.userid = so."userId"
      LEFT JOIN public.outboundtransactions ot ON selin."inboundId" = ot."inboundId"
      LEFT JOIN public.users processor ON processor.userid = ot."outboundedBy"
      WHERE selin."inboundId" = :id
      LIMIT 1;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { id },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching schedule outbound record by id:", error);
    throw error;
  }
};

module.exports = {
  getInboundSummary,
  getOutboundSummary,
  getInboundRecord,
  getOutboundRecord,
  getFilterOptions,
  getInboundRecordByInboundId,
  getOutboundRecordByOutboundId,
  getStuffingPhotosByOutboundId,
  getAllScheduleInbound,
  getAllScheduleOutbound,
  getScheduleInboundRecordByLotId,
  getScheduleOutboundRecordById,
};
