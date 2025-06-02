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
        
        const result = await db.query(query);
        return result.rows;
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
                TO_CHAR(i."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') = $1
            ORDER BY
                i."inboundId" limit 200
        `;
        const result = await db.query(query, [date]);
        return result.rows;
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
                i."inboundId" limit 200
        `;
        const result = await db.query(query, [startDate, endDate]);
      //  console.log(`Fetched inbound records from ${startDate} to ${endDate}:`, result.rows);
        return result.rows;
    } catch (error) {
        console.error(`Error fetching inbound records for date range ${startDate} to ${endDate}:`, error);
        throw error;
    }
};


const getUpcomingInbound = async () => {
    try{
        const query = `
        SELECT
            COUNT(*) AS "upcomingInbound"
            FROM public.lot
            WHERE status IN ('Pending')
        `
        const result = await db.query(query);
     //   console.log(result);
        if (result.rows[0].upcomingInbound == 0) {
        // console.log('No upcoming inbound records found!');
            return result.rows[0].upcomingInbound;
        }else {
            return result.rows[0].upcomingInbound;
        }
    }catch (error) {
        console.error('Error fetching upcoming inbound records:', error);
        throw error;
    }
}

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
        
        const result = await db.query(query);
        return result.rows;
    } catch (error) {
        console.error('Error fetching inventory records:', error);
        throw error;
    }
};

module.exports = {
    getAllInbound,
    getInventory,
    getInboundByDate,
    getInboundByDateRange,
    getUpcomingInbound
};