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
    so."outboundType",
    s."shapeName" AS shape,
    so."releaseWarehouse",
    so."storageReleaseLocation",
    so."transportVendor",
    TO_CHAR(si."exportDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') AS "exportDate",
    TO_CHAR(si."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') AS "deliveryDate",
    TO_CHAR(so."stuffingDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') AS "stuffingDate",
    so."containerNo",
    so."sealNo",
    i."jobNo",
    COALESCE(i."crewLotNo", i."lotNo") as "lotNo",
    i."actualWeight",
    i."grossWeight",
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
    // First, get the details for one lot to determine the outboundJobNo
    const preliminaryLotQuery = `
      SELECT so."outboundJobNo"
      FROM public.selectedinbounds si
      JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
      WHERE si."selectedInboundId" = :selectedInboundId
      LIMIT 1;
    `;
    const prelimLot = await db.sequelize.query(preliminaryLotQuery, {
      replacements: { selectedInboundId: selectedInboundIds[0] },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });

    const outboundJobNo =
      prelimLot?.outboundJobNo ||
      `SINO${String(scheduleOutboundId).padStart(3, "0")}`;

    const grnCountQuery = `
      SELECT COUNT(*) as grn_count
      FROM public.outbounds
      WHERE "jobIdentifier" = :outboundJobNo;
    `;
    const grnCountResult = await db.sequelize.query(grnCountQuery, {
      replacements: { outboundJobNo },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const grnIndex = parseInt(grnCountResult.grn_count, 10) + 1;
    const fileName = `${outboundJobNo}/${String(grnIndex).padStart(2, "0")}`;
    const grnNo = outboundJobNo;

    const lotsQuery = `
  SELECT
      si."inboundId", si."scheduleOutboundId",
      i."jobNo", COALESCE(i."crewLotNo", i."lotNo") as "lotNo", i."noOfBundle", i."grossWeight", i."netWeight", i."actualWeight",
      i."exWarehouseLot", i."exWarehouseWarrant",
      w."exLmeWarehouseName" AS "exLmeWarehouse",
      s."shapeName" as shape, c."commodityName" as commodity, b."brandName" as brand,
      TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') as "scheduledReleaseDate", 
      so."releaseWarehouse", si."storageReleaseLocation", so."transportVendor",
      so."outboundType",
      so."outboundJobNo",
      TO_CHAR(si."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') as "deliveryDate", 
      TO_CHAR(si."exportDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') as "exportDate", 
      TO_CHAR(so."stuffingDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') as "stuffingDate", 
      so."containerNo", so."sealNo",
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
      return null;
    }

    const aggregateDetails = (key) =>
      [...new Set(lots.map((lot) => lot[key]).filter(Boolean))].join(", ");

    const formatMultipleDates = (dates, dateField) => {
      // Debug: Print all date values for the field
      const rawDates = dates.map((lot) => lot[dateField]);

      // Extract unique valid dates
      const filteredDates = rawDates.filter(
        (dateString) => dateString && dateString !== "Invalid Date"
      );

      const parsedDates = filteredDates
        .map((dateString) => {
          // Fix the timezone format: +00 -> +00:00
          const fixedDateString = dateString.replace(/\+00$/, "+00:00");

          const date = new Date(fixedDateString);
          return isNaN(date.getTime()) ? null : date;
        })
        .filter((date) => date !== null);

      if (parsedDates.length === 0) {
        return "N/A";
      }

      // Create unique dates by comparing date strings instead of Date objects
      const uniqueDateStrings = [
        ...new Set(
          parsedDates.map((date) =>
            date.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          )
        ),
      ];

      if (uniqueDateStrings.length === 1) {
        return uniqueDateStrings[0];
      }

      // Sort the formatted date strings by converting back to dates for sorting
      const sortedFormattedDates = uniqueDateStrings.sort((a, b) => {
        const dateA = new Date(
          a.replace(/(\d{1,2}) (\w+) (\d{4})/, "$2 $1, $3")
        );
        const dateB = new Date(
          b.replace(/(\d{1,2}) (\w+) (\d{4})/, "$2 $1, $3")
        );
        return dateA - dateB;
      });

      const result = sortedFormattedDates.join(", ");
      return result;
    };

    const firstLot = lots[0];

    const result = {
      releaseDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }), // Current date as "12 August 2025"
      deliveryDate: formatMultipleDates(lots, "deliveryDate"),
      outboundType: firstLot.outboundType,
      exportDate: firstLot.exportDate,
      stuffingDate: firstLot.stuffingDate,
      containerNo: firstLot.containerNo,
      sealNo: firstLot.sealNo,
      ourReference: outboundJobNo,
      grnNo,
      fileName,
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

// const getOperators = async () => {
//   try {
//     const query = `
//       SELECT
//         userid AS "userId",
//         username AS "fullName",
//         roleid AS "roleId"
//       FROM public.users
//       WHERE roleid IN (1, 2)
//       ORDER BY username;
//     `;
//     const users = await db.sequelize.query(query, {
//       type: db.sequelize.QueryTypes.SELECT,
//     });
//     return users;
//   } catch (error) {
//     throw error;
//   }
// };

const checkForDuplicateLots = async (lots, transaction) => {
  try {
    if (!lots || lots.length === 0) {
      return false;
    }

    // Dynamically construct the WHERE clause to check for multiple (jobNo, lotNo) pairs.
    // This creates a series of OR conditions like:
    // WHERE ("jobNo" = :jobNo0 AND "lotNo" = :lotNo0) OR ("jobNo" = :jobNo1 AND "lotNo" = :lotNo1) ...
    const whereConditions = lots
      .map(
        (_, index) => `("jobNo" = :jobNo${index} AND "lotNo" = :lotNo${index})`
      )
      .join(" OR ");

    // Create a flat replacements object for Sequelize from the lots array.
    const replacements = lots.reduce((acc, lot, index) => {
      acc[`jobNo${index}`] = lot.jobNo;
      acc[`lotNo${index}`] = lot.lotNo;
      return acc;
    }, {});

    const query = `
      SELECT 1 FROM public.outboundtransactions
      WHERE ${whereConditions}
      LIMIT 1;
    `;

    const result = await db.sequelize.query(query, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      transaction,
      plain: true,
    });

    return !!result; // Returns true if a record is found, otherwise false
  } catch (error) {
    console.error("Error checking for duplicate lots:", error);
    throw new Error("Database error during duplicate lot check.");
  }
};

const createGrnAndTransactions = async (formData) => {
  const {
    selectedInboundIds,
    stuffingPhotos,
    containerNo,
    sealNo,
    scheduleOutboundId,
    outboundJobNo, // Get outboundJobNo from formData
  } = formData;
  const t = await db.sequelize.transaction();

  try {
    // Fetch both jobNo and lotNo for the duplicate check
    const lotsDetailsQueryForDuplicateCheck = `
      SELECT i."jobNo", COALESCE(i."crewLotNo", i."lotNo") as "lotNo"
      FROM public.selectedinbounds si
      JOIN public.inbounds i ON si."inboundId" = i."inboundId"
      WHERE si."selectedInboundId" IN (:selectedInboundIds);
    `;
    const lotsToCheck = await db.sequelize.query(
      lotsDetailsQueryForDuplicateCheck,
      {
        replacements: { selectedInboundIds },
        type: db.sequelize.QueryTypes.SELECT,
        transaction: t,
      }
    );

    // Check for duplicates before proceeding
    const duplicateExists = await checkForDuplicateLots(lotsToCheck, t);
    if (duplicateExists) {
      // Throw a specific error for duplicate lots.
      const error = new Error(
        "Duplicate Lot found. One or more lots have already been processed for outbound."
      );
      error.isDuplicate = true;
      throw error;
    }

    await confirmSelectedInbounds(selectedInboundIds, t);

    // Prepare replacements for the insert query, ensuring jobIdentifier is correct
    const outboundInsertReplacements = {
      ...formData,
      jobIdentifier: outboundJobNo, // Use outboundJobNo for the jobIdentifier
    };

    const outboundInsertQuery = `
      INSERT INTO public.outbounds (
          "releaseDate", "driverName", "driverIdentityNo", "truckPlateNo",
          "warehouseStaff", "warehouseSupervisor", "userId", "grnNo", "jobIdentifier",
          "driverSignature", "warehouseStaffSignature", "warehouseSupervisorSignature",
          "tareWeight", uom,
          "createdAt", "updatedAt"
      ) VALUES (
          NOW(), :driverName, :driverIdentityNo, :truckPlateNo,
          :warehouseStaff, :warehouseSupervisor, :userId, :grnNo, :jobIdentifier,
          :driverSignature, :warehouseStaffSignature, :warehouseSupervisorSignature,
          :tareWeight, :uom,
          NOW(), NOW()
      ) RETURNING "outboundId", "createdAt" AS "outboundedDate", "jobIdentifier", "grnNo";
    `;
    const outboundResult = await db.sequelize.query(outboundInsertQuery, {
      replacements: outboundInsertReplacements,
      type: db.sequelize.QueryTypes.INSERT,
      transaction: t,
    });

    const createdOutbound = outboundResult[0][0];
    const newOutboundId = createdOutbound.outboundId;

    if (containerNo !== undefined && sealNo !== undefined) {
      const updateScheduleQuery = `
            UPDATE public.scheduleoutbounds
            SET "containerNo" = :containerNo, "sealNo" = :sealNo, "updatedAt" = NOW()
            WHERE "scheduleOutboundId" = :scheduleOutboundId;
        `;
      await db.sequelize.query(updateScheduleQuery, {
        replacements: {
          containerNo,
          sealNo,
          scheduleOutboundId: scheduleOutboundId, // Use original scheduleOutboundId
        },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      });
    }

    if (
      stuffingPhotos &&
      Array.isArray(stuffingPhotos) &&
      stuffingPhotos.length > 0
    ) {
      for (const imageUrl of stuffingPhotos) {
        const photoInsertQuery = `
          INSERT INTO public.stuffing_photos ("outboundId", "imageUrl", "createdAt", "updatedAt")
          VALUES (:outboundId, :imageUrl, NOW(), NOW());
        `;
        await db.sequelize.query(photoInsertQuery, {
          replacements: { outboundId: newOutboundId, imageUrl },
          type: db.sequelize.QueryTypes.INSERT,
          transaction: t,
        });
      }
    }

    const lotsDetailsQuery = `
      SELECT
          si."inboundId", si."scheduleOutboundId",
          i."jobNo", COALESCE(i."crewLotNo", i."lotNo") as "lotNo", i."noOfBundle", i."grossWeight", i."netWeight", i."actualWeight",
          i."exWarehouseLot", i."exWarehouseWarrant",
          w."exLmeWarehouseName" AS "exLmeWarehouse",
          s."shapeName" as shape, c."commodityName" as commodity, b."brandName" as brand,
          so."releaseDate" as "scheduledReleaseDate", so."releaseWarehouse", si."storageReleaseLocation", so."transportVendor",
          so."outboundType", so."stuffingDate", so."containerNo", so."sealNo",
          so."lotReleaseWeight",
          so."userId" AS "scheduledBy",
          TO_CHAR(si."exportDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') as "exportDate",
          TO_CHAR(si."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') as "deliveryDate"
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
            "outboundedBy", "scheduledBy", "exWarehouseLot", "exWarehouseWarrant", "createdAt", "updatedAt",
            "deliveryDate"
        ) VALUES (
            :outboundId, :inboundId, :jobNo, :lotNo, :shape, :commodity, :brand,
            :exLmeWarehouse, :grossWeight, :netWeight, :actualWeight, NOW(), :storageReleaseLocation,
            :noOfBundle, :scheduleOutboundId, :releaseWarehouse, :lotReleaseWeight,
            :transportVendor, :outboundType, :exportDate, :stuffingDate, :containerNo, :sealNo,
            :driverName, :driverIdentityNo, :truckPlateNo, :warehouseStaff, :warehouseSupervisor,
            :userId, :scheduledBy, :exWarehouseLot, :exWarehouseWarrant, NOW(), NOW(),
            :deliveryDate
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
    // This single catch block will handle rollback for ANY error inside the try block.
    await t.rollback();
    // Re-throw the error to be caught by the controller
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

const getUserSignature = async (userId) => {
  try {
    const query = `SELECT "signature" FROM public.users WHERE "userid" = :userId;`;
    const result = await db.sequelize.query(query, {
      replacements: { userId },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result.length > 0 ? result[0].signature : null;
  } catch (error) {
    throw error;
  }
};

const updateUserSignature = async (userId, signature) => {
  try {
    const query = `
      UPDATE public.users 
      SET "signature" = :signature 
      WHERE "userid" = :userId;
    `;
    await db.sequelize.query(query, {
      replacements: { userId, signature },
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
  getUserSignature,
  updateUserSignature,
  // getOperators,
  confirmSelectedInbounds,
  updateOutboundWithPdfDetails,
  checkForDuplicateLots,
};
