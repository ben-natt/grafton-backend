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
         SELECT 
         TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
         TO_CHAR(si."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "END DATE",
		i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 3, '0') AS "Lot No",
		i."exWarehouseLot" AS  "Ex-W Lot",
		c."commodityName" AS "Metal",
		b."brandName"  AS "Brand",
		s."shapeName" AS "Shape",
		i."noOfBundle" AS "Qty",
		i."netWeight" AS "Net Weight",
		i."grossWeight" AS "Gross Weight",
		CASE WHEN i."isWeighted" = true THEN i."actualWeight" ELSE i."netWeight" END AS "Actual Weight",
        exlme."exLmeWarehouseName" AS "Ex-LME Warehouse",
        TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Release Date",
        TO_CHAR(si."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Release End Date",
        o."releaseWarehouse" AS "Release Warehouse",
        TO_CHAR(si."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Delivery Date",
        o."transportVendor" AS "Transport Vendor",
        o."createdAt" AS "Scheduled Outbound Date",
        o."lotReleaseWeight" AS "Lot Release Weight",
        si."storageReleaseLocation" AS "Storage Release Location",
        si."exportDate" AS "Export Date",
        o."stuffingDate" AS "Stuffing Date",
        o."containerNo" AS "Container No",
        o."outboundJobNo" AS "Outbound No",
         o."sealNo" AS "Seal No",
		u1."username" AS "Scheduled By",
        u2."username" AS "Processed By",
          (
          SELECT COUNT(*)
          FROM public.selectedinbounds si2
          WHERE si2."scheduleOutboundId" = si."scheduleOutboundId"
        ) AS "TotalLots"
        
		FROM public.scheduleoutbounds o JOIN public.selectedinbounds si
		ON o."scheduleOutboundId" = si."scheduleOutboundId"
		LEFT JOIN public.inbounds i on si."inboundId" = i."inboundId"
		LEFT JOIN public.commodities c on i."commodityId" = c."commodityId"
		LEFT JOIN public.brands b on i."brandId" = b."brandId"
		LEFT JOIN public.shapes s on i."shapeId" = s."shapeId"
		LEFT JOIN public.users u1 ON o."userId" = u1.userid
        LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = si."inboundId"
        LEFT JOIN public.users u2 ON u2.userid = ot."outboundedBy"
        LEFT JOIN public.exlmewarehouses exlme ON i."exLmeWarehouseId" = exlme."exLmeWarehouseId"
            WHERE si."isOutbounded" = false
          ORDER BY
                TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD')
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
                SELECT 
        TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
         TO_CHAR(si."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "END DATE",
		i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 3, '0') AS "Lot No",
		i."exWarehouseLot" AS  "Ex-W Lot",
		c."commodityName" AS "Metal",
		b."brandName"  AS "Brand",
		s."shapeName" AS "Shape",
		i."noOfBundle" AS "Qty",
		i."netWeight" AS "Net Weight",
		i."grossWeight" AS "Gross Weight",
        CASE WHEN i."isWeighted" = true THEN i."actualWeight" ELSE i."netWeight" END AS "Actual Weight",
        exlme."exLmeWarehouseName" AS "Ex-LME Warehouse",
        o."releaseWarehouse" AS "Release Warehouse",
        o."createdAt" AS "Scheduled Outbound Date",
        TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Release Date",
        TO_CHAR(si."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Release End Date",
        TO_CHAR(si."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Delivery Date",
        o."transportVendor" AS "Transport Vendor",
        o."lotReleaseWeight" AS "Lot Release Weight",
        si."exportDate" AS "Export Date",
    o."stuffingDate" AS "Stuffing Date",
    o."containerNo" AS "Container No",
    o."sealNo" AS "Seal No",
    o."outboundJobNo" AS "Outbound No",
        si."storageReleaseLocation" AS "Storage Release Location",
		u1."username" AS "Scheduled By",
		u2."username" AS "Processed By",
         (
          SELECT COUNT(*)
          FROM public.selectedinbounds si2
          WHERE si2."scheduleOutboundId" = si."scheduleOutboundId"
        ) AS "TotalLots"
		FROM public.scheduleoutbounds o JOIN public.selectedinbounds si
		ON o."scheduleOutboundId" = si."scheduleOutboundId"
		LEFT JOIN public.inbounds i on si."inboundId" = i."inboundId"
		LEFT JOIN public.commodities c on i."commodityId" = c."commodityId"
		LEFT JOIN public.brands b on i."brandId" = b."brandId"
		LEFT JOIN public.shapes s on i."shapeId" = s."shapeId"
		LEFT JOIN public.users u1 ON o."userId" = u1.userid
        LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = si."inboundId"
        LEFT JOIN public.users u2 ON u2.userid = ot."outboundedBy"
        LEFT JOIN public.exlmewarehouses exlme ON i."exLmeWarehouseId" = exlme."exLmeWarehouseId"
            WHERE TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') = :date
        AND si."isOutbounded" = false
        ORDER BY
                TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD')
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
             SELECT 
             TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "DATE",
         TO_CHAR(si."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "END DATE",
		i."jobNo" || ' - ' || LPAD(i."lotNo"::text, 3, '0') AS "Lot No",
		i."exWarehouseLot" AS  "Ex-W Lot",
		c."commodityName" AS "Metal",
		b."brandName"  AS "Brand",
		s."shapeName" AS "Shape",
		i."noOfBundle" AS "Qty",
		i."netWeight" AS "Net Weight",
		i."grossWeight" AS "Gross Weight",
		CASE WHEN i."isWeighted" = true THEN i."actualWeight" ELSE i."netWeight" END AS "Actual Weight",
        exlme."exLmeWarehouseName" AS "Ex-LME Warehouse",
        TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Release Date",
        TO_CHAR(si."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Release End Date",
        o."releaseWarehouse" AS "Release Warehouse",
        o."outboundJobNo" AS "Outbound No",
        o."createdAt" AS "Scheduled Outbound Date",
        TO_CHAR(si."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "Delivery Date",
        o."transportVendor" AS "Transport Vendor",
        o."lotReleaseWeight" AS "Lot Release Weight",
        si."storageReleaseLocation" AS "Storage Release Location",
        si."exportDate" AS "Export Date",
        o."containerNo" AS "Container No",
        o."sealNo" AS "Seal No",
        o."stuffingDate" AS "Stuffing Date",
		u1."username" AS "Scheduled By",
		u2."username" AS "Processed By",
         (
          SELECT COUNT(*)
          FROM public.selectedinbounds si2
          WHERE si2."scheduleOutboundId" = si."scheduleOutboundId"
        ) AS "TotalLots"
		FROM public.scheduleoutbounds o JOIN public.selectedinbounds si
		ON o."scheduleOutboundId" = si."scheduleOutboundId"
		LEFT JOIN public.inbounds i on si."inboundId" = i."inboundId"
		LEFT JOIN public.commodities c on i."commodityId" = c."commodityId"
		LEFT JOIN public.brands b on i."brandId" = b."brandId"
		LEFT JOIN public.shapes s on i."shapeId" = s."shapeId"
		LEFT JOIN public.users u1 ON o."userId" = u1.userid
        LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = si."inboundId"
        LEFT JOIN public.users u2 ON u2.userid = ot."outboundedBy"
        LEFT JOIN public.exlmewarehouses exlme ON i."exLmeWarehouseId" = exlme."exLmeWarehouseId"
            WHERE TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') BETWEEN :startDate AND :endDate
        AND si."isOutbounded" = false
        ORDER BY
                TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD')
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