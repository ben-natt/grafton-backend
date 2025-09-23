const db = require('../database');

const getAllInbound = async () => {
    try {
        const query = `
            SELECT 
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 2, '0') AS "Lot No",
                i."inboundId" AS "inboundId",
                i."exWarehouseLot" AS "Ex-W Lot",
                c."commodityName" AS "Metal",
                b."brandName" AS "Brand",
                s."shapeName" AS "Shape",
                i."noOfBundle" AS "Qty", 
                u1."username" AS "Scheduled By",
                u2."username" AS "Processed By"
            FROM 
                public.inbounds i 
            JOIN 
                public.brands b ON b."brandId" = i."brandId"
            JOIN 
                public.commodities c ON c."commodityId" = i."commodityId"
            JOIN 
                public.shapes s ON s."shapeId" = i."shapeId"
            JOIN 
                public.users u1 ON u1.userid = i."userId"
            LEFT JOIN
                public.users u2 ON u2.userid = i."processedId"
            WHERE 
                i."inboundDate" IS NOT NULL
            ORDER BY 
                i."inboundId" limit 200
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


const getInboundByDate = async (date) => {
    try {
        // Ensure the date format matches 'YYYY-MM-DD' as sent from Flutter
        const query = `
            SELECT
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 2, '0') AS "Lot No",
                i."inboundId" AS "inboundId",
                i."exWarehouseLot" AS "Ex-W Lot",
                c."commodityName" AS "Metal",
                b."brandName" AS "Brand",
                s."shapeName" AS "Shape",
                i."noOfBundle" AS "Qty",
                u1."username" AS "Scheduled By",
                u2."username" AS "Processed By"
            FROM
                public.inbounds i
            JOIN
                public.brands b ON b."brandId" = i."brandId"
            JOIN
                public.commodities c ON c."commodityId" = i."commodityId"
            JOIN
                public.shapes s ON s."shapeId" = i."shapeId"
            JOIN
                public.users u1 ON u1.userid = i."userId"
            LEFT JOIN
                public.users u2 ON u2.userid = i."processedId"
            WHERE
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') = :date
            ORDER BY
                i."inboundId" limit 200
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { date }
        });
        return result;
    } catch (error) {
        console.error(`Error fetching inbound records for date ${date}:`, error);
        throw error;
    }
};


const getInboundByDateRange = async (startDate, endDate) => {
    try {
        const query = `
            SELECT
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 2, '0') AS "Lot No",
                i."inboundId" AS "inboundId",
                i."exWarehouseLot" AS "Ex-W Lot",
                c."commodityName" AS "Metal",
                b."brandName" AS "Brand",
                s."shapeName" AS "Shape",
                i."noOfBundle" AS "Qty",
                u1."username" AS "Scheduled By",
                u2."username" AS "Processed By"
            FROM
                public.inbounds i
            JOIN
                public.brands b ON b."brandId" = i."brandId"
            JOIN
                public.commodities c ON c."commodityId" = i."commodityId"
            JOIN
                public.shapes s ON s."shapeId" = i."shapeId"
            JOIN
                public.users u1 ON u1.userid = i."userId"
            LEFT JOIN
                public.users u2 ON u2.userid = i."processedId"
            WHERE
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN :startDate AND :endDate
            ORDER BY
                i."inboundId" LIMIT 200
        `;

        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { startDate, endDate }
        });

        return result;
    } catch (error) {
        console.error(`Error fetching inbound records for date range ${startDate} to ${endDate}:`, error);
        throw error;
    }
};

// For getUpcomingInbound
const getUpcomingInbound = async () => {
    try {
        const query = `
            SELECT COUNT(*) AS "upcomingInbound"
            FROM public.lot
            WHERE status IN ('Pending')
        `;

        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });

        // Handle case where result might be empty
        if (!result || result.length === 0) {
            console.log('No upcoming inbound records found!');
            return 0;
        }

        return result[0].upcomingInbound || 0;
    } catch (error) {
        console.error('Error fetching upcoming inbound records:', error);
        throw error;
    }
};
const getInventory = async () => {
    try {
        const query = `
            SELECT 
                c."commodityName", 
                COUNT(*) AS count
            FROM 
                public.inbounds i
             LEFT JOIN 
            public.selectedInbounds o ON o."inboundId" = i."inboundId"
            LEFT JOIN
            public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
            JOIN 
                public.commodities c ON i."commodityId" = c."commodityId"
            WHERE 
                o."inboundId" IS NULL
            AND ot."inboundId" IS NULL
            GROUP BY 
                c."commodityName";
        `;

        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });
        return result;
    } catch (error) {
        console.error('Error fetching inventory records:', error);
        throw error;
    }
};

const getAllScheduleInbound = async () => {
    try {
        const query = `
          select  
          TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
		l."jobNo" || ' - ' || LPAD(l."lotNo"::text, 3, '0') AS "Lot No",
        l."lotId",
		l."exWarehouseLot" AS  "Ex-W Lot",
		l."commodity" AS "Metal",
		l."brand"  AS "Brand",
		l."shape"  AS "Shape",
		l."expectedBundleCount" AS "Qty", 
        l."exWarehouseWarrant" AS "Warrant",
        l."exWarehouseLocation" AS "Ex-W Location",
        l."exLmeWarehouse" AS "Ex-LME Warehouse",
        l."netWeight" AS "Net Weight",
        l."grossWeight" AS "Gross Weight",
        l."actualWeight" AS "Actual Weight",
        l."inboundWarehouse" AS "Inbound Warehouse",
        l."isRepackProvided", 
        l."isRebundled",
        TO_CHAR(si."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ScheduleInboundDate",
        TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Inbound Date",
        TO_CHAR(i."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Inbounded Date",
		u1."username" AS "Scheduled By",
        u2."username" AS "Processed By"
         FROM public.lot l
        JOIN public.scheduleinbounds si ON l."scheduleInboundId" = si."scheduleInboundId"
        LEFT JOIN public.inbounds i ON i."jobNo" = l."jobNo" AND i."lotNo" = l."lotNo"
        LEFT JOIN public.users u1 ON u1."userid" = si."userId"
        LEFT JOIN public.users u2 ON u2."userid" = i."processedId"
        WHERE l."isConfirm" = false
        ORDER BY
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD')

        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });

        return result;
    } catch (error) {
        console.error('Error fetching all schedule inbound records:', error);
        throw error;
    }
};

const getScheduleInboundByDate = async (date) => {
    try {
        const query = `
            SELECT
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                l."jobNo" || ' - ' || LPAD(l."lotNo"::text, 3, '0') AS "Lot No",
                l."lotId",
                l."exWarehouseLot" AS "Ex-W Lot",
                l."commodity" AS "Metal",
                l."brand" AS "Brand",
                l."shape" AS "Shape",
                l."expectedBundleCount" AS "Qty",
                l."exWarehouseWarrant" AS "Warrant",
                l."exWarehouseLocation" AS "Ex-W Location",
                l."exLmeWarehouse" AS "Ex-LME Warehouse",
                l."netWeight" AS "Net Weight",
                l."grossWeight" AS "Gross Weight",
                l."actualWeight" AS "Actual Weight",
                l."inboundWarehouse" AS "Inbound Warehouse",
                l."isRepackProvided", 
                l."isRebundled",
                 TO_CHAR(si."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ScheduleInboundDate",
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Inbound Date",
                TO_CHAR(i."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Inbounded Date",
                u1."username" AS "Scheduled By",
                u2."username" AS "Processed By"             
           FROM public.lot l 
            JOIN public.scheduleinbounds si ON l."scheduleInboundId" = si."scheduleInboundId"
            LEFT JOIN public.inbounds i 
            ON i."jobNo" = l."jobNo" AND i."lotNo" = l."lotNo"
            LEFT JOIN public.users u1 ON u1."userid" = si."userId"
            LEFT JOIN public.users u2 ON u2."userid" = i."processedId"
            WHERE
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') = :date
            AND l."isConfirm" = false
            ORDER BY
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD')
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { date }
        });
        return result;
    } catch (error) {
        console.error(`Error fetching schedule inbound records for date ${date}:`, error);
        throw error;
    }
};

const getScheduleInboundByDateRange = async (startDate, endDate) => {
    try {
        const query = `
            SELECT
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                l."jobNo" || ' - ' || LPAD(l."lotNo"::text, 3, '0') AS "Lot No",
                l."lotId",
                l."exWarehouseLot" AS "Ex-W Lot",
                l."commodity" AS "Metal",
                l."brand" AS "Brand",
                l."shape" AS "Shape",
                l."expectedBundleCount" AS "Qty",
                l."exWarehouseWarrant" AS "Warrant",
                l."exWarehouseLocation" AS "Ex-W Location",
                l."exLmeWarehouse" AS "Ex-LME Warehouse",
                l."netWeight" AS "Net Weight",
                l."grossWeight" AS "Gross Weight",
                l."actualWeight" AS "Actual Weight",
                l."inboundWarehouse" AS "Inbound Warehouse",
                l."isRepackProvided", 
                l."isRebundled",
               TO_CHAR(si."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ScheduleInboundDate",
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Inbound Date",
                TO_CHAR(i."createdAt" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Inbounded Date",
                u1."username" AS "Scheduled By",
                u2."username" AS "Processed By"
            FROM public.lot l 
                JOIN public.scheduleinbounds si ON l."scheduleInboundId" = si."scheduleInboundId"
                LEFT JOIN public.inbounds i 
                ON i."jobNo" = l."jobNo" AND i."lotNo" = l."lotNo"
                LEFT JOIN public.users u1 ON u1."userid" = si."userId"
                LEFT JOIN public.users u2 ON u2."userid" = i."processedId"
            WHERE
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN :startDate AND :endDate
            AND l."isConfirm" = false
            ORDER BY
                TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD')
        `;

        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { startDate, endDate }
        });

        return result;
    } catch (error) {
        console.error(`Error fetching schedule inbound records for date range ${startDate} to ${endDate}:`, error);
        throw error;
    }
};



module.exports = {
    getAllInbound,
    getInventory,
    getInboundByDate,
    getInboundByDateRange,
    getUpcomingInbound,
    getAllScheduleInbound,
    getScheduleInboundByDate,
    getScheduleInboundByDateRange
};