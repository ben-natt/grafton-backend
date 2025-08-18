const db = require("../database");

const confirmSelectedInbounds = async (selectedInboundIds, transaction) => {
  try {
    const query = `
      UPDATE public.selectedinbounds
      SET "isOutbounded" = true, "updatedAt" = NOW()
      WHERE "selectedInboundId" IN (:selectedInboundIds) AND "isOutbounded" = false;
    `;

    await db.sequelize.query(query, {
      replacements: { selectedInboundIds },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });
  } catch (error) {
    throw error;
  }
};

const getConfirmationDetailsById = async (selectedInboundId) => {
  try {
    const query = `
  SELECT
    so."lotReleaseWeight",
    s."shapeName" AS shape,
    so."releaseWarehouse",
    so."storageReleaseLocation",
    so."transportVendor",
    so."exportDate",
    so."releaseDate",
    so."deliveryDate",
    so."stuffingDate",
    so."containerNo",
    so."sealNo",
    i."jobNo",
    i."lotNo",
    i."actualWeight",
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
    throw error;
  }
};

const getGrnDetailsForSelection = async (
  scheduleOutboundId,
  selectedInboundIds
) => {
  try {
    const outboundJobNo = `SINO${String(scheduleOutboundId).padStart(3, "0")}`;

    const grnCountQuery = `
      SELECT COUNT(*) as grn_count
      FROM public.outbounds
      WHERE "jobIdentifier" = :scheduleOutboundId::text;
    `;
    const grnCountResult = await db.sequelize.query(grnCountQuery, {
      replacements: { scheduleOutboundId },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const grnIndex = parseInt(grnCountResult.grn_count, 10) + 1;
    const grnNo = `${outboundJobNo}/${String(grnIndex).padStart(2, "0")}`;

    const lotsQuery = `
  SELECT
      si."inboundId", si."scheduleOutboundId",
      i."jobNo", i."lotNo", i."noOfBundle", i."grossWeight", i."netWeight", i."actualWeight",
      i."exWarehouseLot", i."exWarehouseWarrant",
      w."exLmeWarehouseName" AS "exLmeWarehouse",
      s."shapeName" as shape, c."commodityName" as commodity, b."brandName" as brand,
      so."releaseDate" as "scheduledReleaseDate", so."releaseWarehouse", so."storageReleaseLocation", so."transportVendor",
      so."outboundType", so."deliveryDate", so."exportDate", so."stuffingDate", so."containerNo", so."sealNo",
      so."lotReleaseWeight",
      so."userId" AS "scheduledBy"
  FROM public.selectedinbounds si
  JOIN public.inbounds i ON si."inboundId" = i."inboundId"
  JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
  LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
  LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
  LEFT JOIN public.brands b ON i."brandId" = b."brandId"
  LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId"
  WHERE si."selectedInboundId" IN (:selectedInboundIds);
`;
    const lots = await db.sequelize.query(lotsQuery, {
      replacements: { selectedInboundIds },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (lots.length === 0) {
      console.log("MODEL (getGrnDetailsForSelection): No lots found.");
      return null;
    }

    const aggregateDetails = (key) =>
      [...new Set(lots.map((lot) => lot[key]).filter(Boolean))].join(", ");

    const firstLot = lots[0];
    const result = {
      releaseDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }), // dd MMMM YYYY
      deliveryDate: firstLot.deliveryDate,
      exportDate: firstLot.exportDate,
      stuffingDate: firstLot.stuffingDate,
      containerNo: firstLot.containerNo,
      sealNo: firstLot.sealNo,
      ourReference: outboundJobNo,
      grnNo,
      warehouse: firstLot.releaseWarehouse ? firstLot.releaseWarehouse : "N/A",
      cargoDetails: {
        commodity: aggregateDetails("commodity")
          ? aggregateDetails("commodity")
          : "N/A",
        shape: aggregateDetails("shape") ? aggregateDetails("shape") : "N/A",
        brand: aggregateDetails("brand") ? aggregateDetails("brand") : "N/A",
        transportVendor: firstLot.transportVendor
          ? firstLot.transportVendor
          : "N/A",
      },
      lots: lots.map((lot) => ({
        selectedInboundId: lot.selectedInboundId,
        lotNo: lot.lotNo,
        jobNo: lot.jobNo,
        bundles: lot.noOfBundle,
        netWeightMt: lot.netWeight,
        actualWeightMt: lot.actualWeight,
        grossWeight: lot.grossWeight,
      })),
    };
    return result;
  } catch (error) {
    throw error;
  }
};

const getOperators = async () => {
  try {
    const query = `
      SELECT 
        userid AS "userId", 
        username AS "fullName", 
        roleid AS "roleId"
      FROM public.users
      WHERE roleid IN (1, 2)
      ORDER BY username;
    `;
    const users = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });
    return users;
  } catch (error) {
    throw error;
  }
};

const createGrnAndTransactions = async (formData) => {
  const { selectedInboundIds } = formData;
  const t = await db.sequelize.transaction();

  try {
    await confirmSelectedInbounds(selectedInboundIds, t);
    const outboundInsertQuery = `
      INSERT INTO public.outbounds (
          "releaseDate", "driverName", "driverIdentityNo", "truckPlateNo",
          "warehouseStaff", "warehouseSupervisor", "userId", "grnNo", "jobIdentifier",
          "driverSignature", "warehouseStaffSignature", "warehouseSupervisorSignature",
          "createdAt", "updatedAt"
      ) VALUES (
          NOW(), :driverName, :driverIdentityNo, :truckPlateNo,
          :warehouseStaff, :warehouseSupervisor, :userId, :grnNo, :jobIdentifier,
          :driverSignature, :warehouseStaffSignature, :warehouseSupervisorSignature,
          NOW(), NOW()
      ) RETURNING "outboundId", "createdAt" AS "outboundedDate", "jobIdentifier", "grnNo";
    `;
    const outboundResult = await db.sequelize.query(outboundInsertQuery, {
      replacements: formData,
      type: db.sequelize.QueryTypes.INSERT,
      transaction: t,
    });

    const createdOutbound = outboundResult[0][0];

    const lotsDetailsQuery = `
      SELECT
          si."inboundId", si."scheduleOutboundId",
          i."jobNo", i."lotNo", i."noOfBundle", i."grossWeight", i."netWeight", i."actualWeight",
          i."exWarehouseLot", i."exWarehouseWarrant",
          w."exLmeWarehouseName" AS "exLmeWarehouse",
          s."shapeName" as shape, c."commodityName" as commodity, b."brandName" as brand,
          so."releaseDate" as "scheduledReleaseDate", so."releaseWarehouse", so."storageReleaseLocation", so."transportVendor",
          so."outboundType", so."exportDate", so."stuffingDate", so."containerNo", so."sealNo",
          so."lotReleaseWeight",
          so."userId" AS "scheduledBy"
      FROM public.selectedinbounds si
      JOIN public.inbounds i ON si."inboundId" = i."inboundId"
      JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
      LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
      LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
      LEFT JOIN public.brands b ON i."brandId" = b."brandId"
      LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId"
      WHERE si."selectedInboundId" IN (:selectedInboundIds);
    `;
    const lotsToProcess = await db.sequelize.query(lotsDetailsQuery, {
      replacements: { selectedInboundIds },
      type: db.sequelize.QueryTypes.SELECT,
      transaction: t,
    });

    for (const lot of lotsToProcess) {
      const transactionQuery = `
        INSERT INTO public.outboundtransactions (
            "outboundId", "inboundId", "jobNo", "lotNo", shape, commodity, brands,
            "exLmeWarehouse", "grossWeight", "netWeight", "actualWeight", "releaseDate", "storageReleaseLocation",
            "noOfBundle", "scheduleOutboundId", "releaseWarehouse", "lotReleaseWeight",
            "transportVendor", "outboundType", "exportDate", "stuffingDate", "containerNo", "sealNo",
            "driverName", "driverIdentityNo", "truckPlateNo", "warehouseStaff", "warehouseSupervisor",
            "outboundedBy", "scheduledBy", "exWarehouseLot", "exWarehouseWarrant", "createdAt", "updatedAt"
        ) VALUES (
            :outboundId, :inboundId, :jobNo, :lotNo, :shape, :commodity, :brand,
            :exLmeWarehouse, :grossWeight, :netWeight, :actualWeight, NOW(), :storageReleaseLocation,
            :noOfBundle, :scheduleOutboundId, :releaseWarehouse, :lotReleaseWeight,
            :transportVendor, :outboundType, :exportDate, :stuffingDate, :containerNo, :sealNo,
            :driverName, :driverIdentityNo, :truckPlateNo, :warehouseStaff, :warehouseSupervisor,
            :userId, :scheduledBy, :exWarehouseLot, :exWarehouseWarrant, NOW(), NOW()
        );
      `;
      await db.sequelize.query(transactionQuery, {
        replacements: {
          ...lot,
          outboundId: createdOutbound.outboundId,
          ...formData,
        },
        type: db.sequelize.QueryTypes.INSERT,
        transaction: t,
      });
    }
    await t.commit();

    return {
      createdOutbound: {
        ...createdOutbound,
        outboundedDate: createdOutbound.outboundedDate,
      },
      lotsForPdf: lotsToProcess,
    };
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

const updateOutboundWithPdfDetails = async (
  outboundId,
  grnImagePath,
  fileSize,
  grnPreviewImagePath
) => {
  try {
    const query = `
      UPDATE public.outbounds
      SET "grnImage" = :grnImagePath, 
          "fileSize" = :fileSize, 
          "grnPreviewImage" = :grnPreviewImagePath,
          "updatedAt" = NOW()
      WHERE "outboundId" = :outboundId;
    `;
    await db.sequelize.query(query, {
      replacements: {
        outboundId,
        grnImagePath,
        fileSize,
        grnPreviewImagePath,
      },
      type: db.sequelize.QueryTypes.UPDATE,
    });
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getConfirmationDetailsById,
  getGrnDetailsForSelection,
  createGrnAndTransactions,
  getOperators,
  confirmSelectedInbounds,
  updateOutboundWithPdfDetails,
};
