const db = require("../database");

const getConfirmationDetailsById = async (selectedInboundId) => {
  try {
    const query = `
      SELECT
        so."lotReleaseWeight",
        s."shapeName" AS shape,
        so."releaseWarehouse",
        so."storageReleaseLocation",
        so."transportVendor",
        TO_CHAR(so."exportDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "exportDate",
        TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "releaseDate",
        i."jobNo",
        i."lotNo",
        i."noOfBundle" AS "expectedBundleCount",
        b."brandName" AS "brand",
        c."commodityName" AS "commodity",
        w."exLmeWarehouseName" AS "exLmeWarehouse",
        i."exWarehouseLot"
      FROM public.selectedinbounds si
      JOIN public.inbounds i ON si."inboundId" = i."inboundId"
      JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
      LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
      LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
      LEFT JOIN public.brands b ON i."brandId" = b."brandId"
      LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId"
      WHERE si."selectedInboundId" = :selectedInboundId;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { selectedInboundId },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    return result;
  } catch (error) {
    console.error("Error fetching confirmation details from model:", error);
    throw error;
  }
};

const countTotalLotsInJob = async (jobNo) => {
  try {
    const query = `
      SELECT SUM(so."lotReleaseWeight") as "totalReleaseWeight"
      FROM public.selectedinbounds si
      JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
      WHERE si."jobNo" = :jobNo AND si."isOutbounded" = false;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    return result ? result.totalReleaseWeight : 0;
  } catch (error) {
    console.error("Error counting total lots in job:", error);
    throw error;
  }
};

const confirmSelectedInbounds = async (selectedInboundIds) => {
  try {
    const query = `
      UPDATE public.selectedinbounds
      SET "isOutbounded" = true, "updatedAt" = NOW()
      WHERE "selectedInboundId" IN (:selectedInboundIds);
    `;

    const [result, metadata] = await db.sequelize.query(query, {
      replacements: { selectedInboundIds },
      type: db.sequelize.QueryTypes.UPDATE,
    });
    return metadata.rowCount;
  } catch (error) {
    console.error("Error updating outbound status in model:", error);
    throw error;
  }
};

const getGrnDetails = async (jobNo) => {
  try {
    const grnCountQuery = `
    SELECT COUNT(*) as grn_count
    FROM public.outbounds
    WHERE "jobIdentifier" = :jobNo;
  `;
    const grnCountResult = await db.sequelize.query(grnCountQuery, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const grnIndex = parseInt(grnCountResult.grn_count, 10) + 1;
    const grnNo = `${jobNo.replace("SINI", "SINO")}/${grnIndex}`;

    const lotsQuery = `
    SELECT
     i."lotNo",
          i."jobNo",
     i."noOfBundle",
     i."grossWeight",
     i."netWeight",
     c."commodityName" as commodity,
     b."brandName" as brand,
     s."shapeName" as shape,
     so."releaseWarehouse"
    FROM public.selectedinbounds si
    JOIN public.inbounds i ON si."inboundId" = i."inboundId"
    JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
    JOIN public.commodities c ON i."commodityId" = c."commodityId"
    JOIN public.brands b ON i."brandId" = b."brandId"
    JOIN public.shapes s ON i."shapeId" = s."shapeId"
    WHERE si."jobNo" = :jobNo AND si."isOutbounded" = true;
  `;
    const lots = await db.sequelize.query(lotsQuery, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (lots.length === 0) {
      return null;
    }

    return {
      releaseDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      ourReference: jobNo.replace("SINI", "SINO"),
      grnNo,
      warehouse: lots[0].releaseWarehouse,
      cargoDetails: {
        commodity: lots[0].commodity,
        shape: lots[0].shape,
        brand: lots[0].brand,
      },
      lots: lots.map((lot) => ({
        lotNo: `${lot.jobNo.replace("SINI", "SINO")}-${lot.lotNo}`,
        bundles: lot.noOfBundle,
        grossWeightMt: (lot.grossWeight * 0.907185).toFixed(4), // Conversion to Metric Ton
        netWeightMt: (lot.netWeight * 0.907185).toFixed(4), // Conversion to Metric Ton
      })),
    };
  } catch (error) {
    console.error("Error fetching GRN details from model:", error);
    throw error;
  }
};

module.exports = {
  getConfirmationDetailsById,
  countTotalLotsInJob,
  confirmSelectedInbounds,
  getGrnDetails,
};
