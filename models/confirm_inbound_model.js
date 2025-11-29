const db = require("../database");

/**
 * Creates discrepancy reports for a list of lot IDs.
 */
const reportConfirmation = async (lotIds, reportedBy = null, options = {}) => {
  const transaction = options.transaction || (await db.sequelize.transaction());
  const managedTransaction = !options.transaction;

  try {
    const results = [];
    const ids = Array.isArray(lotIds) ? lotIds : [lotIds];

    for (const lotId of ids) {
      // 1. Create Report
      const insertQuery = `
        INSERT INTO public.lot_reports 
        ("lotId", "reportedBy", "reportStatus", "reportedOn")
        VALUES (:lotId, :reportedBy, 'pending', NOW())
        RETURNING *;
      `;
      const insertResult = await db.sequelize.query(insertQuery, {
        replacements: { lotId, reportedBy: String(reportedBy) },
        type: db.sequelize.QueryTypes.INSERT,
        transaction,
      });
      results.push(insertResult[0][0]);

      // 2. Update Lot
      await db.sequelize.query(
        `UPDATE public.lot
         SET "report" = true, "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
         WHERE "lotId" = :lotId`,
        {
          replacements: { lotId },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction,
        }
      );
    }

    if (managedTransaction) await transaction.commit();
    return results;
  } catch (error) {
    console.error("Error in reportConfirmation:", error);
    if (managedTransaction) await transaction.rollback();
    throw error;
  }
};

/**
 * Creates duplicate lot reports.
 */
const reportDuplication = async (lotIds, reportedBy = null, options = {}) => {
  const transaction = options.transaction || (await db.sequelize.transaction());
  const managedTransaction = !options.transaction;

  try {
    const results = [];
    const ids = Array.isArray(lotIds) ? lotIds : [lotIds];

    for (const lotId of ids) {
      const insertQuery = `
        INSERT INTO public.lot_duplicate
        ("lotId", "reportedById", "reportedOn", "reportStatus")
        VALUES (:lotId, :reportedBy, NOW(), 'pending')
        RETURNING *;
      `;
      const insertResult = await db.sequelize.query(insertQuery, {
        replacements: { lotId, reportedBy },
        type: db.sequelize.QueryTypes.INSERT,
        transaction,
      });
      results.push(insertResult[0][0]);

      const updateQuery = `
        UPDATE public.lot
        SET "reportDuplicate" = true, "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
        WHERE "lotId" = :lotId;
      `;
      await db.sequelize.query(updateQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction,
      });
    }

    if (managedTransaction) await transaction.commit();
    return results;
  } catch (error) {
    console.error("Error in reportDuplication:", error);
    if (managedTransaction) await transaction.rollback();
    throw error;
  }
};

/**
 * Confirm Inbound: Updates status to 'Received' and creates Inbound record.
 * Uses SQL Subqueries for robust ID lookups.
 */
const insertInboundFromLots = async (lotsArray, userId, options = {}) => {
  const transaction = options.transaction || (await db.sequelize.transaction());
  const managedTransaction = !options.transaction;

  try {
    const insertedInbounds = [];

    for (const lotItem of lotsArray) {
      // Handle both full objects or simple objects with just lotId
      const lotId = lotItem.lotId;

      // 1. Fetch Lot Details
      const lotQuery = `SELECT * FROM public.lot WHERE "lotId" = :lotId LIMIT 1`;
      const lots = await db.sequelize.query(lotQuery, {
        replacements: { lotId },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (lots.length === 0) {
        console.warn(`[InsertInbound] Lot ${lotId} not found or invalid.`);
        continue;
      }
      const lot = lots[0];

      // 2. Check if already exists (Idempotency check)
      const existingQuery = `
        SELECT 1 FROM public.inbounds WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo LIMIT 1
      `;
      const existing = await db.sequelize.query(existingQuery, {
        replacements: { jobNo: lot.jobNo, lotNo: lot.lotNo },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (existing.length > 0) {
        console.log(
          `[InsertInbound] Skipped ${lot.jobNo}-${lot.lotNo}, already exists.`
        );

        // Even if it exists, ensure the Lot status is updated to 'Received' to clean up Pending list
        await db.sequelize.query(
          `UPDATE public.lot SET status = 'Received' WHERE "lotId" = :lotId`,
          {
            replacements: { lotId },
            type: db.sequelize.QueryTypes.UPDATE,
            transaction,
          }
        );
        continue;
      }

      // 3. Find Scheduler User ID (Default to current user if missing)
      let schedulerUserId = userId;
      if (lot.scheduleInboundId) {
        const scheduleRes = await db.sequelize.query(
          `SELECT "userId" FROM public.scheduleinbounds WHERE "scheduleInboundId" = :id`,
          {
            replacements: { id: lot.scheduleInboundId },
            type: db.sequelize.QueryTypes.SELECT,
            transaction,
          }
        );
        if (scheduleRes.length > 0) schedulerUserId = scheduleRes[0].userId;
      }

      // 4. Update Lot Status
      await db.sequelize.query(
        `UPDATE public.lot
         SET status = 'Received', "isConfirm" = true, "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
         WHERE "lotId" = :lotId`,
        {
          replacements: { lotId },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction,
        }
      );

      // 5. Robust INSERT with Subqueries (Lookups happen inside SQL)
      // This prevents crashing if a specific Brand string doesn't match exactly.
      const insertQuery = `
        INSERT INTO public.inbounds (
          "jobNo", "lotNo", "noOfBundle", "barcodeNo", 
          "grossWeight", "netWeight", "actualWeight", 
          "userId", "processedId", "createdAt", "updatedAt", 
          "inboundDate", "exWarehouseLot", "exWarehouseWarrant", "scheduleInboundDate",
          "isWeighted", "isRelabelled", "isRebundled", "noOfMetalStraps", "isRepackProvided", "repackDescription",
          "commodityId", "shapeId", "brandId", "exLmeWarehouseId", "inboundWarehouseId", "exWarehouseLocationId"
        )
        VALUES (
          :jobNo, :lotNo, :noOfBundle, :barcodeNo,
          :grossWeight, :netWeight, :actualWeight,
          :schedulerUserId, :processedId, NOW(), NOW(),
          (NOW() AT TIME ZONE 'Asia/Singapore'), :exWarehouseLot, :exWarehouseWarrant, :scheduledInboundDate,
          false, false, false, 0, false, '',
          (SELECT "commodityId" FROM public.commodities WHERE "commodityName" ILIKE :commodity LIMIT 1),
          (SELECT "shapeId" FROM public.shapes WHERE "shapeName" ILIKE :shape LIMIT 1),
          (SELECT "brandId" FROM public.brands WHERE "brandName" ILIKE :brand LIMIT 1),
          (SELECT "exLmeWarehouseId" FROM public.exlmewarehouses WHERE "exLmeWarehouseName" ILIKE :exLmeWarehouse LIMIT 1),
          (SELECT "inboundWarehouseId" FROM public.inboundwarehouses WHERE "inboundWarehouseName" ILIKE :inboundWarehouse LIMIT 1),
          (SELECT "exWarehouseLocationId" FROM public.exwarehouselocations WHERE "exWarehouseLocationName" ILIKE :exWarehouseLocation LIMIT 1)
        )
        RETURNING *;
      `;

      const replacements = {
        jobNo: lot.jobNo,
        lotNo: lot.lotNo,
        noOfBundle: lot.expectedBundleCount || 0,
        barcodeNo: `BC-${lot.lotId}`,
        grossWeight: lot.grossWeight || 0,
        netWeight: lot.netWeight || 0,
        actualWeight: lot.actualWeight || 0,
        schedulerUserId: schedulerUserId,
        processedId: userId,
        exWarehouseLot: lot.exWarehouseLot,
        exWarehouseWarrant: lot.exWarehouseWarrant,
        scheduledInboundDate: lot.inbounddate,
        // String values for lookups:
        commodity: lot.commodity || "",
        shape: lot.shape || "",
        brand: lot.brand || "",
        exLmeWarehouse: lot.exLmeWarehouse || "",
        inboundWarehouse: lot.inboundWarehouse || "",
        exWarehouseLocation: lot.exWarehouseLocation || "",
      };

      const [result] = await db.sequelize.query(insertQuery, {
        replacements,
        type: db.sequelize.QueryTypes.INSERT,
        transaction,
      });

      const insertedInbound = result[0];

      // 6. Check for existing bundles to update "isWeighted" flag
      const bundleCheck = await db.sequelize.query(
        `SELECT 1 FROM public.inboundbundles WHERE "lotId" = :lotId LIMIT 1`,
        {
          replacements: { lotId },
          type: db.sequelize.QueryTypes.SELECT,
          transaction,
        }
      );

      if (bundleCheck.length > 0) {
        await db.sequelize.query(
          `UPDATE public.lot SET "isWeighted" = true WHERE "lotId" = :lotId`,
          {
            replacements: { lotId },
            type: db.sequelize.QueryTypes.UPDATE,
            transaction,
          }
        );
        // Note: The newly created inbound might need update, but usually the bundle sync handles this separately.
        insertedInbound.isWeighted = true;
      }

      insertedInbounds.push(insertedInbound);
    }

    if (managedTransaction) await transaction.commit();
    return insertedInbounds;
  } catch (error) {
    console.error("[InsertInboundFromLots] Error:", error);
    if (managedTransaction) await transaction.rollback();
    throw error;
  }
};

module.exports = {
  reportConfirmation,
  reportDuplication,
  insertInboundFromLots,
};
