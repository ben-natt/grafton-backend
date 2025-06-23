const db = require('../database');
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
        LEFT JOIN 
            public.outboundtransactions o ON o."inboundId" = i."inboundId"
        JOIN 
            public.commodities c ON i."commodityId" = c."commodityId"
        JOIN 
            public.shapes s ON i."shapeId" = s."shapeId"
        WHERE 
            o."inboundId" IS NULL
        GROUP BY 
            c."commodityName", s."shapeName"
        ORDER BY 
            c."commodityName";
        `;

        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });

        return result;
    } catch (error) {
        console.error('Error fetching all stock records:', error);
        throw error;
    }
};
//Display in outbound summary card
const getOutboundSummary = async () =>{
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
            type: db.sequelize.QueryTypes.SELECT
        });

        return result;
    } catch (error) {
        console.error('Error fetching all outbounded records:', error);
        throw error;
    }
}


const getInboundRecord = async () => {
    try {
        const query = `
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
            WHERE 
                i."inboundDate" IS NOT NULL 
            ORDER BY 
                i."inboundId" limit 100
        `;
        
      const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });

        return result;
    } catch (error) {
        console.error('Error fetching all inbound records:', error);
        throw error;
    }
};

const getOutboundRecord = async () => {
    try {
        const query = `
            SELECT 
                o."outboundTransactionId" AS id,
                TO_CHAR(o."outboundedDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                o."jobNo" AS "Job No",
                o."lotNo" AS "Lot No",
                o."exWarehouseLot" AS  "Ex-W Lot",
                o."commodity" AS "Metal",
                o."brands"  AS "Brand",
                o."shape" AS "Shape",
                o."noOfBundle" AS "Qty",
                u."username" AS "Scheduled By"
            FROM 
                public.outboundtransactions o
            LEFT JOIN 
                public.users u ON o."scheduledBy" = u.userid
            LIMIT 100
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });

        return result;
    } catch (error) {
        console.error('Error fetching all scheduled outbound records:', error);
        throw error;
    }
};

const getFilterOptions = async () => {
    try {
        const brandsQuery = 'SELECT DISTINCT "brandName" FROM public.brands WHERE "brandName" IS NOT NULL ORDER BY "brandName";';
        const shapesQuery = 'SELECT DISTINCT "shapeName" FROM public.shapes WHERE "shapeName" IS NOT NULL ORDER BY "shapeName";';
        const commoditiesQuery = 'SELECT DISTINCT "commodityName" FROM public.commodities WHERE "commodityName" IS NOT NULL ORDER BY "commodityName";';
        const jobNosQuery = 'SELECT DISTINCT "jobNo" FROM public.inbounds WHERE "jobNo" IS NOT NULL ORDER BY "jobNo";';

        const [brands, shapes, commodities, jobNos] = await Promise.all([
            db.sequelize.query(brandsQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(shapesQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(commoditiesQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(jobNosQuery, { type: db.sequelize.QueryTypes.SELECT }),
        ]);
        if (!brands || !shapes || !commodities || !jobNos) {
            throw new Error('Failed to fetch filter options');
        }

        return {
            brands: brands.map(item => item.brandName),
            shapes: shapes.map(item => item.shapeName),
            commodities: commodities.map(item => item.commodityName),
            jobNos: jobNos.map(item => item.jobNo),
        };
    } catch (error) {
        console.error('Error fetching filter options:', error);
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
            type: db.sequelize.QueryTypes.SELECT
        });

        return result;
    } catch (error) {
        console.error('Error fetching inbound record by inboundId:', error);
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
            LEFT JOIN public.users scheduler ON scheduler.userid = o."scheduledBy"
            LEFT JOIN public.users processor ON processor.userid = o."outboundedBy"
            WHERE o."outboundTransactionId" = :outboundId
            LIMIT 1;
        `;

        const result = await db.sequelize.query(query, {
            replacements: { outboundId },
            type: db.sequelize.QueryTypes.SELECT
        });

        return result;
    } catch (error) {
        console.error('Error fetching outbound record by outboundId:', error);
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
    getOutboundRecordByOutboundId
};  