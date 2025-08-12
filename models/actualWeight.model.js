const db = require("../database");

// Helper function to find related ID (inboundId if lotId is provided, or lotId if inboundId is provided)
const findRelatedId = async (providedId, isLotId) => {
  try {
    if (isLotId) {
      // If lotId is provided, find corresponding inboundId
      const lotQuery = `
        SELECT "jobNo", "lotNo" 
        FROM public.lot 
        WHERE "lotId" = :providedId
        LIMIT 1
      `;
      
      const [lot] = await db.sequelize.query(lotQuery, {
        replacements: { providedId },
        type: db.sequelize.QueryTypes.SELECT,
      });
      
      if (!lot) return null;
      
      const inboundQuery = `
        SELECT "inboundId" 
        FROM public.inbounds 
        WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
        LIMIT 1
      `;
      
      const [inbound] = await db.sequelize.query(inboundQuery, {
        replacements: { jobNo: lot.jobNo, lotNo: lot.lotNo },
        type: db.sequelize.QueryTypes.SELECT,
      });
      
      return inbound ? inbound.inboundId : null;
    } else {
      // If inboundId is provided, find corresponding lotId
      const inboundQuery = `
        SELECT "jobNo", "lotNo" 
        FROM public.inbounds 
        WHERE "inboundId" = :providedId
        LIMIT 1
      `;
      
      const [inbound] = await db.sequelize.query(inboundQuery, {
        replacements: { providedId },
        type: db.sequelize.QueryTypes.SELECT,
      });
      
      if (!inbound) return null;
      
      const lotQuery = `
        SELECT "lotId" 
        FROM public.lot 
        WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
        LIMIT 1
      `;
      
      const [lot] = await db.sequelize.query(lotQuery, {
        replacements: { jobNo: inbound.jobNo, lotNo: inbound.lotNo },
        type: db.sequelize.QueryTypes.SELECT,
      });
      
      return lot ? lot.lotId : null;
    }
  } catch (error) {
    console.error("Error finding related ID:", error);
    return null;
  }
};

const upsertBundle = async (idValue, isInbound, bundleNo, weight, meltNo, relatedId = null) => {
  try {
    const idField = isInbound ? 'inboundId' : 'lotId';
    const relatedIdField = isInbound ? 'lotId' : 'inboundId';
    
    // Find ANY bundle with this ID and bundle number (ignore repack flags)
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
      // Update the bundle regardless of repack flags, and update related ID if provided
      const updateQuery = `
        UPDATE public.inboundbundles 
        SET weight = :weight, 
            "meltNo" = :meltNo, 
            "${relatedIdField}" = COALESCE(:relatedId, "${relatedIdField}"),
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
          relatedId,
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
      // Insert new bundle with both IDs
      const insertQuery = `
        INSERT INTO public.inboundbundles 
        ("inboundId", "lotId", "bundleNo", weight, "meltNo", "isOutbounded", "createdAt", "updatedAt",
         "isRelabelled", "isRebundled", "isRepackProvided", "isDuplicated")
        VALUES (:inboundId, :lotId, :bundleNo, :weight, :meltNo, false, NOW(), NOW(), false, false, false, false)
        RETURNING *
      `;
      
      const replacements = {
        inboundId: isInbound ? idValue : relatedId,
        lotId: isInbound ? relatedId : idValue,
        bundleNo,
        weight,
        meltNo: meltNo || null
      };
      
      const result = await db.sequelize.query(insertQuery, {
        replacements,
        type: db.sequelize.QueryTypes.INSERT,
      });
      
      console.log("Inserted new bundle with both IDs");
      return result.length > 0 ? result[0] : null;
    }
    return null;
  } catch (error) {
    console.error("Error in upsert:", error);
    throw error;
  }
};

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
    // Find related lotId
    const relatedLotId = await findRelatedId(inboundId, false);
    
    // Update inbound actual weight
    await updateInboundActualWeight(inboundId, actualWeight);
    
    // Also update related lot if exists
    if (relatedLotId) {
      await updateLotActualWeight(relatedLotId, actualWeight);
    }
    
    // Upsert bundles (update existing, insert new)
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        inboundId,
        true,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo,
        relatedLotId
      );
      if (savedBundle) {
        savedBundles.push(savedBundle);
      }
    }

    await transaction.commit();
    return { inboundId, lotId: relatedLotId, actualWeight, bundles: savedBundles };
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving inbound with bundles:", error);
    throw error;
  }
};

// update the lotId actual weight
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

// combination of the lotId and inboundId, has the related Id
const saveLotWithBundles = async (lotId, actualWeight, bundles) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Find related inboundId
    const relatedInboundId = await findRelatedId(lotId, true);
    
    // Update lot actual weight
    await updateLotActualWeight(lotId, actualWeight);
    
    // Also update related inbound if exists
    if (relatedInboundId) {
      await updateInboundActualWeight(relatedInboundId, actualWeight);
    }
    
    // Upsert bundles (update existing, insert new)
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        lotId,
        false,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo,
        relatedInboundId
      );
      if (savedBundle) {
        savedBundles.push(savedBundle);
      }
    }

    await transaction.commit();
    return { lotId, inboundId: relatedInboundId, actualWeight, bundles: savedBundles };
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving lot with bundles:", error);
    throw error;
  }
};

// get bundles if weighted from backend
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
        "inboundId",
        "lotId",
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

// User-provided function to update the report status
const updateReportStatus = async ({ lotId, reportStatus, resolvedBy }) => {
  try {
    const query = `
      WITH updated_lot AS (
        UPDATE public.lot
        SET "reportDuplicate" = false,
            "isDuplicated" = CASE 
                WHEN :reportStatus = 'accepted' THEN true 
                ELSE false 
            END
        WHERE "lotId" = :lotId
        RETURNING *
      )
      UPDATE public.lot_duplicate
      SET "reportStatus" = :reportStatus,
          "resolvedById" = :resolvedBy,
          "resolvedOn" = NOW(),
          "isResolved" = true,
          "updatedAt" = NOW()
      WHERE "lotId" = :lotId
        AND "reportStatus" = 'pending'
      RETURNING *;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { lotId, reportStatus, resolvedBy },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    return result[0];
  } catch (error) {
    console.error("Error updating report resolution:", error);
    throw error;
  }
};

const duplicateActualWeightBundles = async (sourceExWLot, targetExWLot, resolvedBy) => {
  console.log(`[DEBUG] Model: Starting duplicateActualWeightBundles.`);
  const transaction = await db.sequelize.transaction();
  try {
    // 1. Find the target "coming lot"
    const targetLotQuery = `
      SELECT "lotId" 
      FROM public.lot 
      WHERE "exWarehouseLot" = :targetExWLot
      ORDER BY "createdAt" DESC
      LIMIT 1;
    `;
    const [targetLot] = await db.sequelize.query(targetLotQuery, {
      replacements: { targetExWLot },
      type: db.sequelize.QueryTypes.SELECT,
      transaction,
    });

    if (!targetLot) {
      throw new Error(`Target "coming lot" with Ex-Warehouse Lot '${targetExWLot}' not found.`);
    }
    const targetLotId = targetLot.lotId;

    // 2. Find the source inboundId from the latest outbound transaction
    const sourceTransactionQuery = `
      SELECT "inboundId"
      FROM public.outboundtransactions
      WHERE "exWarehouseLot" = :sourceExWLot
      ORDER BY "createdAt" DESC
      LIMIT 1;
    `;
    const [sourceTransaction] = await db.sequelize.query(sourceTransactionQuery, {
        replacements: { sourceExWLot },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
    });
    
    if (!sourceTransaction || !sourceTransaction.inboundId) {
        throw new Error(`No previous outbounded transaction found for Ex-Warehouse Lot '${sourceExWLot}' to copy weights from.`);
    }
    const sourceInboundId = sourceTransaction.inboundId;
    
    // 3. Fetch all original bundles
    const sourceBundlesQuery = `
      SELECT * FROM public.inboundbundles
      WHERE "inboundId" = :sourceInboundId
      AND "isRelabelled" = false 
      AND "isRebundled" = false
      AND "isRepackProvided" = false;
    `;
    const sourceBundles = await db.sequelize.query(sourceBundlesQuery, {
      replacements: { sourceInboundId },
      type: db.sequelize.QueryTypes.SELECT,
      transaction,
    });

    if (sourceBundles.length === 0) {
      throw new Error(`No original weighted bundles found for the historical inbound record (inboundId: ${sourceInboundId}).`);
    }

    // 4. Calculate total actual weight
    const totalActualWeight = sourceBundles.reduce((sum, bundle) => sum + parseFloat(bundle.weight || 0), 0);

    // 5. Update the target lot's weight
    await updateLotActualWeight(targetLotId, totalActualWeight, transaction);
    
    // 6. Insert the copied bundles
    const insertQuery = `
      INSERT INTO public.inboundbundles
      ("inboundId", "lotId", "bundleNo", weight, "meltNo", "isOutbounded", "createdAt", "updatedAt",
       "isRelabelled", "isRebundled", "isRepackProvided", "isDuplicated")
      VALUES (NULL, :lotId, :bundleNo, :weight, :meltNo, false, NOW(), NOW(), false, false, false, true)
    `;
    for (const bundle of sourceBundles) {
      await db.sequelize.query(insertQuery, {
        replacements: {
          lotId: targetLotId,
          bundleNo: bundle.bundleNo,
          weight: bundle.weight,
          meltNo: bundle.meltNo || null,
        },
        type: db.sequelize.QueryTypes.INSERT,
        transaction,
      });
    }
    await transaction.commit();

    // STEP 7: Update Report Status ----
    try {
        await updateReportStatus({
            lotId: targetLotId,
            reportStatus: 'accepted', // Set status to accepted
            resolvedBy: resolvedBy     // Use the provided user ID
        });
        console.log(`[DEBUG] Model: Successfully updated report status for lotId ${targetLotId}.`);
    } catch (reportError) {
        console.error(`[ERROR] Duplication succeeded, but failed to update report status for lotId ${targetLotId}:`, reportError);
    }

    return {
      message: `Successfully duplicated ${sourceBundles.length} bundles to lot ${targetLotId}.`,
      targetLotId,
    };

  } catch (error) {
    await transaction.rollback();
    console.error("[DEBUG] Error inside duplicateActualWeightBundles model function:", error);
    throw error;
  }
};




module.exports = {
  // Helper function
  findRelatedId,
  updateInboundActualWeight,
  saveInboundWithBundles,
  updateLotActualWeight,
  saveLotWithBundles,
  getBundlesIfWeighted,
  upsertBundle,
  duplicateActualWeightBundles,
  updateReportStatus
};