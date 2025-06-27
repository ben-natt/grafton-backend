const db = require("../database");

// MODAL TO REPORT
const reportConfirmation = async (lotIds) => {
  try {
    const query = `
      UPDATE public.lot
      SET "report" = true
      WHERE "lotId" IN (:lotIds)
      RETURNING *;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { lotIds },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    return result; // Returns updated rows
  } catch (error) {
    console.error("Error updating report status:", error);
    throw error;
  }
};


// MODAL TO CHANGE THE LOT STATUS AND INSERT INTO INBOUND
const insertInboundFromLots = async (lotsArray, userId) => {
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
        console.warn(`Skipping lot with ID ${lotId}: Not found or not pending.`);
        continue;
      }

      const lot = lots[0];

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
        console.warn(`Skipping insert for jobNo ${lot.jobNo} and lotNo ${lot.lotNo}: Record already exists.`);
        continue;
      }

      // Convert name fields to ID
      const commodityId = await getIdByName("commodities", "commodityName", "commodityId", lot.commodity);
      const shapeId = await getIdByName("shapes", "shapeName", "shapeId", lot.shape);
      const brandId = await getIdByName("brands", "brandName", "brandId", lot.brand);
      const exLmeWarehouseId = await getIdByName("exlmewarehouses", "exLmeWarehouseName", "exLmeWarehouseId", lot.exLmeWarehouse);
      const inboundWarehouseId = await getIdByName("inboundwarehouses", "inboundWarehouseName", "inboundWarehouseId", lot.inboundWarehouse);
      const exWarehouseLocationId = await getIdByName("exwarehouselocations", "exWarehouseLocationName", "exWarehouseLocationId", lot.exWarehouseLocation);

      // Update lot status
      await db.sequelize.query(
        `UPDATE public.lot SET status = 'Received', "updatedAt" = NOW()
         WHERE "lotId" = :lotId`,
        {
          replacements: { lotId },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction,
        }
      );

      // Insert into inbounds
      const insertQuery = `
        INSERT INTO public.inbounds (
          "jobNo", "lotNo", "noOfBundle", "barcodeNo", "commodityId", "shapeId",
          "exLmeWarehouseId", "exWarehouseWarrant", "inboundWarehouseId",
          "grossWeight", "netWeight", "actualWeight", "isWeighted", "isRelabelled",
          "isRebundled", "noOfMetalStraps", "isRepackProvided", "repackDescription",
          "userId", "createdAt", "updatedAt", "brandId", "inboundDate",
          "exWarehouseLot", "scheduleInboundDate", "exWarehouseLocationId"
        ) VALUES (
          :jobNo, :lotNo, :noOfBundle, :barcodeNo, :commodityId, :shapeId,
          :exLmeWarehouseId, :exWarehouseWarrant, :inboundWarehouseId,
          :grossWeight, :netWeight, :actualWeight, false, false,
          false, 0, false, '', :userId, NOW(), NOW(),
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
          userId,
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
  insertInboundFromLots
};
