const db = require("../database");

const upsertBundle = async (idValue, isInbound, bundleNo, weight, meltNo) => {
  try {
    const idField = isInbound ? 'inboundId' : 'lotId';
    
    // console.log(`\n=== UPSERT BUNDLE ${bundleNo} (IGNORE REPACK FLAGS) ===`);
    // console.log(`${idField}: ${idValue}, Weight: ${weight}`);
    
    // UPDATED: Find ANY bundle with this ID and bundle number (ignore repack flags)
    const findQuery = `
      SELECT "inboundBundleId", "isRelabelled", "isRebundled", "isRepackProvided"
      FROM public.inboundbundles 
      WHERE "${idField}" = :idValue 
      AND "bundleNo" = :bundleNo
      ORDER BY "createdAt" DESC
      LIMIT 1
    `;

    console.log("Find Query:", findQuery);
    const existing = await db.sequelize.query(findQuery, {
      replacements: { idValue, bundleNo },
      type: db.sequelize.QueryTypes.SELECT,
    });

    console.log(`Found ${existing.length} existing bundles`);
    if (existing.length > 0) {
      console.log("Existing bundle flags:", {
        id: existing[0].inboundBundleId,
        isRelabelled: existing[0].isRelabelled,
        isRebundled: existing[0].isRebundled,
        isRepackProvided: existing[0].isRepackProvided
      });
    }

    if (existing.length > 0) {
      // UPDATED: Update the bundle regardless of repack flags
      const updateQuery = `
        UPDATE public.inboundbundles 
        SET weight = :weight, 
            "meltNo" = :meltNo, 
            "updatedAt" = NOW()
        WHERE "${idField}" = :idValue 
        AND "bundleNo" = :bundleNo
        AND "inboundBundleId" = :bundleId
        RETURNING *
      `;

      const result = await db.sequelize.query(updateQuery, {
        replacements: { 
          idValue, 
          bundleNo, 
          weight, 
          meltNo: meltNo || null,
          bundleId: existing[0].inboundBundleId
        },
        type: db.sequelize.QueryTypes.UPDATE,
      });

      if (result.length > 0) {
        console.log("Updated existing bundle (ignoring repack flags)");
        return result[0];
      } else {
        console.log("Update failed");
      }
    } else {
      // Insert new bundle only if none exists
      console.log("🔍 No existing bundle found - inserting new one");
      
      const insertQuery = isInbound ? `
        INSERT INTO public.inboundbundles 
        ("inboundId", "bundleNo", weight, "meltNo", "isOutbounded", "createdAt", "updatedAt",
         "isRelabelled", "isRebundled", "isRepackProvided")
        VALUES (:idValue, :bundleNo, :weight, :meltNo, false, NOW(), NOW(), false, false, false)
        RETURNING *
      ` : `
        INSERT INTO public.inboundbundles 
        ("lotId", "bundleNo", weight, "meltNo", "isOutbounded", "createdAt", "updatedAt",
         "isRelabelled", "isRebundled", "isRepackProvided")
        VALUES (:idValue, :bundleNo, :weight, :meltNo, false, NOW(), NOW(), false, false, false)
        RETURNING *
      `;
      
      const result = await db.sequelize.query(insertQuery, {
        replacements: { idValue, bundleNo, weight, meltNo: meltNo || null },
        type: db.sequelize.QueryTypes.INSERT,
      });
      
      console.log("Inserted new bundle");
      return result.length > 0 ? result[0] : null;
    }
    return null;
  } catch (error) {
    console.error("Error in upsert:", error);
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
    // Update inbound actual weight
    await updateInboundActualWeight(inboundId, actualWeight);
    
    // Upsert bundles (update existing, insert new)
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        inboundId,
        true,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo
      );
      if (savedBundle) {
        savedBundles.push(savedBundle);
      }
    }

    await transaction.commit();
    return { inboundId, actualWeight, bundles: savedBundles };
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving inbound with bundles:", error);
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
        ib."isRelabelled",
        ib."isRebundled",
        ib."isRepackProvided",
        ib."noOfMetalStrap",
        ib."repackDescription",
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
    console.error("Error getting inbound with bundles:", error);
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
    console.error("Error updating lot actual weight:", error);
    throw error;
  }
};

const saveLotWithBundles = async (lotId, actualWeight, bundles) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Update lot actual weight
    await updateLotActualWeight(lotId, actualWeight);
    
    // Upsert bundles (update existing, insert new)
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        lotId,
        false,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo
      );
      if (savedBundle) {
        savedBundles.push(savedBundle);
      }
    }

    await transaction.commit();
    return { lotId, actualWeight, bundles: savedBundles };
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving lot with bundles:", error);
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
        ib."isRelabelled",
        ib."isRebundled",
        ib."isRepackProvided",
        ib."noOfMetalStrap",
        ib."repackDescription",
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
    console.error("Error getting lot with bundles:", error);
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
    console.error("Error updating single bundle:", error);
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
        "isRelabelled",
        "isRebundled",
        "isRepackProvided",
        "noOfMetalStrap",
        "repackDescription",
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
    console.error("Error getting bundles if weighted:", error);
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
  getBundlesIfWeighted,
  upsertBundle
};