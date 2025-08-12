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

const upsertBundle = async (idValue, isInbound, bundleNo, weight, meltNo, relatedId = null, transaction = null) => {
  const options = transaction ? { transaction } : {};
  const idField = isInbound ? 'inboundId' : 'lotId';
  const relatedIdField = isInbound ? 'lotId' : 'inboundId';

  try {
    // First try to update existing bundle
    const updateQuery = `
      UPDATE public.inboundbundles 
      SET 
        weight = :weight, 
        "meltNo" = :meltNo,
        "${relatedIdField}" = COALESCE(:relatedId, "${relatedIdField}"),
        "updatedAt" = NOW()
      WHERE "${idField}" = :idValue 
      AND "bundleNo" = :bundleNo
      RETURNING *
    `;

    const updateResult = await db.sequelize.query(updateQuery, {
      replacements: { 
        idValue, 
        bundleNo, 
        weight, 
        meltNo: meltNo || null,
        relatedId
      },
      type: db.sequelize.QueryTypes.UPDATE,
      ...options
    });

    // If update affected any rows, return the result
    if (updateResult.length > 0 && updateResult[1] > 0) {
      console.log("Updated existing bundle");
      return updateResult[0];
    }

    // If no rows were updated, try to insert
    const insertQuery = `
      INSERT INTO public.inboundbundles 
      ("inboundId", "lotId", "bundleNo", weight, "meltNo", "isOutbounded", "createdAt", "updatedAt")
      VALUES (:inboundId, :lotId, :bundleNo, :weight, :meltNo, false, NOW(), NOW())
      ON CONFLICT ("inboundId", "bundleNo") DO UPDATE SET
        weight = EXCLUDED.weight,
        "meltNo" = EXCLUDED."meltNo",
        "lotId" = COALESCE(EXCLUDED."lotId", inboundbundles."lotId"),
        "updatedAt" = NOW()
      RETURNING *
    `;
    
    const replacements = {
      inboundId: isInbound ? idValue : relatedId,
      lotId: isInbound ? relatedId : idValue,
      bundleNo,
      weight,
      meltNo: meltNo || null
    };
    
    const insertResult = await db.sequelize.query(insertQuery, {
      replacements,
      type: db.sequelize.QueryTypes.INSERT,
      ...options
    });
    
    console.log("Upserted bundle");
    return insertResult.length > 0 ? insertResult[0] : null;
  } catch (error) {
    console.error("Error in upsert:", error);
    throw error;
  }
};

// update the inboundId actual weight
const updateInboundActualWeight = async (inboundId, actualWeight, strictValidation = false) => {
  const transaction = await db.sequelize.transaction();
  try {
    // First get current bundle status
    const checkQuery = `
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN weight > 0 THEN 1 ELSE 0 END) as valid_weights,
        SUM(CASE WHEN "meltNo" IS NOT NULL AND "meltNo" != '' THEN 1 ELSE 0 END) as valid_melt_nos
      FROM public.inboundbundles 
      WHERE "inboundId" = :inboundId
    `;
    
    const [bundleStatus] = await db.sequelize.query(checkQuery, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
      transaction
    });

    // Determine if weighted based on strictValidation
    let isWeighted;
    if (strictValidation) {
      isWeighted = bundleStatus.total_count > 0 && 
                  bundleStatus.total_count === bundleStatus.valid_weights && 
                  bundleStatus.total_count === bundleStatus.valid_melt_nos;
    } else {
      isWeighted = true;
    }

    // Update the inbound
    const updateQuery = `
      UPDATE public.inbounds 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "updatedAt" = NOW()
      WHERE "inboundId" = :inboundId
      RETURNING *
    `;

    const result = await db.sequelize.query(updateQuery, {
      replacements: { 
        inboundId, 
        actualWeight,
        isWeighted
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction
    });

    await transaction.commit();
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating inbound actual weight:", error);
    throw error;
  }
};

const updateLotActualWeight = async (lotId, actualWeight, strictValidation = false) => {
  const transaction = await db.sequelize.transaction();
  try {
    // First get current bundle status
    const checkQuery = `
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN weight > 0 THEN 1 ELSE 0 END) as valid_weights,
        SUM(CASE WHEN "meltNo" IS NOT NULL AND "meltNo" != '' THEN 1 ELSE 0 END) as valid_melt_nos
      FROM public.inboundbundles 
      WHERE "lotId" = :lotId
    `;
    
    const [bundleStatus] = await db.sequelize.query(checkQuery, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.SELECT,
      transaction
    });

    // Determine if weighted based on strictValidation
    let isWeighted;
    if (strictValidation) {
      isWeighted = bundleStatus.total_count > 0 && 
                  bundleStatus.total_count === bundleStatus.valid_weights && 
                  bundleStatus.total_count === bundleStatus.valid_melt_nos;
    } else {
      isWeighted = true;
    }

    // Update the lot
    const updateQuery = `
      UPDATE public.lot 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "updatedAt" = NOW()
      WHERE "lotId" = :lotId
      RETURNING *
    `;

    const result = await db.sequelize.query(updateQuery, {
      replacements: { 
        lotId, 
        actualWeight,
        isWeighted
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction
    });

    await transaction.commit();
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating lot actual weight:", error);
    throw error;
  }
};

// Modified saveInboundWithBundles
const saveInboundWithBundles = async (inboundId, actualWeight, bundles, strictValidation = false) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Find related lotId
    const relatedLotId = await findRelatedId(inboundId, false);
    
    // Upsert all bundles first
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        inboundId,
        true,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo,
        relatedLotId,
        transaction
      );
      if (savedBundle) savedBundles.push(savedBundle);
    }

    // Check bundle completion status for isWeighted
    const bundleCheckQuery = `
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN weight > 0 THEN 1 ELSE 0 END) as valid_weights,
        SUM(CASE WHEN "meltNo" IS NOT NULL AND "meltNo" != '' THEN 1 ELSE 0 END) as valid_melt_nos
      FROM public.inboundbundles 
      WHERE "inboundId" = :inboundId
    `;
    
    const [bundleStatus] = await db.sequelize.query(bundleCheckQuery, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
      transaction
    });

    // Determine isWeighted
    const isWeighted = strictValidation 
      ? bundleStatus.total_count > 0 && 
        bundleStatus.total_count === bundleStatus.valid_weights && 
        bundleStatus.total_count === bundleStatus.valid_melt_nos
      : true;

    // Update inbound
    const updateQuery = `
      UPDATE public.inbounds 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "updatedAt" = NOW()
      WHERE "inboundId" = :inboundId
      RETURNING *
    `;

    const inboundResult = await db.sequelize.query(updateQuery, {
      replacements: { inboundId, actualWeight, isWeighted },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction
    });

    // Update related lot if exists
    if (relatedLotId) {
      await db.sequelize.query(`
        UPDATE public.lot 
        SET 
          "actualWeight" = :actualWeight, 
          "isWeighted" = :isWeighted,
          "updatedAt" = NOW()
        WHERE "lotId" = :lotId
      `, {
        replacements: { lotId: relatedLotId, actualWeight, isWeighted },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction
      });
    }

    await transaction.commit();
    return { 
      inboundId, 
      lotId: relatedLotId, 
      actualWeight, 
      bundles: savedBundles,
      isWeighted
    };
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving inbound with bundles:", error);
    throw error;
  }
};

// combination of the lotId and inboundId, has the related Id
const saveLotWithBundles = async (lotId, actualWeight, bundles, strictValidation = false) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Only validate all bundles are filled if strictValidation is true
    if (strictValidation) {
      const incompleteBundles = bundles.filter(b => 
        !b.weight || b.weight <= 0 || !b.meltNo || b.meltNo.trim() === ''
      );
      
      if (incompleteBundles.length > 0) {
        throw new Error(
          `Cannot set isWeighted=true - incomplete bundles: ${
            incompleteBundles.map(b => b.bundleNo).join(', ')
          }`
        );
      }
      
      if (bundles.length === 0) {
        throw new Error("Cannot set isWeighted=true - no bundles provided");
      }
    }

    // Find related inboundId
    const relatedInboundId = await findRelatedId(lotId, true);
    
    // Upsert bundles first
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        lotId,
        false,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo,
        relatedInboundId,
        transaction
      );
      if (savedBundle) {
        savedBundles.push(savedBundle);
      }
    }

    // Now update weights with proper validation
    await updateLotActualWeight(lotId, actualWeight, strictValidation, transaction);
    
    // Also update related inbound if exists
    if (relatedInboundId) {
      await updateInboundActualWeight(relatedInboundId, actualWeight, strictValidation, transaction);
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
const getBundlesIfWeighted = async (idValue, isInbound, strictValidation = false) => {
  const idField = isInbound ? 'inboundId' : 'lotId';
  
  try {
    // Remove the isWeighted check - fetch all bundles regardless
    const query = `
      SELECT * FROM inboundbundles
      WHERE "${idField}" = ?
      ORDER BY "bundleNo"
    `;
    
    const bundles = await db.sequelize.query(query, {
      replacements: [idValue],
      type: db.sequelize.QueryTypes.SELECT
    });

    console.log(`Found ${bundles.length} bundles for ${idField}: ${idValue}`);
    return bundles; // This should already be an array
  } catch (error) {
    console.error('Error in getBundlesIfWeighted:', error);
    throw error;
  }
};

// by joblvl
// const checkIncompleteBundles = async (inboundId, strictValidation = false) => {
//   try {
//     console.log(`[checkIncompleteBundles] Starting check for inboundId: ${inboundId}, strictValidation: ${strictValidation}`);

//     // Step 1: Get all bundles
//     const bundles = await getBundlesIfWeighted(inboundId, true, strictValidation);
//     console.log(`[checkIncompleteBundles] Found ${bundles.length} bundles for inboundId: ${inboundId}`);

//     // Step 2: Get ALL lotIds related to inboundId
//     const lotResults = await db.sequelize.query(
//       `SELECT "lotId", "lotNo" FROM public.lot WHERE "inboundId" = :inboundId`,
//       { replacements: { inboundId }, type: db.sequelize.QueryTypes.SELECT }
//     );
//     console.log(`[checkIncompleteBundles] Found ${lotResults.length} lots for inboundId: ${inboundId}`);

//     // Step 3: Group bundles by lotId and check incompleteness
//     let incompleteLotNos = [];
//     for (const lot of lotResults) {
//       const lotBundles = bundles.filter(b => b.lotId === lot.lotId);

//       let incompleteWeight = 0;
//       let incompleteMeltNo = 0;
//       const totalBundles = lotBundles.length;

//       lotBundles.forEach(bundle => {
//         const hasWeight = bundle.weight && bundle.weight > 0;
//         const hasMeltNo = bundle.meltNo && bundle.meltNo.trim() !== '';
//         if (!hasWeight) incompleteWeight++;
//         if (!hasMeltNo) incompleteMeltNo++;
//       });

//       const isIncompleteLot = strictValidation
//         ? incompleteWeight > 0 || incompleteMeltNo > 0
//         : (incompleteWeight > 0 && incompleteWeight < totalBundles) ||
//           (incompleteMeltNo > 0 && incompleteMeltNo < totalBundles);

//       if (isIncompleteLot) {
//         incompleteLotNos.push(lot.lotNo);
//       }
//     }

//     // Step 4: Build final result
//     const isInboundIncomplete = incompleteLotNos.length > 0;
//     const result = {
//       isIncomplete: isInboundIncomplete,
//       details: {
//         totalBundles: bundles.length,
//         incompleteLotCount: incompleteLotNos.length,
//       },
//       inboundId,
//       incompleteLotNos // NEW FIELD
//     };

//     console.log(`[checkIncompleteBundles] Final result for inboundId ${inboundId}:`, JSON.stringify(result, null, 2));
//     return result;

//   } catch (error) {
//     console.error(`[checkIncompleteBundles] Error for inboundId ${inboundId}:`, error);
//     throw error;
//   }
// };

const checkIncompleteBundles = async (inboundId, strictValidation = false) => {
  try {
    console.log(`[checkIncompleteBundles] Starting check for inboundId: ${inboundId}, strictValidation: ${strictValidation}`);

    // Step 1: Get all bundles
    const bundles = await getBundlesIfWeighted(inboundId, true, strictValidation);
    console.log(`[checkIncompleteBundles] Found ${bundles.length} bundles for inboundId: ${inboundId}`);

    // Step 2: Get the jobNo and lotNo from the specific inbound record
    const inboundResult = await db.sequelize.query(
      `SELECT "jobNo", "lotNo" FROM public.inbounds WHERE "inboundId" = :inboundId`,
      { replacements: { inboundId }, type: db.sequelize.QueryTypes.SELECT }
    );
    
    if (inboundResult.length === 0) {
      console.log(`[checkIncompleteBundles] No inbound record found for inboundId: ${inboundId}`);
      return {
        isIncomplete: false,
        details: { totalBundles: 0, incompleteLotCount: 0 },
        inboundId,
        incompleteLotNos: []
      };
    }

    const { jobNo, lotNo } = inboundResult[0];
    console.log(`[checkIncompleteBundles] Found jobNo: ${jobNo}, lotNo: ${lotNo} for inboundId: ${inboundId}`);

    // Step 3: Get the corresponding lot record
    const lotResults = await db.sequelize.query(
      `SELECT "lotId", "lotNo" FROM public.lot WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo`,
      { replacements: { jobNo, lotNo }, type: db.sequelize.QueryTypes.SELECT }
    );
    console.log(`[checkIncompleteBundles] Found ${lotResults.length} lot records for jobNo: ${jobNo}, lotNo: ${lotNo}`);

    // Step 4: Group bundles by lotId and check incompleteness
    let incompleteLotNos = [];
    for (const lot of lotResults) {
      const lotBundles = bundles.filter(b => b.lotId === lot.lotId);

      let incompleteWeight = 0;
      let incompleteMeltNo = 0;
      const totalBundles = lotBundles.length;

      lotBundles.forEach(bundle => {
        const hasWeight = bundle.weight && bundle.weight > 0;
        const hasMeltNo = bundle.meltNo && bundle.meltNo.trim() !== '';
        if (!hasWeight) incompleteWeight++;
        if (!hasMeltNo) incompleteMeltNo++;
      });

      const isIncompleteLot = strictValidation
        ? incompleteWeight > 0 || incompleteMeltNo > 0
        : (incompleteWeight > 0 && incompleteWeight < totalBundles) ||
          (incompleteMeltNo > 0 && incompleteMeltNo < totalBundles);

      if (isIncompleteLot) {
        incompleteLotNos.push(lot.lotNo);
      }
    }

    // Step 5: Build final result
    const isInboundIncomplete = incompleteLotNos.length > 0;
    const result = {
      isIncomplete: isInboundIncomplete,
      details: {
        totalBundles: bundles.length,
        incompleteLotCount: incompleteLotNos.length,
      },
      inboundId,
      incompleteLotNos // This will contain the lotNo(s) that are incomplete
    };

    console.log(`[checkIncompleteBundles] Final result for inboundId ${inboundId}:`, JSON.stringify(result, null, 2));
    return result;

  } catch (error) {
    console.error(`[checkIncompleteBundles] Error for inboundId ${inboundId}:`, error);
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
  checkIncompleteBundles
};

