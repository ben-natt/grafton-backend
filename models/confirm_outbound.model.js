const db = require("../database");

const confirmSelectedInbounds = async (selectedInboundIds, transaction) => {
  console.log(
    `MODEL (confirmSelectedInbounds): Updating selectedInboundIds: ${selectedInboundIds.join(
      ", "
    )}`
  );
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
    console.log("MODEL (confirmSelectedInbounds): Update successful.");
  } catch (error) {
    console.error("MODEL ERROR in confirmSelectedInbounds:", error);
    throw error;
  }
};

const getConfirmationDetailsById = async (selectedInboundId) => {
  console.log(
    `MODEL (getConfirmationDetailsById): Fetching details for ID: ${selectedInboundId}`
  );
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
    TO_CHAR(so."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "deliveryDate",
    TO_CHAR(so."stuffingDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "stuffingDate",
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

    console.log("MODEL (getConfirmationDetailsById): Retrieved data:");
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error("MODEL ERROR in getConfirmationDetailsById:", error);
    throw error;
  }
};

const getGrnDetailsForSelection = async (
  scheduleOutboundId,
  selectedInboundIds
) => {
  console.log(
    `MODEL (getGrnDetailsForSelection): Fetching for scheduleOutboundId: ${scheduleOutboundId}`
  );
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
    console.log(
      `MODEL (getGrnDetailsForSelection): Generated GRN No: ${grnNo}`
    );

    const lotsQuery = `
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
    const lots = await db.sequelize.query(lotsQuery, {
      replacements: { selectedInboundIds },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (lots.length === 0) {
      console.log("MODEL (getGrnDetailsForSelection): No lots found.");
      return null;
    }
    console.log(
      `MODEL (getGrnDetailsForSelection): Found ${lots.length} lots.`
    );

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
    console.log(
      "MODEL (getGrnDetailsForSelection): Successfully aggregated details."
    );
    return result;
  } catch (error) {
    console.error("MODEL ERROR in getGrnDetailsForSelection:", error);
    throw error;
  }
};

const getOperators = async () => {
  console.log("MODEL (getOperators): Fetching operators.");
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
    console.log(`MODEL (getOperators): Found ${users.length} operators.`);
    return users;
  } catch (error) {
    console.error("MODEL ERROR in getOperators:", error);
    throw error;
  }
};

const createGrnAndTransactions = async (formData) => {
  console.log("MODEL (createGrnAndTransactions): Starting transaction.");
  const { selectedInboundIds } = formData;
  const t = await db.sequelize.transaction();

  try {
    console.log(
      "MODEL (createGrnAndTransactions): 1. Confirming selected inbounds..."
    );
    await confirmSelectedInbounds(selectedInboundIds, t);

    console.log(
      "MODEL (createGrnAndTransactions): 2. Inserting into outbounds table..."
    );
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
    console.log(
      "MODEL (createGrnAndTransactions): 2. Outbound record created with ID:",
      createdOutbound.outboundId
    );

    console.log(
      "MODEL (createGrnAndTransactions): 3. Fetching lot details for transactions..."
    );
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
    console.log(
      `MODEL (createGrnAndTransactions): 3. Found ${lotsToProcess.length} lots to process for transactions.`
    );

    console.log(
      "MODEL (createGrnAndTransactions): 4. Inserting outbound transactions..."
    );
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
    console.log(
      "MODEL (createGrnAndTransactions): 4. All transactions inserted."
    );

    await t.commit();
    console.log(
      "MODEL (createGrnAndTransactions): Transaction committed successfully."
    );

    return {
      createdOutbound: {
        ...createdOutbound,
        outboundedDate: createdOutbound.outboundedDate,
      },
      lotsForPdf: lotsToProcess,
    };
  } catch (error) {
    await t.rollback();
    console.error(
      "MODEL ERROR in createGrnAndTransactions (Transaction rolled back):",
      error
    );
    throw error;
  }
};

const updateOutboundWithPdfDetails = async (
  outboundId,
  grnImagePath,
  fileSize,
  grnPreviewImagePath
) => {
  console.log(
    `MODEL (updateOutboundWithPdfDetails): Updating outboundId ${outboundId} with PDF path: ${grnImagePath}, Preview path: ${grnPreviewImagePath}, size: ${fileSize}`
  );
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
    console.log(
      `MODEL (updateOutboundWithPdfDetails): Successfully updated outboundId ${outboundId}.`
    );
  } catch (error) {
    console.error("MODEL ERROR in updateOutboundWithPdfDetails:", error);
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
