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
                public.users u ON ot."scheduledBy" = u.userid
        `;

        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });
        return result;
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
                TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') = :date
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { date }
        });
        return result;
    } catch (error) {
        console.error(`Error fetching outbound records for date ${date}:`, error);
        throw error;
    }
};

const getUpcomingOutbounds = async () => {
    try {
        const query = `
            SELECT COUNT(*) AS "upcomingOutbound"
            FROM public."testSelectedInbounds"
            WHERE "isoutbounded" IS FALSE
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });
        
        if (result[0].upcomingOutbound == 0) {
            console.log('No upcoming outbound records found!');
            return result[0].upcomingOutbound;
        } else {
            return result[0].upcomingOutbound;
        }
    } catch (error) {
        console.error('Error fetching upcoming outbound records:', error);
        throw error;
    }
};
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
                TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN $1 AND $2
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            bind: [startDate, endDate]
        });
        return result;
    } catch (error) {
        console.error(`Error fetching outbound records from ${startDate} to ${endDate}:`, error);
        throw error;
    }
};
module.exports = {
    getAllOutbounds,
    getOutboundsByDate,
    getUpcomingOutbounds,
    getOutboundsByDateRange
};