const db = require("../database");
const deleteExistingBundles = async (idValue, isInbound) => {
  try {
    const idField = isInbound ? 'inboundId' : 'lotId';
    const query = `
      DELETE FROM public.inboundbundles 
      WHERE "${idField}" = :idValue
    `;

    const result = await db.sequelize.query(query, {
      replacements: { idValue },
      type: db.sequelize.QueryTypes.DELETE,
    });

    console.log(`Existing bundles deleted for ${idField}:`, idValue);
    return result;
  } catch (error) {
    console.error("Error deleting existing bundles:", error);
    throw error;
  }
};

const insertBundle = async (idValue, isInbound, bundleNo, weight, meltNo) => {
  try {
    const idField = isInbound ? 'inboundId' : 'lotId';
    const query = `
      INSERT INTO public.inboundbundles 
      ("${idField}", "bundleNo", weight, "meltNo", "isOutbounded", "createdAt", "updatedAt")
      VALUES (:idValue, :bundleNo, :weight, :meltNo, false, NOW(), NOW())
      RETURNING *
    `;

    const result = await db.sequelize.query(query, {
      replacements: { 
        idValue, 
        bundleNo, 
        weight, 
        meltNo: meltNo || null 
      },
      type: db.sequelize.QueryTypes.INSERT,
    });

    if (result.length > 0) {
      console.log("Bundle inserted successfully:", result[0]);
      return result[0];
    }
    return null;
  } catch (error) {
    console.error("Error inserting bundle:", error);
    throw error;
  }
};

// Inbound functions
const updateInboundActualWeight = async (inboundId, actualWeight) => {
  try {
    const query = `
      UPDATE public.inbounds 
      SET "actualWeight" = :actualWeight, 
          "isWeighted" = true, 
          "updatedAt" = NOW()
      WHERE "inboundId" = :inboundId
      RETURNING *
    `;

    const result = await db.sequelize.query(query, {
      replacements: { inboundId, actualWeight },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    if (result.length > 0) {
      console.log("Inbound updated successfully:", result[0]);
      return result[0];
    }
    return null;
  } catch (error) {
    console.error("Error updating inbound actual weight:", error);
    throw error;
  }
};

const saveInboundWithBundles = async (inboundId, actualWeight, bundles) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    await updateInboundActualWeight(inboundId, actualWeight);
    await deleteExistingBundles(inboundId, true);
    
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await insertBundle(
        inboundId,
        true,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo
      );
      savedBundles.push(savedBundle);
    }

    await transaction.commit();
    return { inboundId, actualWeight, bundles: savedBundles };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getInboundWithBundles = async (inboundId) => {
  try {
    const query = `
      SELECT 
        i.*,
        ib."inboundBundleId",
        ib."bundleNo",
        ib.weight as "bundleWeight",
        ib."meltNo",
        ib."isOutbounded",
        ib."createdAt" as "bundleCreatedAt"
      FROM public.inbounds i
      LEFT JOIN public.inboundbundles ib ON i."inboundId" = ib."inboundId"
      WHERE i."inboundId" = :inboundId
      ORDER BY ib."bundleNo"
    `;

    const result = await db.sequelize.query(query, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result.length > 0 ? result : [];
  } catch (error) {
    throw error;
  }
};

// Lot functions
const updateLotActualWeight = async (lotId, actualWeight) => {
  try {
    const query = `
      UPDATE public.lot 
      SET "actualWeight" = :actualWeight, 
          "isWeighted" = true, 
          "updatedAt" = NOW()
      WHERE "lotId" = :lotId
      RETURNING *
    `;

    const result = await db.sequelize.query(query, {
      replacements: { lotId, actualWeight },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    if (result.length > 0) {
      console.log("Lot updated successfully:", result[0]);
      return result[0];
    }
    return null;
  } catch (error) {
    throw error;
  }
};

const saveLotWithBundles = async (lotId, actualWeight, bundles) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    await updateLotActualWeight(lotId, actualWeight);
    await deleteExistingBundles(lotId, false);
    
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await insertBundle(
        lotId,
        false,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo
      );
      savedBundles.push(savedBundle);
    }

    await transaction.commit();
    return { lotId, actualWeight, bundles: savedBundles };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getLotWithBundles = async (lotId) => {
  try {
    const query = `
      SELECT 
        l.*,
        ib."inboundBundleId" as "lotBundleId",
        ib."bundleNo",
        ib.weight as "bundleWeight",
        ib."meltNo",
        ib."isOutbounded",
        ib."createdAt" as "bundleCreatedAt"
      FROM public.lot l
      LEFT JOIN public.inboundbundles ib ON l."lotId" = ib."lotId"
      WHERE l."lotId" = :lotId
      ORDER BY ib."bundleNo"
    `;

    const result = await db.sequelize.query(query, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result.length > 0 ? result : [];
  } catch (error) {
    throw error;
  }
};

// Unified bundle functions
const updateSingleBundle = async (bundleId, weight, meltNo) => {
  try {
    const query = `
      UPDATE public.inboundbundles 
      SET weight = :weight, 
          "meltNo" = :meltNo, 
          "updatedAt" = NOW()
      WHERE "inboundBundleId" = :bundleId
      RETURNING *
    `;

    const result = await db.sequelize.query(query, {
      replacements: { 
        bundleId, 
        weight, 
        meltNo: meltNo || null 
      },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    throw error;
  }
};

const getBundlesIfWeighted = async (idValue, isInbound) => {
  try {
    const idField = isInbound ? 'inboundId' : 'lotId';
    const table = isInbound ? 'inbounds' : 'lot';
    
    // Check if weighted
    const checkQuery = `
      SELECT "isWeighted" FROM public.${table} 
      WHERE "${idField}" = :idValue
      LIMIT 1;
    `;

    const [record] = await db.sequelize.query(checkQuery, {
      replacements: { idValue },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (!record || record.isWeighted !== true) return [];

    // Get bundles
    const bundlesQuery = `
      SELECT 
        "inboundBundleId",
        "${idField}" as "parentId",
        "bundleNo",
        weight,
        "meltNo",
        "isOutbounded",
        "createdAt",
        "updatedAt"
      FROM public.inboundbundles
      WHERE "${idField}" = :idValue
      ORDER BY "bundleNo";
    `;

    return await db.sequelize.query(bundlesQuery, {
      replacements: { idValue },
      type: db.sequelize.QueryTypes.SELECT,
    });
  } catch (error) {
    throw error;
  }
};

module.exports = {
  // Inbound functions
  updateInboundActualWeight,
  saveInboundWithBundles,
  getInboundWithBundles,
  
  // Lot functions
  updateLotActualWeight,
  saveLotWithBundles,
  getLotWithBundles,
  
  // Unified functions
  updateSingleBundle,
  getBundlesIfWeighted
};