const db = require("../database");

// Helper function to find related ID (inboundId if lotId is provided, or lotId if inboundId is provided)
const findRelatedId = async (
  providedId,
  isLotId = null,
  jobNo = null,
  lotNo = null
) => {
  try {
    // If we have jobNo and lotNo but no providedId, try to find the ID first
    if ((providedId === null || providedId === undefined) && jobNo && lotNo) {
      if (isLotId === false || isLotId === null) {
        // Try to find inboundId by jobNo and lotNo
        const inboundQuery = `
          SELECT "inboundId" 
          FROM public.inbounds 
          WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
          LIMIT 1
        `;

        const [inbound] = await db.sequelize.query(inboundQuery, {
          replacements: { jobNo, lotNo },
          type: db.sequelize.QueryTypes.SELECT,
        });

        if (inbound) return inbound.inboundId;
      }

      if (isLotId === true || isLotId === null) {
        // Try to find lotId by jobNo and lotNo
        const lotQuery = `
          SELECT "lotId" 
          FROM public.lot 
          WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
          LIMIT 1
        `;

        const [lot] = await db.sequelize.query(lotQuery, {
          replacements: { jobNo, lotNo },
          type: db.sequelize.QueryTypes.SELECT,
        });

        if (lot) return lot.lotId;
      }

      return null;
    }

    // Rest of your existing findRelatedId logic...
    if (isLotId === null) {
      // Try both directions
      const asInboundResult = await findRelatedId(
        providedId,
        false,
        jobNo,
        lotNo
      );
      if (asInboundResult)
        return { lotId: asInboundResult, providedIdType: "inbound" };

      const asLotResult = await findRelatedId(providedId, true, jobNo, lotNo);
      if (asLotResult) return { inboundId: asLotResult, providedIdType: "lot" };

      return null;
    }

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

const checkDuplicateCrewLotNo = async (
  crewLotNo,
  jobNo,
  idValue,
  transaction = null
) => {
  if (!crewLotNo) return false; // Skip check if empty

  const options = transaction ? { transaction } : {};

  // 1. Check duplicate in inbound table only for the same jobNo
  const duplicateQuery = `
    SELECT COUNT(*) as count 
    FROM public.inbounds 
    WHERE "jobNo" = :jobNo 
    AND "crewLotNo" = :crewLotNo 
    AND "inboundId" != :idValue
  `;

  const [duplicateResult] = await db.sequelize.query(duplicateQuery, {
    replacements: {
      crewLotNo: parseInt(crewLotNo),
      jobNo: jobNo,
      idValue: idValue || 0, // Use 0 if idValue is null to avoid SQL issues
    },
    type: db.sequelize.QueryTypes.SELECT,
    ...options,
  });

  if (duplicateResult.count > 0) {
    throw new Error(
      `Crew Lot No ${crewLotNo} already exists for job ${jobNo} in inbound records.`
    );
  }

  // // 2. Check range based on jobNo's lot numbers from inbound table only
  // const rangeQuery = `
  //   SELECT MIN("lotNo") as minLot, MAX("lotNo") as maxLot
  //   FROM public.inbounds
  //   WHERE "jobNo" = :jobNo
  //   AND ("isWeighted" IS NULL OR "isWeighted" = false)
  // `;

  // const [rangeResult] = await db.sequelize.query(rangeQuery, {
  //   replacements: { jobNo },
  //   type: db.sequelize.QueryTypes.SELECT,
  //   ...options,
  // });

  // const { minlot, maxlot } = rangeResult;

  // // Only validate range if there are existing records for this job
  // if (minlot !== null && maxlot !== null && (crewLotNo < minlot || crewLotNo > maxlot)) {
  //   throw new Error(
  //     `Crew Lot No ${crewLotNo} is out of valid range for job ${jobNo} (${minlot} - ${maxlot}).`
  //   );
  // }

  return false; // false means no issues
};

// Update Crew Lot No in both tables
const updateCrewLotNo = async (idValue, isInbound, newCrewLotNo) => {
  const transaction = await db.sequelize.transaction();
  try {
    let jobNo, exWarehouseLot;

    if (isInbound) {
      // Find from inbound table with isWeighted condition
      const inboundQuery = `
        SELECT "jobNo", "exWarehouseLot" 
        FROM public.inbounds 
        WHERE "inboundId" = :idValue 

      `;
      const [inbound] = await db.sequelize.query(inboundQuery, {
        replacements: { idValue },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (!inbound)
        throw new Error("Inbound record not found or already weighted");
      jobNo = inbound.jobNo;
      exWarehouseLot = inbound.exWarehouseLot;
    } else {
      // For lotId, we still need to find the corresponding inbound record for validation
      const lotQuery = `
        SELECT "jobNo", "lotNo" 
        FROM public.lot 
        WHERE "lotId" = :idValue
      `;
      const [lot] = await db.sequelize.query(lotQuery, {
        replacements: { idValue },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (!lot) throw new Error("Lot record not found");

      // Now find the corresponding inbound record with isWeighted condition
      const inboundQuery = `
        SELECT "jobNo", "lotNo" 
        FROM public.inbounds 
        WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
      `;
      const [inbound] = await db.sequelize.query(inboundQuery, {
        replacements: { jobNo: lot.jobNo, lotNo: lot.lotNo },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (!inbound)
        throw new Error(
          "Corresponding inbound record not found or already weighted"
        );
      jobNo = inbound.jobNo;
      exWarehouseLot = inbound.exWarehouseLot;
    }

    // Validate duplicate and range (only checks inbound table)
    await checkDuplicateCrewLotNo(newCrewLotNo, jobNo, idValue, transaction);

    // Update both tables
    const updateInboundQuery = `
      UPDATE public.inbounds
      SET 
        "crewLotNo" = :crewLotNo,
        "lotNo" = :crewLotNo,
        "updatedAt" = NOW()
      WHERE "jobNo" = :jobNo AND "exWarehouseLot" = :exWarehouseLot
      AND ("isWeighted" IS NULL OR "isWeighted" = false)
      RETURNING *
    `;

    const updateLotQuery = `
      UPDATE public.lot
      SET 
        "crewLotNo" = :crewLotNo,
        "updatedAt" = NOW()
      WHERE "jobNo" = :jobNo AND "exWarehouseLot" = :exWarehouseLot
      RETURNING *
    `;

    const [inboundResult] = await db.sequelize.query(updateInboundQuery, {
      replacements: {
        crewLotNo: parseInt(newCrewLotNo),
        jobNo,
        exWarehouseLot,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });

    const [lotResult] = await db.sequelize.query(updateLotQuery, {
      replacements: {
        crewLotNo: parseInt(newCrewLotNo),
        jobNo,
        exWarehouseLot,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });

    await transaction.commit();

    return {
      inbound: inboundResult || null,
      lot: lotResult || null,
    };
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating Crew Lot No:", error);
    throw error;
  }
};

const upsertBundle = async (
  idValue,
  isInbound,
  bundleNo,
  weight,
  meltNo,
  stickerWeight, // New parameter for stickerWeight
  relatedId = null,
  jobNo = null,
  lotNo = null,
  transaction = null
) => {
  const options = transaction ? { transaction } : {};
  let idField = isInbound ? "inboundId" : "lotId";
  let relatedIdField = isInbound ? "lotId" : "inboundId";

  try {
    // If we don't have the primary ID but have jobNo and lotNo, try to find it
    if (!idValue && jobNo && lotNo) {
      const findQuery = `
        SELECT ${isInbound ? '"inboundId"' : '"lotId"'} 
        FROM ${isInbound ? "public.inbounds" : "public.lot"} 
        WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
        LIMIT 1
      `;

      const [result] = await db.sequelize.query(findQuery, {
        replacements: { jobNo, lotNo },
        type: db.sequelize.QueryTypes.SELECT,
        ...options,
      });

      if (result) {
        idValue = isInbound ? result.inboundId : result.lotId;
      }
    }

    // If we don't have the related ID, try to find it
    if (!relatedId) {
      if (idValue) {
        relatedId = await findRelatedId(idValue, !isInbound, jobNo, lotNo);
      } else if (jobNo && lotNo) {
        // Try to find the related ID directly using jobNo and lotNo
        const findRelatedQuery = `
          SELECT ${!isInbound ? '"inboundId"' : '"lotId"'} 
          FROM ${!isInbound ? "public.inbounds" : "public.lot"} 
          WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
          LIMIT 1
        `;

        const [relatedResult] = await db.sequelize.query(findRelatedQuery, {
          replacements: { jobNo, lotNo },
          type: db.sequelize.QueryTypes.SELECT,
          ...options,
        });

        if (relatedResult) {
          relatedId = !isInbound
            ? relatedResult.inboundId
            : relatedResult.lotId;
        }
      }
    }

    // Validate we have at least one ID
    if (!idValue && !relatedId) {
      throw new Error(
        "Cannot upsert bundle - neither primary ID nor related ID is available"
      );
    }

    // First try to update existing bundle
    const updateQuery = `
      UPDATE public.inboundbundles 
      SET 
        weight = :weight, 
        "meltNo" = :meltNo,
        "stickerWeight" = :stickerWeight,
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
        stickerWeight: stickerWeight || null,
        relatedId,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      ...options,
    });

    // If update affected any rows, return the result
    if (updateResult.length > 0 && updateResult[1] > 0) {
      return updateResult[0];
    }

    // If no rows were updated, try to insert
    const insertQuery = `
      INSERT INTO public.inboundbundles 
      ("inboundId", "lotId", "bundleNo", weight, "meltNo", "stickerWeight", "isOutbounded", "createdAt", "updatedAt")
      VALUES (:inboundId, :lotId, :bundleNo, :weight, :meltNo, :stickerWeight, false, NOW(), NOW())
      ON CONFLICT ("inboundId", "bundleNo") DO UPDATE SET
        weight = EXCLUDED.weight,
        "meltNo" = EXCLUDED."meltNo",
        "stickerWeight" = EXCLUDED."stickerWeight",
        "lotId" = COALESCE(EXCLUDED."lotId", inboundbundles."lotId"),
        "updatedAt" = NOW()
      RETURNING *
    `;

    const replacements = {
      inboundId: isInbound ? idValue : relatedId,
      lotId: isInbound ? relatedId : idValue,
      bundleNo,
      weight,
      meltNo: meltNo || null,
      stickerWeight: stickerWeight || null,
    };

    const insertResult = await db.sequelize.query(insertQuery, {
      replacements,
      type: db.sequelize.QueryTypes.INSERT,
      ...options,
    });

    return insertResult.length > 0 ? insertResult[0] : null;
  } catch (error) {
    console.error("Error in upsert:", error);
    throw error;
  }
};

// Helper function to calculate total stickerWeight from bundles
const calculateTotalStickerWeight = (bundles) => {
  return (
    bundles.reduce((total, bundle) => {
      const stickerWeight = bundle.stickerWeight || 0;
      return total + (stickerWeight > 0 ? stickerWeight : 0);
    }, 0) / 1000
  ); // convert to metric tons
};

// update the inboundId actual weight
const updateInboundActualWeight = async (
  inboundId,
  actualWeight,
  strictValidation = false,
  crewLotNo = null,
  bundles = null // New parameter to calculate total stickerWeight
) => {
  const transaction = await db.sequelize.transaction();
  try {
    // First get current bundle status
    const checkQuery = `
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN weight > 0 THEN 1 ELSE 0 END) as valid_weights,
        SUM(CASE WHEN stickerWeight > 0 THEN 1 ELSE 0 END) as valid_sticker_weights,
        SUM(CASE WHEN "meltNo" IS NOT NULL AND "meltNo" != '' THEN 1 ELSE 0 END) as valid_melt_nos
      FROM public.inboundbundles 
      WHERE "inboundId" = :inboundId
    `;

    const [bundleStatus] = await db.sequelize.query(checkQuery, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
      transaction,
    });

    // Determine if weighted based on strictValidation
    let isWeighted;
    if (strictValidation) {
      isWeighted =
        bundleStatus.total_count > 0 &&
        bundleStatus.total_count === bundleStatus.valid_weights &&
        bundleStatus.total_count === bundleStatus.valid_sticker_weights &&
        bundleStatus.total_count === bundleStatus.valid_melt_nos;
    } else {
      isWeighted = true;
    }

    // Calculate total stickerWeight if bundles are provided
    const totalStickerWeight = bundles
      ? calculateTotalStickerWeight(bundles)
      : null;

    // Update the inbound
    const updateQuery = `
      UPDATE public.inbounds 
      SET 
        "actualWeight" = :actualWeight,      
        "isWeighted" = :isWeighted,
        "stickerWeight" = COALESCE(:stickerWeight, "stickerWeight"),
        "updatedAt" = NOW()
      WHERE "inboundId" = :inboundId
      RETURNING *
    `;

    // Convert actualWeight from kg to metric tons (divide by 1000)
    // Frontend sends weight in kg, but database stores it in metric tons
    const actualWeightInMetricTons = actualWeight / 1000;

    const result = await db.sequelize.query(updateQuery, {
      replacements: {
        inboundId,
        actualWeight: actualWeightInMetricTons,
        isWeighted,
        stickerWeight: totalStickerWeight,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });

    await transaction.commit();
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating inbound actual weight:", error);
    throw error;
  }
};

const updateLotActualWeight = async (
  lotId,
  actualWeight,
  strictValidation = false,
  crewLotNo = null, // New parameter for crewLotNo
  bundles = null // New parameter to calculate total stickerWeight
) => {
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
      transaction,
    });

    // Determine if weighted based on strictValidation
    let isWeighted;
    if (strictValidation) {
      isWeighted =
        bundleStatus.total_count > 0 &&
        bundleStatus.total_count === bundleStatus.valid_weights &&
        bundleStatus.total_count === bundleStatus.valid_melt_nos;
    } else {
      isWeighted = true;
    }

    // Calculate total stickerWeight if bundles are provided
    const totalStickerWeight = bundles
      ? calculateTotalStickerWeight(bundles)
      : null;

    // Update the lot
    const updateQuery = `
      UPDATE public.lot 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "stickerWeight" = COALESCE(:stickerWeight, "stickerWeight"),
        "updatedAt" = NOW()
      WHERE "lotId" = :lotId
      RETURNING *
    `;

    // Convert actualWeight from kg to metric tons (divide by 1000)
    // Frontend sends weight in kg, but database stores it in metric tons
    const actualWeightInMetricTons = actualWeight / 1000;

    const result = await db.sequelize.query(updateQuery, {
      replacements: {
        lotId,
        actualWeight: actualWeightInMetricTons,
        isWeighted,
        stickerWeight: totalStickerWeight,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });

    await transaction.commit();
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating lot actual weight:", error);
    throw error;
  }
};

// combination of the lotId and inboundId, has the related Id
const saveInboundWithBundles = async (
  inboundId,
  actualWeight,
  bundles,
  strictValidation = false,
  jobNo = null,
  lotNo = null
) => {
  const transaction = await db.sequelize.transaction();

  try {
    // Find related lotId, using jobNo and lotNo if inboundId is null
    const relatedLotId = await findRelatedId(inboundId, false, jobNo, lotNo);

    // Upsert all bundles first
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        inboundId,
        true,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo,
        bundle.stickerWeight, // Pass stickerWeight to upsertBundle
        relatedLotId,
        jobNo,
        lotNo,
        transaction
      );
      if (savedBundle) savedBundles.push(savedBundle);
    }

    // --- MODIFIED LOGIC ---
    // A lot is considered "weighted" (i.e., started) if any bundle has
    // either a weight greater than 0 or a non-empty melt number.
    const hasAnyData = bundles.some(
      (b) =>
        (b.weight != null && b.weight > 0) ||
        (b.meltNo != null && b.meltNo.trim() !== "")
    );
    const isWeighted = hasAnyData;

    // Calculate total stickerWeight
    const totalStickerWeight = calculateTotalStickerWeight(bundles);

    // Update inbound with crewLotNo and stickerWeight
    const updateQuery = `
      UPDATE public.inbounds 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "stickerWeight" = :stickerWeight,
        "updatedAt" = NOW()
      WHERE "inboundId" = :inboundId
      RETURNING *
    `;

    // Convert actualWeight from kg to metric tons (divide by 1000)
    const actualWeightInMetricTons = actualWeight / 1000;

    const inboundResult = await db.sequelize.query(updateQuery, {
      replacements: {
        inboundId,
        actualWeight: actualWeightInMetricTons,
        isWeighted, // Use the new conditional flag here
        stickerWeight: totalStickerWeight,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });

    // Update related lot if exists
    if (relatedLotId) {
      await db.sequelize.query(
        `
        UPDATE public.lot 
        SET 
          "actualWeight" = :actualWeight, 
          "isWeighted" = :isWeighted,
          "stickerWeight" = :stickerWeight,
          "updatedAt" = NOW()
        WHERE "lotId" = :lotId
      `,
        {
          replacements: {
            lotId: relatedLotId,
            actualWeight: actualWeightInMetricTons,
            isWeighted, // And also use it here
            stickerWeight: totalStickerWeight,
          },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction,
        }
      );
    }

    await transaction.commit();
    return {
      inboundId,
      lotId: relatedLotId,
      actualWeight,
      bundles: savedBundles,
      isWeighted,
      stickerWeight: totalStickerWeight,
    };
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving inbound with bundles:", error);
    throw error;
  }
};

// combination of the lotId and inboundId, has the related Id
const saveLotWithBundles = async (
  lotId,
  actualWeight,
  bundles,
  strictValidation = false,
  jobNo = null,
  lotNo = null
) => {
  const transaction = await db.sequelize.transaction();

  try {
    // Find related inboundId, using jobNo and lotNo if lotId is null
    const relatedInboundId = await findRelatedId(lotId, true, jobNo, lotNo);

    // Upsert bundles first
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        lotId,
        false,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo,
        bundle.stickerWeight, // Pass stickerWeight to upsertBundle
        relatedInboundId,
        jobNo,
        lotNo,
        transaction
      );
      if (savedBundle) {
        savedBundles.push(savedBundle);
      }
    }

    // Calculate total stickerWeight
    const totalStickerWeight = calculateTotalStickerWeight(bundles);

    // --- MODIFIED LOGIC ---
    // A lot is considered "weighted" (i.e., started) if any bundle has
    // either a weight greater than 0 or a non-empty melt number.
    const hasAnyData = bundles.some(
      (b) =>
        (b.weight != null && b.weight > 0) ||
        (b.meltNo != null && b.meltNo.trim() !== "")
    );
    const isWeighted = hasAnyData;

    // Update lot with crewLotNo and stickerWeight
    const updateQuery = `
      UPDATE public.lot 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "stickerWeight" = :stickerWeight,
        "updatedAt" = NOW()
      WHERE "lotId" = :lotId
      RETURNING *
    `;

    // Convert actualWeight from kg to metric tons (divide by 1000)
    const actualWeightInMetricTons = actualWeight / 1000;

    const lotResult = await db.sequelize.query(updateQuery, {
      replacements: {
        lotId,
        actualWeight: actualWeightInMetricTons,
        isWeighted,
        stickerWeight: totalStickerWeight,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });

    // Also update related inbound if exists (including crewLotNo and stickerWeight)
    if (relatedInboundId) {
      await db.sequelize.query(
        `
        UPDATE public.inbounds 
        SET 
          "actualWeight" = :actualWeight, 
          "isWeighted" = :isWeighted,
          "stickerWeight" = :stickerWeight,
          "updatedAt" = NOW()
        WHERE "inboundId" = :inboundId
      `,
        {
          replacements: {
            inboundId: relatedInboundId,
            actualWeight: actualWeightInMetricTons,
            isWeighted,
            stickerWeight: totalStickerWeight,
          },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction,
        }
      );
    }

    await transaction.commit();
    return {
      lotId,
      inboundId: relatedInboundId,
      actualWeight,
      bundles: savedBundles,
      stickerWeight: totalStickerWeight,
      isWeighted,
    };
  } catch (error) {
    await transaction.rollback();
    console.error("Error saving lot with bundles:", error);
    throw error;
  }
};

// get bundles if weighted from backend
const getBundlesIfWeighted = async (
  idValue,
  isInbound,
  strictValidation = false
) => {
  try {
    let query;
    let replacements;

    if (isInbound) {
      query = `
        SELECT 
          ib.*,
          i."crewLotNo",
          i."stickerWeight" as inboundStickerWeight
        FROM inboundbundles ib
        LEFT JOIN inbounds i ON ib."inboundId" = i."inboundId"
        WHERE ib."inboundId" = ?
        ORDER BY ib."bundleNo"
      `;
      replacements = [idValue];
    } else {
      query = `
        SELECT 
          ib.*,
          i."crewLotNo",
          i."stickerWeight" as inboundStickerWeight
        FROM inboundbundles ib
        LEFT JOIN inbounds i ON ib."inboundId" = i."inboundId"
        WHERE ib."lotId" = ?
        ORDER BY ib."bundleNo"
      `;
      replacements = [idValue];
    }

    const bundles = await db.sequelize.query(query, {
      replacements: replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    // Log some sample data if bundles found
    if (bundles.length > 0) {
    }

    return bundles;
  } catch (error) {
    console.error("Error in getBundlesIfWeighted:", error);
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

const duplicateActualWeightBundles = async (
  sourceExWLot,
  targetExWLot,
  lotId,
  resolvedBy
) => {
  const transaction = await db.sequelize.transaction();
  try {
    // 1. Find the target "coming lot"
    const targetLotQuery = `
      SELECT "lotId" 
      FROM public.lot 
      WHERE "exWarehouseLot" = :targetExWLot and "lotId" = :lotId
      ORDER BY "createdAt" DESC
      LIMIT 1;
    `;
    const [targetLot] = await db.sequelize.query(targetLotQuery, {
      replacements: { targetExWLot, lotId },
      type: db.sequelize.QueryTypes.SELECT,
      transaction,
    });

    if (!targetLot) {
      throw new Error(
        `Target "coming lot" with Ex-Warehouse Lot '${targetExWLot}' not found.`
      );
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
    const [sourceTransaction] = await db.sequelize.query(
      sourceTransactionQuery,
      {
        replacements: { sourceExWLot },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      }
    );

    if (!sourceTransaction || !sourceTransaction.inboundId) {
      throw new Error(
        `No previous outbounded transaction found for Ex-Warehouse Lot '${sourceExWLot}' to copy weights from.`
      );
    }
    const sourceInboundId = sourceTransaction.inboundId;

    // 3. Fetch all original bundles
    const sourceBundlesQuery = `
      SELECT * FROM public.inboundbundles
      WHERE "inboundId" = :sourceInboundId
    `;
    const sourceBundles = await db.sequelize.query(sourceBundlesQuery, {
      replacements: { sourceInboundId },
      type: db.sequelize.QueryTypes.SELECT,
      transaction,
    });

    if (sourceBundles.length === 0) {
      throw new Error(
        `No original weighted bundles found for the historical inbound record (inboundId: ${sourceInboundId}).`
      );
    }

    // 4. Calculate total actual weight
    const totalActualWeight = sourceBundles.reduce(
      (sum, bundle) => sum + parseFloat(bundle.weight || 0),
      0
    );

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
        reportStatus: "accepted", // Set status to accepted
        resolvedBy: resolvedBy, // Use the provided user ID
      });
    } catch (reportError) {
      console.error(
        `[ERROR] Duplication succeeded, but failed to update report status for lotId ${targetLotId}:`,
        reportError
      );
    }

    return {
      message: `Successfully duplicated ${sourceBundles.length} bundles to lot ${targetLotId}.`,
      targetLotId,
    };
  } catch (error) {
    await transaction.rollback();
    console.error(
      "[DEBUG] Error inside duplicateActualWeightBundles model function:",
      error
    );
    throw error;
  }
};

// checks if the jobNo/lotNo is already scheduled outbound
const checkOutboundScheduleStatus = async (
  idValue,
  isInbound,
  jobNo = null,
  lotNo = null
) => {
  try {
    let query;
    let replacements;

    if (isInbound) {
      // Check by inboundId
      query = `
        SELECT 
          si."selectedInboundId",
          si."inboundId",
          si."scheduleOutboundId",
          si."isOutbounded",
          si."jobNo",
          si."lotNo",
          si."releaseDate",
          si."exportDate",
          si."deliveryDate",
          si."createdAt" as "scheduledAt"
        FROM selectedinbounds si
        WHERE si."inboundId" = ?
        ORDER BY si."createdAt" DESC
        LIMIT 1
      `;
      replacements = [idValue];
    } else {
      // Check by jobNo and lotNo (since selectedinbounds uses these fields)
      if (jobNo && lotNo) {
        query = `
          SELECT 
            si."selectedInboundId",
            si."inboundId",
            si."scheduleOutboundId",
            si."isOutbounded",
            si."jobNo",
            si."lotNo",
            si."releaseDate",
            si."exportDate",
            si."deliveryDate",
            si."createdAt" as "scheduledAt"
          FROM selectedinbounds si
          WHERE si."jobNo" = ? AND si."lotNo" = ?
          ORDER BY si."createdAt" DESC
          LIMIT 1
        `;
        replacements = [jobNo, lotNo];
      } else {
        // If we only have lotId, we need to find the corresponding jobNo/lotNo first
        // This requires looking up the lot details from your lots table

        // First, find the jobNo and lotNo from the lotId
        const lotQuery = `
          SELECT "jobNo", "lotNo" 
          FROM lot
          WHERE "lotId" = ?
        `;

        const lotResult = await db.sequelize.query(lotQuery, {
          replacements: [idValue],
          type: db.sequelize.QueryTypes.SELECT,
        });

        if (!lotResult || lotResult.length === 0) {
          return null;
        }

        const { jobNo: foundJobNo, lotNo: foundLotNo } = lotResult[0];

        // Now check selectedinbounds with the found jobNo and lotNo
        query = `
          SELECT 
            si."selectedInboundId",
            si."inboundId",
            si."scheduleOutboundId",
            si."isOutbounded",
            si."jobNo",
            si."lotNo",
            si."releaseDate",
            si."exportDate",
            si."deliveryDate",
            si."createdAt" as "scheduledAt"
          FROM selectedinbounds si
          WHERE si."jobNo" = ? AND si."lotNo" = ?
          ORDER BY si."createdAt" DESC
          LIMIT 1
        `;
        replacements = [foundJobNo, foundLotNo];
      }
    }

    const result = await db.sequelize.query(query, {
      replacements: replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("Error in checkOutboundScheduleStatus:", error);
    throw error;
  }
};

const getHistoricalBundlesByJobAndLot = async (jobNo, lotNo) => {
  try {
    const sourceTransactionQuery = `
      SELECT "inboundId"
      FROM public.outboundtransactions
      WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
      ORDER BY "createdAt" DESC
      LIMIT 1;
    `;
    // console.log(`[DEBUG] Model: Preparing to execute sourceTransactionQuery.`);
    // console.log(sourceTransactionQuery);

    const replacements = { jobNo, lotNo: parseInt(lotNo, 10) };

    const [sourceTransaction] = await db.sequelize.query(
      sourceTransactionQuery,
      {
        replacements,
        type: db.sequelize.QueryTypes.SELECT,
      }
    );

    if (!sourceTransaction || !sourceTransaction.inboundId) {
      // --- DEBUG LOGGING ---
      //console.log(`[DEBUG] Model: No outbounded transaction found for the provided details. Returning empty array.`);
      // --- END DEBUG LOGGING ---
      return []; // Return an empty array if no shipped lot is found
    }
    const sourceInboundId = sourceTransaction.inboundId;

    // --- DEBUG LOGGING ---
    //console.log(`[DEBUG] Model: Found source inboundId: ${sourceInboundId}. Now fetching bundles from "inboundbundles" table.`);
    // --- END DEBUG LOGGING ---

    // Step 2: Fetch all bundle details associated with that source inboundId.
    const sourceBundlesQuery = `
      SELECT "bundleNo", "weight", "stickerWeight", "meltNo"
      FROM public.inboundbundles
      WHERE "inboundId" = :sourceInboundId
      ORDER BY "bundleNo";
    `;
    const sourceBundles = await db.sequelize.query(sourceBundlesQuery, {
      replacements: { sourceInboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return sourceBundles;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  findRelatedId,
  updateInboundActualWeight,
  saveInboundWithBundles,
  updateLotActualWeight,
  saveLotWithBundles,
  getBundlesIfWeighted,
  upsertBundle,
  duplicateActualWeightBundles,
  updateCrewLotNo,
  updateReportStatus,
  checkOutboundScheduleStatus,
  getHistoricalBundlesByJobAndLot,
};
