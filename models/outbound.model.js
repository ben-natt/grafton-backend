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
            FROM public."selectedinbounds"
            WHERE "isOutbounded" IS false
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
                TO_CHAR(ot."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN :startDate AND :endDate
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { startDate, endDate }
        });
        return result;
    } catch (error) {
        console.error(`Error fetching outbound records from ${startDate} to ${endDate}:`, error);
        throw error;
    }
};

const getAllScheduleOutbounds = async () => {
    try {
        const query = `
           SELECT TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
		i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 2, '0') AS "Lot No",
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
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });
        return result;
    } catch (error) {
        console.error('Error fetching all scheduled outbound records:', error);
        throw error;
    }

}

const getScheduleOutboundByDate = async (date) => {
    try {
        const query = `
            SELECT TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 2, '0') AS "Lot No",
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
            WHERE TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') = :date
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { date }
        });
        return result;
    } catch (error) {
        console.error(`Error fetching scheduled outbound records for date ${date}:`, error);
        throw error;
    }
}

const getScheduleOutboundByDateRange = async (startDate, endDate) => {
    try {
        const query = `
            SELECT TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
                i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 2, '0') AS "Lot No",
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
            WHERE TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN :startDate AND :endDate
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { startDate, endDate }
        });
        return result;
    } catch (error) {
        console.error(`Error fetching scheduled outbound records from ${startDate} to ${endDate}:`, error);
        throw error;
    }
}

module.exports = {
    getAllOutbounds,
    getOutboundsByDate,
    getUpcomingOutbounds,
    getOutboundsByDateRange,
    getAllScheduleOutbounds,
    getScheduleOutboundByDate,
    getScheduleOutboundByDateRange
};