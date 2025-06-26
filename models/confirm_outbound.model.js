const db = require("../database");

// This function is now intended to be called within a transaction.
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
      transaction, // Use the provided transaction
    });
  } catch (error) {
    console.error("Error updating outbound status in model:", error);
    throw error; // Throw error to be caught by the calling function's transaction
  }
};

// Fetches confirmation details for a selected inbound by its ID.
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

// Counts the total lot release weight for a given job number.
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

// Fetches GRN details for a selection of inbounds based on the job number and selected inbound IDs.
const getGrnDetailsForSelection = async (jobNo, selectedInboundIds) => {
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
        i."lotNo", i."jobNo", i."noOfBundle", i."grossWeight", i."netWeight",
        c."commodityName" as commodity, b."brandName" as brand, s."shapeName" as shape,
        so."releaseWarehouse",
        TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'dd-Mon-yyyy') AS "releaseDate"
      FROM public.selectedinbounds si
      JOIN public.inbounds i ON si."inboundId" = i."inboundId"
      JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
      LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
      LEFT JOIN public.brands b ON i."brandId" = b."brandId"
      LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
      WHERE si."selectedInboundId" IN (:selectedInboundIds);
    `;
    const lots = await db.sequelize.query(lotsQuery, {
      replacements: { selectedInboundIds },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (lots.length === 0) {
      return null;
    }

    const firstLot = lots[0];
    return {
      releaseDate: firstLot.releaseDate,
      ourReference: firstLot.jobNo.replace("SINI", "SINO"),
      grnNo,
      warehouse: firstLot.releaseWarehouse,
      cargoDetails: {
        commodity: firstLot.commodity,
        shape: firstLot.shape,
        brand: firstLot.brand,
      },
      lots: lots.map((lot) => ({
        lotNo: `${lot.jobNo.replace("SINI", "SINO")}-${lot.lotNo}`,
        bundles: lot.noOfBundle,
        grossWeightMt: (lot.grossWeight * 0.907185).toFixed(4),
        netWeightMt: (lot.netWeight * 0.907185).toFixed(4),
      })),
    };
  } catch (error) {
    console.error(
      "Error fetching GRN details for selection from model:",
      error
    );
    throw error;
  }
};

// Fetches the list of operators (users with roleId 1 or 2) for the frontend.
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
    console.error("Error fetching operators from model:", error);
    throw error;
  }
};

// Creates a GRN and associated transactions based on the provided form data.
const createGrnAndTransactions = async (formData) => {
  const {
    selectedInboundIds,
    driverName,
    driverIdentityNo,
    truckPlateNo,
    warehouseStaff,
    warehouseSupervisor,
    userId,
    grnNo,
    jobIdentifier,
    driverSignature,
    warehouseStaffSignature,
    warehouseSupervisorSignature,
  } = formData;

  const t = await db.sequelize.transaction();

  try {
    // LOGIC CHANGE: Update the selected inbounds' status within the transaction
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
      replacements: {
        driverName,
        driverIdentityNo,
        truckPlateNo,
        warehouseStaff,
        warehouseSupervisor,
        userId,
        grnNo,
        jobIdentifier,
        driverSignature,
        warehouseStaffSignature,
        warehouseSupervisorSignature,
      },
      type: db.sequelize.QueryTypes.INSERT,
      transaction: t,
    });

    const createdOutbound = outboundResult[0][0];
    const outboundId = createdOutbound.outboundId;
    const outboundedDate = createdOutbound.outboundedDate;

    const lotsDetailsQuery = `
      SELECT
          si."inboundId", si."scheduleOutboundId",
          i."jobNo", i."lotNo", i."noOfBundle", i."grossWeight", i."netWeight", i."actualWeight",
          i."exWarehouseLot", i."exWarehouseWarrant",
          w."exLmeWarehouseName" AS "exLmeWarehouse",
          s."shapeName" as shape, c."commodityName" as commodity, b."brandName" as brand,
          so."releaseDate" as "scheduledReleaseDate", so."releaseWarehouse", so."storageReleaseLocation", so."transportVendor",
          so."outboundType", so."exportDate", so."stuffingDate", so."containerNo", so."sealNo",
          so."lotReleaseWeight"
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
            "outboundedBy", "exWarehouseLot", "exWarehouseWarrant", "createdAt", "updatedAt"
        ) VALUES (
            :outboundId, :inboundId, :jobNo, :lotNo, :shape, :commodity, :brand,
            :exLmeWarehouse, :grossWeight, :netWeight, :actualWeight, :outboundedDate, :storageReleaseLocation,
            :noOfBundle, :scheduleOutboundId, :releaseWarehouse, :lotReleaseWeight,
            :transportVendor, :outboundType, :exportDate, :stuffingDate, :containerNo, :sealNo,
            :driverName, :driverIdentityNo, :truckPlateNo, :warehouseStaff, :warehouseSupervisor,
            :userId, :exWarehouseLot, :exWarehouseWarrant, NOW(), NOW()
        );
      `;
      await db.sequelize.query(transactionQuery, {
        replacements: {
          ...lot,
          outboundId,
          outboundedDate,
          driverName,
          driverIdentityNo,
          truckPlateNo,
          warehouseStaff,
          warehouseSupervisor,
          userId,
        },
        type: db.sequelize.QueryTypes.INSERT,
        transaction: t,
      });
    }

    await t.commit();

    return {
      createdOutbound: {
        ...createdOutbound,
        releaseDate: outboundedDate,
      },
      lotsForPdf: lotsToProcess,
    };
  } catch (error) {
    await t.rollback();
    console.error("Error creating GRN and transactions in model:", error);
    throw error;
  }
};

module.exports = {
  getConfirmationDetailsById,
  countTotalLotsInJob,
  getGrnDetailsForSelection,
  createGrnAndTransactions,
  getOperators,
};
