const db = require('../database');

const getAllInbound = async () => {
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
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN $1 AND $2
            ORDER BY
                i."inboundId" LIMIT 200
        `;
        
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            bind: [startDate, endDate] // Use bind instead of replacements for $1, $2 syntax
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
            JOIN 
                public.commodities c ON i."commodityId" = c."commodityId"
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
          TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
		l."jobNo" || ' - ' || LPAD(l."lotNo"::text, 2, '0') AS "Lot No",
		l."exWarehouseLot" AS  "Ex-W Lot",
		l."commodity" AS "Metal",
		l."brand"  AS "Brand",
		l."shape"  AS "Shape",
		l."expectedBundleCount" AS "Qty", 
		u."username" AS "Scheduled By"
            from public.lot l 
            JOIN public.scheduleinbounds i ON l."scheduleInboundId" = i."scheduleInboundId"
            LEFT JOIN public.users u ON i."userId" = u.userid

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
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                l."jobNo" || ' - ' || LPAD(l."lotNo"::text, 2, '0') AS "Lot No",
                l."exWarehouseLot" AS "Ex-W Lot",
                l."commodity" AS "Metal",
                l."brand" AS "Brand",
                l."shape" AS "Shape",
                l."expectedBundleCount" AS "Qty",
                u."username" AS "Scheduled By"
               
            FROM
                public.lot l
            JOIN
                public.scheduleinbounds i ON l."scheduleInboundId" = i."scheduleInboundId"
            LEFT JOIN
                public.users u ON i."userId" = u.userid
            WHERE
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') = :date
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
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                l."jobNo" || ' - ' || LPAD(l."lotNo"::text, 2, '0') AS "Lot No",
                l."exWarehouseLot" AS "Ex-W Lot",
                l."commodity" AS "Metal",
                l."brand" AS "Brand",
                l."shape" AS "Shape",
                l."expectedBundleCount" AS "Qty",
                u."username" AS "Scheduled By"
            FROM
                public.lot l
            JOIN
                public.scheduleinbounds i ON l."scheduleInboundId" = i."scheduleInboundId"
            LEFT JOIN
                public.users u ON i."userId" = u.userid
            WHERE
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN $1 AND $2
        `;
        
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            bind: [startDate, endDate] // Use bind instead of replacements for $1, $2 syntax
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
