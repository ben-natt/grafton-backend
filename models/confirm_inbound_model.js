const db = require("../database");

// MODAL TO REPORT DISCREPANCIES
const reportConfirmation = async (lotIds, reportedBy = null) => {
  try {
    const results = [];

    for (const lotId of lotIds) {
      const insertQuery = `
        INSERT INTO public.lot_reports 
        ("lotId", "reportedBy", "reportStatus", "reportedOn")
        VALUES (:lotId, :reportedBy, 'pending', CURRENT_TIMESTAMP)
        RETURNING *;
      `;

      const insertResult = await db.sequelize.query(insertQuery, {
        replacements: {
          lotId,
          reportedBy,
        },
        type: db.sequelize.QueryTypes.INSERT,
      });

      const createdReport = insertResult[0][0];
      results.push(createdReport);

      const updateQuery = `
        UPDATE public.lot
        SET "report" = true
        WHERE "lotId" = :lotId;
      `;

      await db.sequelize.query(updateQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.UPDATE,
      });
    }

    return results;
  } catch (error) {
    console.error("Error creating reports and updating lot table:", error);
    throw error;
  }
};

/**
 * Inserts records into the lot_duplicate table to report duplicated lots.
 * @param {number[]} lotIds - An array of lot IDs to be reported as duplicates.
 * @param {number|null} reportedBy - The ID of the user reporting the duplicates.
 * @returns {Promise<object[]>} - A promise that resolves to an array of the created duplicate report records.
 */
const reportDuplication = async (lotIds, reportedBy = null) => {
  try {
    const results = [];

    for (const lotId of lotIds) {
      // Insert a new record into the lot_duplicate table for each lotId.
      const insertQuery = `
        INSERT INTO public.lot_duplicate
        ("lotId", "reportedById", "reportedOn", "reportStatus")
        VALUES (:lotId, :reportedBy, CURRENT_TIMESTAMP, 'pending')
        RETURNING *;
      `;

      const insertResult = await db.sequelize.query(insertQuery, {
        replacements: {
          lotId,
          reportedBy,
        },
        type: db.sequelize.QueryTypes.INSERT,
      });

      const createdDuplicateReport = insertResult[0][0];
      results.push(createdDuplicateReport);

       const updateQuery = `
        UPDATE public.lot
        SET "duplicated" = true
        WHERE "lotId" = :lotId;
      `;
      await db.sequelize.query(updateQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.UPDATE,
      });
    }

    return results;
  } catch (error) {
    console.error("Error creating duplicate reports:", error);
    throw error;
  }
};


// MODAL TO CHANGE THE LOT STATUS AND INSERT INTO INBOUND
const insertInboundFromLots = async (lotsArray, userId) => {
  // Using the original parameter name 'userId'
  const transaction = await db.sequelize.transaction();

  try {
    const insertedInbounds = [];

    const getIdByName = async (table, nameColumn, idColumn, value) => {
      const query = `
        SELECT "${idColumn}"
        FROM public."${table}"
        WHERE LOWER("${nameColumn}") = LOWER(:value)
        LIMIT 1
      `;
      const result = await db.sequelize.query(query, {
        replacements: { value },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (result.length === 0) {
        throw new Error(`No match found in ${table} for "${value}"`);
      }

      return result[0][idColumn];
    };

    for (const { lotId } of lotsArray) {
      // 1. Fetch lot
      const lotQuery = `
        SELECT *
        FROM public.lot
        WHERE "lotId" = :lotId AND status = 'Pending'
        LIMIT 1
      `;
      const lots = await db.sequelize.query(lotQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (lots.length === 0) {
        console.warn(
          `Skipping lot with ID ${lotId}: Not found or not pending.`
        );
        continue;
      }

      const lot = lots[0];

      // Fetch the original scheduler's User ID from the scheduleinbounds table
      const scheduleInboundQuery = `
        SELECT "userId" FROM public.scheduleinbounds WHERE "scheduleInboundId" = :scheduleInboundId
      `;
      const scheduleInboundResult = await db.sequelize.query(
        scheduleInboundQuery,
        {
          replacements: { scheduleInboundId: lot.scheduleInboundId },
          type: db.sequelize.QueryTypes.SELECT,
          transaction,
        }
      );

      if (scheduleInboundResult.length === 0) {
        throw new Error(
          `Could not find the original scheduler for lotId ${lotId}.`
        );
      }
      const schedulerUserId = scheduleInboundResult[0].userId;

      // Check for existing record
      const existingQuery = `
        SELECT 1 FROM public.inbounds
        WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
        LIMIT 1
      `;
      const existing = await db.sequelize.query(existingQuery, {
        replacements: { jobNo: lot.jobNo, lotNo: lot.lotNo },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (existing.length > 0) {
        console.warn(
          `Skipping insert for jobNo ${lot.jobNo} and lotNo ${lot.lotNo}: Record already exists.`
        );
        continue;
      }

      // Convert name fields to ID
      const commodityId = await getIdByName(
        "commodities",
        "commodityName",
        "commodityId",
        lot.commodity
      );
      const shapeId = await getIdByName(
        "shapes",
        "shapeName",
        "shapeId",
        lot.shape
      );
      const brandId = await getIdByName(
        "brands",
        "brandName",
        "brandId",
        lot.brand
      );
      const exLmeWarehouseId = await getIdByName(
        "exlmewarehouses",
        "exLmeWarehouseName",
        "exLmeWarehouseId",
        lot.exLmeWarehouse
      );
      const inboundWarehouseId = await getIdByName(
        "inboundwarehouses",
        "inboundWarehouseName",
        "inboundWarehouseId",
        lot.inboundWarehouse
      );
      const exWarehouseLocationId = await getIdByName(
        "exwarehouselocations",
        "exWarehouseLocationName",
        "exWarehouseLocationId",
        lot.exWarehouseLocation
      );

      // Update lot status
      await db.sequelize.query(
        `UPDATE public.lot
         SET status = 'Received', "isConfirm" = true, "updatedAt" = NOW()
         WHERE "lotId" = :lotId`,
        {
          replacements: { lotId },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction,
        }
      );

      // Update the INSERT statement
      const insertQuery = `
        INSERT INTO public.inbounds (
          "jobNo", "lotNo", "noOfBundle", "barcodeNo", "commodityId", "shapeId",
          "exLmeWarehouseId", "exWarehouseWarrant", "inboundWarehouseId",
          "grossWeight", "netWeight", "actualWeight", "isWeighted", "isRelabelled",
          "isRebundled", "noOfMetalStraps", "isRepackProvided", "repackDescription",
          "userId", "processedId", "createdAt", "updatedAt", "brandId", "inboundDate",
          "exWarehouseLot", "scheduleInboundDate", "exWarehouseLocationId"
        ) VALUES (
          :jobNo, :lotNo, :noOfBundle, :barcodeNo, :commodityId, :shapeId,
          :exLmeWarehouseId, :exWarehouseWarrant, :inboundWarehouseId,
          :grossWeight, :netWeight, :actualWeight, false, false,
          false, 0, false, '', :userId, :processedId, NOW(), NOW(),
          :brandId, NOW(), :exWarehouseLot, NOW(), :exWarehouseLocationId
        )
        RETURNING *;
      `;

      const [result] = await db.sequelize.query(insertQuery, {
        replacements: {
          jobNo: lot.jobNo,
          lotNo: lot.lotNo,
          noOfBundle: lot.expectedBundleCount,
          barcodeNo: `BC-${lot.lotId}`,
          commodityId,
          shapeId,
          exLmeWarehouseId,
          exWarehouseWarrant: lot.exWarehouseWarrant,
          inboundWarehouseId,
          grossWeight: lot.grossWeight,
          netWeight: lot.netWeight,
          actualWeight: lot.actualWeight,
          userId: schedulerUserId, // Original scheduler's ID
          processedId: userId, // Logged-in user's ID (from the function parameter)
          brandId,
          exWarehouseLot: lot.exWarehouseLot,
          exWarehouseLocationId,
        },
        type: db.sequelize.QueryTypes.INSERT,
        transaction,
      });

      insertedInbounds.push(result[0]);
    }

    await transaction.commit();
    return insertedInbounds;
  } catch (error) {
    await transaction.rollback();
    console.error("Error in insertInboundFromLots:", error);
    throw error;
  }
};

module.exports = {
  reportConfirmation,
  reportDuplication,
  insertInboundFromLots,
};
