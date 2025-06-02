const db = require('../database');

const getAllOutbounds = async () => {
    try {
       const query = `
          SELECT
                TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                ot."jobNo" || ' - ' || LPAD(ot."lotNo"::text, 2, '0') AS "Lot No",
                ot."exWarehouseLot",
                ot.commodity AS "Metal",
                ot.brands AS "Brand",
                ot.shape AS "Shape",
                ot."noOfBundle" AS "Qty",
                u.username AS "Scheduled By" 
            FROM
                public.outboundtransactions ot 
            LEFT JOIN
                public.users u ON ot."scheduledBy" = u.userid;
        `;

        const result = await db.query(query);
        return result.rows;
    } catch (error) {
        console.error('Error fetching all outbound records:', error);
        throw error;
    }
};


const getOutboundsByDate = async (date) => {
    try {
        const query = `
          SELECT
                TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                ot."jobNo" || ' - ' || LPAD(ot."lotNo"::text, 2, '0') AS "Lot No",
                ot."exWarehouseLot",
                ot.commodity AS "Metal",
                ot.brands AS "Brand",
                ot.shape AS "Shape",
                ot."noOfBundle" AS "Qty",
                u.username AS "Scheduled By"
            FROM
                public.outboundtransactions ot
            LEFT JOIN
                public.users u ON ot."scheduledBy" = u.userid
            WHERE
                TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') = $1;
        `;
        const result = await db.query(query, [date]);
        return result.rows;
    } catch (error) {
        console.error(`Error fetching outbound records for date ${date}:`, error);
        throw error;
    }
};


const getUpcomingOutbounds = async () => {
    try {
        const query = `
            select count(*) AS "upcomingOutbound"
            from public."testSelectedInbounds"
            where 
            "isoutbounded" IS FALSE

        `;
        const result = await db.query(query);
        
        if (result.rows[0].upcomingOutbound == 0) {
            console.log('No upcoming outbound records found!');
            return result.rows[0].upcomingOutbound;
        }else {
            return result.rows[0].upcomingOutbound;
        }
    } catch (error) {
        console.error('Error fetching upcoming outbound records:', error);
        throw error;
    }
}


const getOutboundsByDateRange = async (startDate, endDate) => {
    try {
        const query = `
            SELECT
                TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                ot."jobNo" || ' - ' || LPAD(ot."lotNo"::text, 2, '0') AS "Lot No",
                ot."exWarehouseLot",
                ot.commodity AS "Metal",
                ot.brands AS "Brand",
                ot.shape AS "Shape",
                ot."noOfBundle" AS "Qty",
                u.username AS "Scheduled By"
            FROM
                public.outboundtransactions ot
            LEFT JOIN
                public.users u ON ot."scheduledBy" = u.userid
            WHERE
                TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN $1 AND $2;
        `;
        const result = await db.query(query, [startDate, endDate]);
        return result.rows;
    } catch (error) {
        console.error(`Error fetching outbound records from ${startDate} to ${endDate}:`, error);
        throw error;
    }
}

module.exports = {
    getAllOutbounds,
    getOutboundsByDate,
    getUpcomingOutbounds,
    getOutboundsByDateRange
};
