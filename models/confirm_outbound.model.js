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
    TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') AS "releaseDate",
    so."containerNo",
    so."sealNo",
    so."tareWeight",
    so."uom",
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

const getStuffingPhotosByScheduleId = async (scheduleOutboundId) => {
  try {
    const query = `
      SELECT "imageUrl" 
      FROM public.stuffing_photos
      WHERE "scheduleoutboundId" = :scheduleOutboundId;
    `;
    const results = await db.sequelize.query(query, {
      replacements: { scheduleOutboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return results.map((row) => row.imageUrl);
  } catch (error) {
    console.error("Error in getStuffingPhotosByScheduleId:", error);
    throw error;
  }
};

const updateOutboundDetails = async (
  scheduleOutboundId,
  selectedInboundId,
  details
) => {
  const t = await db.sequelize.transaction();
  try {
    const { releaseDate, containerNo, sealNo, tareWeight, uom } = details;

    // Update the release date on the specific selected inbound record
    if (releaseDate) {
      const updateSelectedInboundQuery = `
        UPDATE public.selectedinbounds
        SET "releaseDate" = :releaseDate, "updatedAt" = NOW()
        WHERE "selectedInboundId" = :selectedInboundId;
      `;
      await db.sequelize.query(updateSelectedInboundQuery, {
        replacements: {
          releaseDate,
          selectedInboundId,
        },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      });
    }

    // Update the container details on the parent schedule record
    const updateScheduleQuery = `
      UPDATE public.scheduleoutbounds
      SET 
        "containerNo" = :containerNo, 
        "sealNo" = :sealNo, 
        "tareWeight" = :tareWeight, 
        "uom" = :uom, 
        "updatedAt" = NOW()
      WHERE "scheduleOutboundId" = :scheduleOutboundId;
    `;
    await db.sequelize.query(updateScheduleQuery, {
      replacements: {
        containerNo,
        sealNo,
        tareWeight: tareWeight ? parseFloat(tareWeight) : null,
        uom,
        scheduleOutboundId,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction: t,
    });

    await t.commit();
  } catch (error) {
    await t.rollback();
    console.error("Error in updateOutboundDetails model:", error);
    throw error;
  }
};

const getGrnDetailsForSelection = async (
  scheduleOutboundId,
  selectedInboundIds
) => {
  try {
    // First, get the details for one lot to determine outboundJobNo and outboundType
    const preliminaryLotQuery = `
      SELECT so."outboundJobNo", so."outboundType"
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

    // FIX: Get outboundType from the preliminary query result
    const outboundType = prelimLot?.outboundType;

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

    // FIX: Declare grnNo and fileName variables
    let grnNo;
    let fileName;

    if (outboundType && outboundType.toLowerCase() === "flatbed") {
      // For Flatbed, append an auto-incrementing number to grnNo.
      grnNo = `${outboundJobNo}-${grnIndex}`;
      fileName = `${outboundJobNo}/${String(grnIndex).padStart(2, "0")}`;
    } else {
      // For Container (or any other type), grnNo is just the job number without a suffix.
      grnNo = outboundJobNo;
      fileName = `${outboundJobNo}/${String(grnIndex).padStart(2, "0")}`;
    }

    const lotsQuery = `
  SELECT
      si."selectedInboundId", si."inboundId", si."scheduleOutboundId",
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
          // FIX: Remove the faulty replace function. The date string from the database is a valid ISO string.
          const date = new Date(dateString);
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
          a.replace(/(\\d{1,2}) (\\w+) (\\d{4})/, "$2 $1, $3")
        );
        const dateB = new Date(
          b.replace(/(\\d{1,2}) (\\w+) (\\d{4})/, "$2 $1, $3")
        );
        return dateA - dateB;
      });

      const result = sortedFormattedDates.join(", ");
      return result;
    };

    const firstLot = lots[0];

    const result = {
      releaseDate: formatMultipleDates(lots, "scheduledReleaseDate"),
      deliveryDate: formatMultipleDates(lots, "deliveryDate"),
      outboundType: firstLot.outboundType,
      exportDate: formatMultipleDates(lots, "exportDate"),
      stuffingDate: formatMultipleDates(lots, "stuffingDate"),
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
    console.error("Error in getGrnDetailsForSelection:", error);
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

const countStuffingPhotosByScheduleId = async (
  scheduleOutboundId,
  transaction
) => {
  try {
    const query = `
      SELECT COUNT(*) AS "photoCount"
      FROM public.stuffing_photos
      WHERE "scheduleoutboundId" = :scheduleOutboundId;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { scheduleOutboundId },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
      transaction, // Pass transaction if one is active
    });
    // The count is returned as a string from the DB, so parse it.
    return parseInt(result.photoCount, 10);
  } catch (error) {
    console.error("Error in countStuffingPhotosByScheduleId:", error);
    throw error;
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

    const tareWeightValue = formData.tareWeight
      ? parseFloat(formData.tareWeight)
      : null;
    formData.tareWeight = isNaN(tareWeightValue) ? null : tareWeightValue;

    const outboundInsertReplacements = {
      ...formData,
      jobIdentifier: outboundJobNo,
    };

    const outboundInsertQuery = `
      INSERT INTO public.outbounds (
          "releaseDate", "driverName", "driverIdentityNo", "truckPlateNo",
          "warehouseStaff", "warehouseSupervisor", "userId", "grnNo", "jobIdentifier",
          "driverSignature", "warehouseStaffSignature", "warehouseSupervisorSignature",
          "tareWeight", uom,
          "createdAt", "updatedAt"
      ) VALUES (
          :releaseDate, :driverName, :driverIdentityNo, :truckPlateNo,
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

    const updateExistingPhotosQuery = `
      UPDATE public.stuffing_photos
      SET "outboundId" = :outboundId, "updatedAt" = NOW()
      WHERE "scheduleoutboundId" = :scheduleOutboundId;
    `;
    await db.sequelize.query(updateExistingPhotosQuery, {
      replacements: {
        outboundId: newOutboundId,
        scheduleOutboundId: scheduleOutboundId,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction: t,
    });

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
          INSERT INTO public.stuffing_photos ("outboundId", "imageUrl", "createdAt", "updatedAt", "scheduleoutboundId")
          VALUES (:outboundId, :imageUrl, NOW(), NOW(), :scheduleOutboundId);
        `;
        await db.sequelize.query(photoInsertQuery, {
          replacements: {
            outboundId: newOutboundId,
            imageUrl: imageUrl, // The URL from the controller
            scheduleOutboundId: scheduleOutboundId,
          },
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
          TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD"T"HH24:MI:SS.MSOF') as "scheduledReleaseDate", 
          so."releaseWarehouse", si."storageReleaseLocation", so."transportVendor",
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
            :exLmeWarehouse, :grossWeight, :netWeight, :actualWeight, :scheduledReleaseDate, :storageReleaseLocation,
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
  getStuffingPhotosByScheduleId,
  countStuffingPhotosByScheduleId,
  updateOutboundDetails,
  createGrnAndTransactions,
  getUserSignature,
  updateUserSignature,
  // getOperators,
  confirmSelectedInbounds,
  updateOutboundWithPdfDetails,
  checkForDuplicateLots,
};
