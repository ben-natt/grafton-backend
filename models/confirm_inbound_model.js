const db = require("../database");

/**
 * Creates discrepancy reports for a list of lot IDs.
 * @param {number[]} lotIds - An array of lot IDs to report.
 * @param {number|null} reportedBy - The ID of the user reporting.
 * @param {object} [options={}] - Optional database options (e.g., transaction).
 * @returns {Promise<object[]>} - A promise resolving to the created report records.
 */
const reportConfirmation = async (lotIds, reportedBy = null, options = {}) => {
  // Use passed transaction or start a new one
  const managedTransaction = !options.transaction;
  const transaction = options.transaction || (await db.sequelize.transaction());

  try {
    const results = [];

    for (const lotId of lotIds) {
      const insertQuery = `
        INSERT INTO public.lot_reports 
        ("lotId", "reportedBy", "reportStatus", "reportedOn")
        VALUES (:lotId, :reportedBy, 'pending', NOW())
        RETURNING *;
      `;

      const insertResult = await db.sequelize.query(insertQuery, {
        replacements: { lotId, reportedBy },
        type: db.sequelize.QueryTypes.INSERT,
        transaction, // <-- Pass transaction
      });

      const createdReport = insertResult[0][0];
      results.push(createdReport);

      const updateQuery = `
        UPDATE public.lot
        SET "report" = true, "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
        WHERE "lotId" = :lotId;
      `;

      await db.sequelize.query(updateQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction, // <-- Pass transaction
      });
    }

    if (managedTransaction) await transaction.commit(); // Commit only if we started it
    return results;
  } catch (error) {
    console.error("Error creating reports and updating lot table:", error);
    if (managedTransaction) await transaction.rollback(); // Rollback only if we started it
    throw error;
  }
};

/**
 * Creates duplicate lot reports for a list of lot IDs.
 * @param {number[]} lotIds - An array of lot IDs to report as duplicates.
 * @param {number|null} reportedBy - The ID of the user reporting.
 * @param {object} [options={}] - Optional database options (e.g., transaction).
 * @returns {Promise<object[]>} - A promise resolving to the created duplicate report records.
 */
const reportDuplication = async (lotIds, reportedBy = null, options = {}) => {
  // Use passed transaction or start a new one
  const managedTransaction = !options.transaction;
  const transaction = options.transaction || (await db.sequelize.transaction());

  try {
    const results = [];

    for (const lotId of lotIds) {
      const insertQuery = `
        INSERT INTO public.lot_duplicate
        ("lotId", "reportedById", "reportedOn", "reportStatus")
        VALUES (:lotId, :reportedBy, NOW(), 'pending')
        RETURNING *;
      `;

      const insertResult = await db.sequelize.query(insertQuery, {
        replacements: { lotId, reportedBy },
        type: db.sequelize.QueryTypes.INSERT,
        transaction, // <-- Pass transaction
      });

      const createdDuplicateReport = insertResult[0][0];
      results.push(createdDuplicateReport);

      const updateQuery = `
        UPDATE public.lot
        SET "reportDuplicate" = true, "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
        WHERE "lotId" = :lotId;
      `;
      await db.sequelize.query(updateQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction, // <-- Pass transaction
      });
    }

    if (managedTransaction) await transaction.commit(); // Commit only if we started it
    return results;
  } catch (error) {
    console.error("Error creating duplicate reports:", error);
    if (managedTransaction) await transaction.rollback(); // Rollback only if we started it
    throw error;
  }
};

/**
 * Changes lot status to 'Received' and inserts records into the inbounds table.
 * @param {Array<Object>} lotsArray - An array of lot objects to process.
 * @param {number} userId - The ID of the user performing the confirmation.
 * @param {object} [options={}] - Optional database options (e.g., transaction).
 * @returns {Promise<Array<Object>>} - A promise resolving to the created inbound records.
 */
const insertInboundFromLots = async (lotsArray, userId, options = {}) => {
  // Use passed transaction or start a new one
  const managedTransaction = !options.transaction;
  const transaction = options.transaction || (await db.sequelize.transaction());

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
        transaction, // <-- Pass transaction
      });

      if (result.length === 0) {
        throw new Error(`No match found in ${table} for "${value}"`);
      }

      return result[0][idColumn];
    };

    for (const { lotId } of lotsArray) {
      const lotQuery = `
        SELECT *
        FROM public.lot
        WHERE "lotId" = :lotId AND status = 'Pending'
        LIMIT 1
      `;
      const lots = await db.sequelize.query(lotQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.SELECT,
        transaction, // <-- Pass transaction
      });

      if (lots.length === 0) {
        console.warn(
          `Skipping lot with ID ${lotId}: Not found or not pending.`
        );
        continue;
      }

      const lot = lots[0];

      // ... (rest of the logic is the same, just ensure 'transaction' is passed)

      const scheduleInboundQuery = `
        SELECT "userId" FROM public.scheduleinbounds WHERE "scheduleInboundId" = :scheduleInboundId
      `;
      const scheduleInboundResult = await db.sequelize.query(
        scheduleInboundQuery,
        {
          replacements: { scheduleInboundId: lot.scheduleInboundId },
          type: db.sequelize.QueryTypes.SELECT,
          transaction, // <-- Pass transaction
        }
      );

      if (scheduleInboundResult.length === 0) {
        throw new Error(
          `Could not find the original scheduler for lotId ${lotId}.`
        );
      }
      const schedulerUserId = scheduleInboundResult[0].userId;

      const existingQuery = `
        SELECT 1 FROM public.inbounds
        WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
        LIMIT 1
      `;
      const existing = await db.sequelize.query(existingQuery, {
        replacements: { jobNo: lot.jobNo, lotNo: lot.lotNo },
        type: db.sequelize.QueryTypes.SELECT,
        transaction, // <-- Pass transaction
      });

      if (existing.length > 0) {
        console.warn(
          `Skipping insert for jobNo ${lot.jobNo} and lotNo ${lot.lotNo}: Record already exists.`
        );
        continue;
      }

      // ... (all getIdByName calls)
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

      // --- Update Lot status ---
      await db.sequelize.query(
        `UPDATE public.lot
         SET status = 'Received', "isConfirm" = true, "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
         WHERE "lotId" = :lotId`,
        {
          replacements: { lotId },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction, // <-- Pass transaction
        }
      );

      // --- Insert into inbounds ---
      const insertQuery = `
        INSERT INTO public.inbounds (
          "jobNo", "noOfBundle", "barcodeNo", "commodityId", "shapeId",
          "exLmeWarehouseId", "exWarehouseWarrant", "inboundWarehouseId",
          "grossWeight", "netWeight", "actualWeight", "isWeighted", "isRelabelled",
          "isRebundled", "noOfMetalStraps", "isRepackProvided", "repackDescription",
          "userId", "processedId", "createdAt", "updatedAt", "brandId", "inboundDate",
          "exWarehouseLot", "scheduleInboundDate", "exWarehouseLocationId"
        ) VALUES (
          :jobNo,:noOfBundle, :barcodeNo, :commodityId, :shapeId,
          :exLmeWarehouseId, :exWarehouseWarrant, :inboundWarehouseId,
          :grossWeight, :netWeight, :actualWeight, false, false,
          false, 0, false, '', :userId, :processedId, 
          NOW(), NOW(),
          :brandId, (NOW() AT TIME ZONE 'Asia/Singapore'), :exWarehouseLot, 
          :scheduledInboundDate, :exWarehouseLocationId
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
          userId: schedulerUserId,
          processedId: userId,
          brandId,
          exWarehouseLot: lot.exWarehouseLot,
          exWarehouseLocationId,
          scheduledInboundDate: lot.inbounddate,
        },
        type: db.sequelize.QueryTypes.INSERT,
        transaction, // <-- Pass transaction
      });

      const insertedInbound = result[0];
      const bundleCheckQuery = `
        SELECT 1 FROM public.inboundbundles WHERE "lotId" = :lotId LIMIT 1
      `;
      const bundleCheck = await db.sequelize.query(bundleCheckQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.SELECT,
        transaction, // <-- Pass transaction
      });

      if (bundleCheck.length > 0) {
        // ... (Update lot and inbounds for isWeighted)
        await db.sequelize.query(
          `UPDATE public.lot
           SET "isWeighted" = true, "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
           WHERE "lotId" = :lotId`,
          {
            replacements: { lotId },
            type: db.sequelize.QueryTypes.UPDATE,
            transaction, // <-- Pass transaction
          }
        );
        await db.sequelize.query(
          `UPDATE public.inbounds
           SET "isWeighted" = true, "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
           WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo`,
          {
            replacements: { jobNo: lot.jobNo, lotNo: lot.lotNo },
            type: db.sequelize.QueryTypes.UPDATE,
            transaction, // <-- Pass transaction
          }
        );

        insertedInbound.isWeighted = true;
      }

      insertedInbounds.push(insertedInbound);
    }

    if (managedTransaction) await transaction.commit(); // Commit only if we started it
    return insertedInbounds;
  } catch (error) {
    if (managedTransaction) await transaction.rollback(); // Rollback only if we started it
    console.error("Error in insertInboundFromLots:", error);
    throw error;
  }
};

module.exports = {
  reportConfirmation,
  reportDuplication,
  insertInboundFromLots,
};
