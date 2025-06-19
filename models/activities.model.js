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
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 2, '0') AS "Lot No",
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
                TO_CHAR(o."outboundedDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                o."jobNo" || ' - ' || LPAD(o."lotNo"::text, 2, '0') AS "Lot No",
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


module.exports = {
    getInboundSummary,
    getOutboundSummary,
    getInboundRecord,
    getOutboundRecord,
    getFilterOptions
};  