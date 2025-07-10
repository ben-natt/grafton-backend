const db = require("../database");
//Display in inbound summary card
const getInboundSummary = async () => {
  try {
    const query = `
        SELECT 
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
//Display in outbound summary card
const getOutboundSummary = async () => {
  try {
    const query = `
          SELECT 
        o."commodity" AS "Metal",
        SUM(o."noOfBundle") AS "Bundles",
        COUNT(DISTINCT o."outboundTransactionId") AS "Lots",
        o."shape" AS "Shape",
        SUM(o."netWeight") AS "totalWeight"
        FROM 
            public.outboundtransactions o
        GROUP BY 
            o."commodity", o."shape"
        ORDER BY 
            o."commodity";
        `;
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
    let whereClauses = [];
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
      // Assuming brand filter can be a single value for now
      whereClauses.push(`b."brandName" ILIKE :brand`);
      replacements.brand = `%${filters.brand}%`;
    }
    if (filters.search) {
      whereClauses.push(`(
        i."jobNo" ILIKE :searchQuery OR
        i."lotNo" ILIKE :searchQuery OR
        c."commodityName" ILIKE :searchQuery OR
        b."brandName" ILIKE :searchQuery OR
        s."shapeName" ILIKE :searchQuery OR
        u."username" ILIKE :searchQuery
      )`);
      replacements.searchQuery = `%${filters.search}%`;
    }

    const whereString =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const baseQuery = `
        FROM 
            public.inbounds i 
        JOIN 
            public.brands b ON b."brandId" = i."brandId"
        JOIN 
            public.commodities c ON c."commodityId" = i."commodityId"
        JOIN 
            public.shapes s ON s."shapeId" = i."shapeId"
        JOIN 
            public.users u ON u.userid = i."userId"
        ${whereString}
    `;

    const countQuery = `SELECT COUNT(i."inboundId")::int ${baseQuery}`;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;

    const dataQuery = `
        SELECT 
            i."inboundId" as id,
            TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
            i."jobNo" AS "Job No",
            i."lotNo" AS "Lot No",
            i."exWarehouseLot" AS "Ex-W Lot",
            c."commodityName" AS "Metal",
            b."brandName" AS "Brand",
            s."shapeName" AS "Shape",
            i."noOfBundle" AS "Qty", 
            u."username" AS "Scheduled By"
        ${baseQuery}
        ORDER BY i."inboundDate" DESC
        LIMIT :limit OFFSET :offset;
    `;
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
    let whereClauses = [];
    const replacements = { limit: pageSize, offset };

    // Build WHERE clause from filters
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
      whereClauses.push(`o."brands" ILIKE :brand`);
      replacements.brand = `%${filters.brand}%`;
    }
    if (filters.search) {
      whereClauses.push(`(
                o."jobNo" ILIKE :searchQuery OR
                o."lotNo" ILIKE :searchQuery OR
                o."commodity" ILIKE :searchQuery OR
                o."brands" ILIKE :searchQuery OR
                o."shape" ILIKE :searchQuery OR
                u."username" ILIKE :searchQuery
            )`);
      replacements.searchQuery = `%${filters.search}%`;
    }

    const whereString =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const baseQuery = `
            FROM 
                public.outboundtransactions o
            LEFT JOIN
                public.scheduleoutbounds so ON so."scheduleOutboundId" = o."scheduleOutboundId"
            LEFT JOIN 
                public.users u ON u.userid = so."userId"
            ${whereString}
        `;

    const countQuery = `SELECT COUNT(o."outboundTransactionId")::int ${baseQuery}`;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;

    const dataQuery = `
            SELECT 
                o."outboundTransactionId" AS id,
                TO_CHAR(o."updatedAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                o."jobNo" AS "Job No",
                o."lotNo" AS "Lot No",
                o."exWarehouseLot" AS "Ex-W Lot",
                o."commodity" AS "Metal",
                o."brands" AS "Brand",
                o."shape" AS "Shape",
                o."noOfBundle" AS "Qty",
                u."username" AS "Scheduled By"
            ${baseQuery}
            ORDER BY o."outboundedDate" DESC
            LIMIT :limit OFFSET :offset;
        `;
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
    const brandsQuery =
      'SELECT DISTINCT "brandName" FROM public.brands WHERE "brandName" IS NOT NULL ORDER BY "brandName";';
    const shapesQuery =
      'SELECT DISTINCT "shapeName" FROM public.shapes WHERE "shapeName" IS NOT NULL ORDER BY "shapeName";';
    const commoditiesQuery =
      'SELECT DISTINCT "commodityName" FROM public.commodities WHERE "commodityName" IS NOT NULL ORDER BY "commodityName";';
    const jobNosQuery =
      'SELECT DISTINCT "jobNo" FROM public.inbounds WHERE "jobNo" IS NOT NULL ORDER BY "jobNo";';

    const [brands, shapes, commodities, jobNos] = await Promise.all([
      db.sequelize.query(brandsQuery, { type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(shapesQuery, { type: db.sequelize.QueryTypes.SELECT }),
      db.sequelize.query(commoditiesQuery, {
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(jobNosQuery, { type: db.sequelize.QueryTypes.SELECT }),
    ]);
    if (!brands || !shapes || !commodities || !jobNos) {
      throw new Error("Failed to fetch filter options");
    }

    return {
      brands: brands.map((item) => item.brandName),
      shapes: shapes.map((item) => item.shapeName),
      commodities: commodities.map((item) => item.commodityName),
      jobNos: jobNos.map((item) => item.jobNo),
    };
  } catch (error) {
    console.error("Error fetching filter options:", error);
    throw error;
  }
};

// MODIFICATION: Added 'ProcessedBy' user and ensured all fields are present.
const getInboundRecordByInboundId = async (inboundId) => {
  try {
    const query = `
            SELECT
                i."jobNo" AS "JobNo", i."lotNo" AS "LotNo", i."noOfBundle" AS "NoOfBundle",
                i."inboundId", i."barcodeNo" AS "Barcode", c."commodityName" AS "Commodity", b."brandName" AS "Brand",
                s."shapeName" AS "Shape", exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
                i."exWarehouseLot" AS "ExWarehouseLot", i."exWarehouseWarrant" AS "ExWarehouseWarrant",
                exwhl."exWarehouseLocationName" AS "ExWarehouseLocation", iw."inboundWarehouseName" AS "InboundWarehouse",
                i."inboundDate" AS "InboundDate", i."scheduleInboundDate" AS "ScheduleInboundDate",
                i."grossWeight" AS "GrossWeight", i."netWeight" AS "NetWeight", i."actualWeight" AS "ActualWeight",
                i."isRebundled" AS "IsRebundled", i."isRepackProvided" AS "IsRepackProvided",
                u_scheduler."username" AS "ScheduledBy",
                -- Assuming there is no 'processedBy' for inbound, returning NULL
                NULL AS "ProcessedBy",
                i."updatedAt" AS "UpdatedAt"
            FROM public.inbounds i
            LEFT JOIN public.brands b ON b."brandId" = i."brandId"
            LEFT JOIN public.commodities c ON c."commodityId" = i."commodityId"
            LEFT JOIN public.shapes s ON s."shapeId" = i."shapeId"
            LEFT JOIN public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
            LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
            LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
            LEFT JOIN public.users u_scheduler ON u_scheduler.userid = i."userId"
            WHERE i."inboundId" = :inboundId
            LIMIT 1;
        `;

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

// MODIFICATION: Corrected user joins to fetch both scheduler and processor.
const getOutboundRecordByOutboundId = async (outboundId) => {
  try {
    const query = `
           SELECT
                o."jobNo" AS "JobNo", o."lotNo" AS "LotNo", o."noOfBundle" AS "NoOfBundle",o."lotReleaseWeight" AS "LotReleaseWeight",
                o."outboundTransactionId", o."commodity" AS "Commodity", o."brands" AS "Brand",
                o."shape" AS "Shape", o."exLmeWarehouse" AS "ExLMEWarehouse",
                o."exWarehouseLot" AS "ExWarehouseLot", o."releaseWarehouse" AS "ReleaseWarehouse",
                so."releaseDate" AS "ReleaseDate", so."createdAt" AS "ScheduleOutboundDate",
                o."exportDate" AS "ExportDate", o."deliveyDate" AS "DeliveryDate",
                o."netWeight" AS "TotalReleaseWeight",
                o."storageReleaseLocation" AS "StorageReleaseLocation", o."transportVendor" AS "TransportVendor",
                scheduler."username" AS "ScheduledBy",
                processor."username" AS "ProcessedBy",
                o."updatedAt" AS "UpdatedAt"
            FROM public.outboundtransactions o
            LEFT JOIN public.scheduleoutbounds so ON so."scheduleOutboundId" = o."scheduleOutboundId"
            LEFT JOIN public.users scheduler ON scheduler.userid = so."userId"
            LEFT JOIN public.users processor ON processor.userid = o."outboundedBy"
            WHERE o."outboundTransactionId" = :outboundId
            LIMIT 1;
        `;

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

const getAllScheduleInbound = async () => {
  try {
    const query = `
            SELECT
             l."lotId" AS id,
             TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
             l."jobNo" AS "Job No",
             l."lotNo" AS "Lot No",
             l."exWarehouseLot" AS  "Ex-W Lot",
        l."commodity" AS "Metal",
        l."brand"  AS "Brand",
        l."shape"  AS "Shape",
        l."expectedBundleCount" AS "Qty", 
        u."username" AS "Scheduled By"
            from public.lot l 
            JOIN public.scheduleinbounds i ON l."scheduleInboundId" = i."scheduleInboundId"
            LEFT JOIN public.users u ON i."userId" = u.userid
        ORDER BY i."inboundDate" DESC

        `;
    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching all schedule inbound records:", error);
    throw error;
  }
};

const getAllScheduleOutbound = async () => {
  try {
    const query = `
            SELECT TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
        si."inboundId" AS id,
		i."jobNo" AS "Job No",
        i."lotNo" AS "Lot No",
		i."exWarehouseLot" AS  "Ex-W Lot",
		c."commodityName" AS "Metal",
		b."brandName"  AS "Brand",
		s."shapeName" AS "Shape",
		i."noOfBundle" AS "Qty",
		u."username" AS "Scheduled By"
		FROM public.scheduleoutbounds o JOIN public.selectedinbounds si
		ON o."scheduleOutboundId" = si."scheduleOutboundId"
		LEFT JOIN public.inbounds i on si."inboundId" = i."inboundId"
		LEFT JOIN public.commodities c on i."commodityId" = c."commodityId"
		LEFT JOIN public.brands b on i."brandId" = b."brandId"
		LEFT JOIN public.shapes s on i."shapeId" = s."shapeId"
		LEFT JOIN public.users u ON o."userId" = u.userid
        ORDER BY o."releaseDate" DESC
        `;
    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching all schedule outbound records:", error);
    throw error;
  }
};

// MODIFICATION: Added 'ProcessedBy' user and ensured all fields are present.
const getScheduleInboundRecordByLotId = async (lotId) => {
  try {
    const query = `
           SELECT
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
    TO_CHAR(si."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "InboundDate",
    TO_CHAR(si."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ScheduleInboundDate",
    l."grossWeight" AS "GrossWeight",
    l."netWeight" AS "NetWeight",
    l."actualWeight" AS "ActualWeight",
    u."username" AS "ScheduledBy",
    NULL AS "ProcessedBy",
    TO_CHAR(l."updatedAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD hh12:mi AM') AS "UpdatedAt"
    FROM public.lot l
    LEFT JOIN public.scheduleinbounds si ON si."scheduleInboundId" = l."scheduleInboundId"
    LEFT JOIN public.users u ON u.userid = si."userId"
    WHERE l."lotId" = :lotId
    LIMIT 1;
        `;

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

const getScheduleOutboundRecordById = async (id) => {
  try {
    const query = `
          SELECT
                i."jobNo" AS "JobNo", 
				i."lotNo" AS "LotNo", 
				i."noOfBundle" AS "NoOfBundle",
				so."lotReleaseWeight" AS "LotReleaseWeight",
                i."inboundId", 
				c."commodityName" AS "Commodity", 
				b."brandName" AS "Brand",
                s."shapeName" AS "Shape", 
				exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
                i."exWarehouseLot" AS "ExWarehouseLot",
				i."exWarehouseWarrant" AS "ExWarehouseWarrant",
				so."releaseWarehouse" AS "ReleaseWarehouse",
				TO_CHAR(so."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ScheduleOutboundDate",
				TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ReleaseDate",
				TO_CHAR(so."exportDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ExportDate",
				TO_CHAR(so."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DeliveryDate",
				i."netWeight" AS "TotalReleaseWeight",
				so."storageReleaseLocation" AS "StorageReleaseLocation",
				so."transportVendor" AS "TransportVendor",
				scheduler."username" AS "ScheduledBy",
				TO_CHAR(so."updatedAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD hh12:mi AM') AS "UpdatedAt"
			FROM public.selectedinbounds selin
			LEFT JOIN public.inbounds i ON i."inboundId" = selin."inboundId"
            LEFT JOIN public.brands b ON b."brandId" = i."brandId"
            LEFT JOIN public.commodities c ON c."commodityId" = i."commodityId"
            LEFT JOIN public.shapes s ON s."shapeId" = i."shapeId"
            LEFT JOIN public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
			LEFT JOIN public.scheduleoutbounds so ON so."scheduleOutboundId" = selin."scheduleOutboundId"
            LEFT JOIN public.users scheduler ON scheduler.userid = so."userId"
            
            WHERE selin."inboundId" = :id
            LIMIT 1;
        `;

    const result = await db.sequelize.query(query, {
      replacements: { id },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching outbound record by outboundId:", error);
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
  getAllScheduleInbound,
  getAllScheduleOutbound,
  getScheduleInboundRecordByLotId,
  getScheduleOutboundRecordById,
};
