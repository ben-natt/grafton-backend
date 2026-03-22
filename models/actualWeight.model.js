const e = require("express");
const db = require("../database");

// Helper function to find related ID (inboundId if lotId is provided, or lotId if inboundId is provided)
const findRelatedId = async (
  providedId,
  isLotId = null,
  jobNo = null,
  lotNo = null,
) => {
  console.log(`[MODEL] findRelatedId executing -> providedId: ${providedId}, isLotId: ${isLotId}, jobNo: ${jobNo}, lotNo: ${lotNo}`);

  try {
    // If we have jobNo and lotNo but no providedId, try to find the ID first
    if ((providedId === null || providedId === undefined) && jobNo && lotNo) {
      if (isLotId === false || isLotId === null) {
        // Try to find inboundId by jobNo and lotNo
        const inboundQuery = `
          SELECT "inboundId" 
          FROM public.inbounds 
          WHERE "jobNo" = :jobNo AND "crewLotNo" = :lotNo
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
          WHERE "jobNo" = :jobNo AND "crewLotNo" = :lotNo
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

    if (isLotId === null) {
      // Try both directions
      const asInboundResult = await findRelatedId(
        providedId,
        false,
        jobNo,
        lotNo,
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
        SELECT "jobNo", "crewLotNo" 
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
        WHERE "jobNo" = :jobNo AND "crewLotNo" = :lotNo
        LIMIT 1
      `;

      const [inbound] = await db.sequelize.query(inboundQuery, {
        replacements: { jobNo: lot.jobNo, lotNo: lot.crewLotNo },
        type: db.sequelize.QueryTypes.SELECT,
      });

      return inbound ? inbound.inboundId : null;
    } else {
      // If inboundId is provided, find corresponding lotId
      const inboundQuery = `
        SELECT "jobNo", "crewLotNo" 
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
        WHERE "jobNo" = :jobNo AND "crewLotNo" = :lotNo
        LIMIT 1
      `;

      const [lot] = await db.sequelize.query(lotQuery, {
        replacements: { jobNo: inbound.jobNo, lotNo: inbound.crewLotNo },
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
  transaction = null,
) => {
  if (!crewLotNo) return false;

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
      idValue: idValue || 0,
    },
    type: db.sequelize.QueryTypes.SELECT,
    ...options,
  });

  if (duplicateResult.count > 0) {
    throw new Error(
      `Crew Lot No ${crewLotNo} already exists for job ${jobNo} in inbound records.`,
    );
  }

  return false;
};

// Update Crew Lot No in both tables
const updateCrewLotNo = async (idValue, isInbound, newCrewLotNo) => {
  const transaction = await db.sequelize.transaction();
  try {
    let jobNo, exWarehouseLot, oldCrewLotNo;

    if (isInbound) {
      const inboundQuery = `
        SELECT "jobNo", "exWarehouseLot", "crewLotNo" 
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
      oldCrewLotNo = inbound.crewLotNo;
    } else {
      const lotQuery = `
        SELECT "jobNo", "crewLotNo" 
        FROM public.lot 
        WHERE "lotId" = :idValue
      `;
      const [lot] = await db.sequelize.query(lotQuery, {
        replacements: { idValue },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (!lot) throw new Error("Lot record not found");
      oldCrewLotNo = lot.crewLotNo;
      
      const inboundQuery = `
        SELECT "jobNo", "crewLotNo", "exWarehouseLot" 
        FROM public.inbounds 
        WHERE "jobNo" = :jobNo AND "crewLotNo" = :crewLotNo
      `;
      const [inbound] = await db.sequelize.query(inboundQuery, {
        replacements: { jobNo: lot.jobNo, crewLotNo: lot.crewLotNo },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      });

      if (!inbound)
        throw new Error(
          "Corresponding inbound record not found or already weighted",
        );
      jobNo = inbound.jobNo;
      exWarehouseLot = inbound.exWarehouseLot;
    }

    await checkDuplicateCrewLotNo(newCrewLotNo, jobNo, idValue, transaction);

    // Update both tables, syncing crewLotNo AND lotNo
    const updateInboundQuery = `
      UPDATE public.inbounds
      SET 
        "crewLotNo" = :crewLotNo,
        "lotNo" = :crewLotNo,
        "updatedAt" = NOW()
      WHERE "jobNo" = :jobNo AND "exWarehouseLot" IS NOT DISTINCT FROM :exWarehouseLot
      RETURNING *
    `;

    const updateLotQuery = `
      UPDATE public.lot
      SET 
        "crewLotNo" = :crewLotNo,
        "lotNo" = :crewLotNo,
        "updatedAt" = NOW()
      WHERE "jobNo" = :jobNo AND "exWarehouseLot" IS NOT DISTINCT FROM :exWarehouseLot
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
      previousCrewLotNo: oldCrewLotNo,
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
  stickerWeight, 
  relatedId = null,
  jobNo = null,
  lotNo = null,
  exWarehouseLot = null,
  transaction = null,
) => {
  const options = transaction ? { transaction } : {};
  let idField = isInbound ? "inboundId" : "lotId";
  let relatedIdField = isInbound ? "lotId" : "inboundId";

  try {
    if (!idValue && jobNo && exWarehouseLot) {
      const findQuery = `
        SELECT ${isInbound ? '"inboundId"' : '"lotId"'} 
        FROM ${isInbound ? "public.inbounds" : "public.lot"} 
        WHERE "jobNo" = :jobNo AND "exWarehouseLot" IS NOT DISTINCT FROM :exWarehouseLot
        LIMIT 1
      `;

      const [result] = await db.sequelize.query(findQuery, {
        replacements: { jobNo, exWarehouseLot },
        type: db.sequelize.QueryTypes.SELECT,
        ...options,
      });

      if (result) {
        idValue = isInbound ? result.inboundId : result.lotId;
        console.log(
          `[upsertBundle] Found ${
            isInbound ? "inboundId" : "lotId"
          }: ${idValue} using jobNo: ${jobNo}, exWarehouseLot: ${exWarehouseLot}`,
        );
      }
    }

    if (!relatedId) {
      if (idValue) {
        relatedId = await findRelatedId(
          idValue,
          !isInbound,
          jobNo,
          exWarehouseLot,
        );
        console.log(
          `[upsertBundle] Found relatedId: ${relatedId} from idValue: ${idValue}`,
        );
      } else if (jobNo && exWarehouseLot) {
        const findRelatedQuery = `
          SELECT ${!isInbound ? '"inboundId"' : '"lotId"'} 
          FROM ${!isInbound ? "public.inbounds" : "public.lot"} 
          WHERE "jobNo" = :jobNo AND "exWarehouseLot" IS NOT DISTINCT FROM :exWarehouseLot
          LIMIT 1
        `;

        const [relatedResult] = await db.sequelize.query(findRelatedQuery, {
          replacements: { jobNo, exWarehouseLot },
          type: db.sequelize.QueryTypes.SELECT,
          ...options,
        });

        if (relatedResult) {
          relatedId = !isInbound
            ? relatedResult.inboundId
            : relatedResult.lotId;
          console.log(
            `[upsertBundle] Found relatedId: ${relatedId} using jobNo: ${jobNo}, exWarehouseLot: ${exWarehouseLot}`,
          );
        }
      }
    }

    if (!idValue && !relatedId) {
      console.error(
        `[upsertBundle] FAILED: No IDs available for jobNo: ${jobNo}, exWarehouseLot: ${exWarehouseLot}, bundleNo: ${bundleNo}`,
      );
      throw new Error(
        "Cannot upsert bundle - neither primary ID nor related ID is available",
      );
    }

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

    if (updateResult.length > 0 && updateResult[1] > 0) {
      return updateResult[0];
    }

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

const calculateTotalStickerWeight = (bundles) => {
  return (
    bundles.reduce((total, bundle) => {
      const stickerWeight = bundle.stickerWeight || 0;
      return total + (stickerWeight > 0 ? stickerWeight : 0);
    }, 0) / 1000
  ); 
};

const updateInboundActualWeight = async (
  inboundId,
  actualWeight,
  strictValidation = false,
  crewLotNo = null,
  bundles = null,
  tareWeight = 0,
  scaleNo = null,
) => {
  const transaction = await db.sequelize.transaction();
  try {
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

    const totalStickerWeight = bundles
      ? calculateTotalStickerWeight(bundles)
      : null;

    const updateQuery = `
      UPDATE public.inbounds 
      SET 
        "actualWeight" = :actualWeight,      
        "isWeighted" = :isWeighted,
        "stickerWeight" = COALESCE(:stickerWeight, "stickerWeight"),
        "tareWeight" = COALESCE(:tareWeight, "tareWeight"),
        "scaleNo" = COALESCE(:scaleNo, "scaleNo"),
        "updatedAt" = NOW()
      WHERE "inboundId" = :inboundId
      RETURNING *
    `;

    const actualWeightInMetricTons = actualWeight / 1000;

    const result = await db.sequelize.query(updateQuery, {
      replacements: {
        inboundId,
        actualWeight: actualWeightInMetricTons,
        isWeighted,
        stickerWeight: totalStickerWeight,
        tareWeight: tareWeight,
        scaleNo: scaleNo,
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
  crewLotNo = null, 
  bundles = null,
  tareWeight = 0,
  scaleNo = null,
) => {
  const transaction = await db.sequelize.transaction();
  try {
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

    let isWeighted;
    if (strictValidation) {
      isWeighted =
        bundleStatus.total_count > 0 &&
        bundleStatus.total_count === bundleStatus.valid_weights &&
        bundleStatus.total_count === bundleStatus.valid_melt_nos;
    } else {
      isWeighted = true;
    }

    const totalStickerWeight = bundles
      ? calculateTotalStickerWeight(bundles)
      : null;

    const updateQuery = `
      UPDATE public.lot 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "stickerWeight" = COALESCE(:stickerWeight, "stickerWeight"),
        "tareWeight" = COALESCE(:tareWeight, "tareWeight"),
        "scaleNo" = COALESCE(:scaleNo, "scaleNo"),
        "updatedAt" = NOW()
      WHERE "lotId" = :lotId
      RETURNING *
    `;

    const actualWeightInMetricTons = actualWeight / 1000;

    const result = await db.sequelize.query(updateQuery, {
      replacements: {
        lotId,
        actualWeight: actualWeightInMetricTons,
        isWeighted,
        stickerWeight: totalStickerWeight,
        tareWeight: tareWeight,
        scaleNo: scaleNo,
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

const saveInboundWithBundles = async (
  inboundId,
  actualWeight,
  bundles,
  strictValidation = false,
  jobNo = null,
  lotNo = null,
  exWarehouseLot = null,
  tareWeight = 0,
  scaleNo = null,
  userId = null,
  externalTransaction = null,
) => {
  const transaction = externalTransaction || (await db.sequelize.transaction());

  console.log(`[saveInboundWithBundles] Starting save:`, {
    inboundId,
    jobNo,
    exWarehouseLot,
    bundleCount: bundles.length,
    tareWeight,
    scaleNo,
  });

  try {
    const relatedLotId = await findRelatedId(inboundId, false, jobNo, lotNo);

    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        inboundId,
        true,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo,
        bundle.stickerWeight,
        relatedLotId,
        jobNo,
        exWarehouseLot,
        transaction,
      );
      if (savedBundle) savedBundles.push(savedBundle);
    }

    const hasAnyData = bundles.some(
      (b) =>
        (b.weight != null && b.weight > 0) ||
        (b.meltNo != null && b.meltNo.trim() !== ""),
    );
    const isWeighted = hasAnyData;

    const totalStickerWeight = calculateTotalStickerWeight(bundles);

    const updateQuery = `
      UPDATE public.inbounds 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "stickerWeight" = :stickerWeight,
        "tareWeight" = :tareWeight,
        "scaleNo" = :scaleNo,
        "crewLotNo" = COALESCE(:crewLotNo, "crewLotNo"),
        "lotNo" = COALESCE(:lotNo, "lotNo"),
        "lottedById" = COALESCE("lottedById", :userId),
        "lottedAt" = COALESCE("lottedAt", NOW()),
        "updatedAt" = NOW()
      WHERE "inboundId" = :inboundId
      RETURNING *
    `;

    const actualWeightInMetricTons = actualWeight / 1000;

    await db.sequelize.query(updateQuery, {
      replacements: {
        inboundId,
        actualWeight: actualWeightInMetricTons,
        isWeighted,
        stickerWeight: totalStickerWeight,
        tareWeight: tareWeight,
        scaleNo: scaleNo,
        crewLotNo: lotNo,
        lotNo: lotNo ? parseInt(lotNo, 10) : null,
        userId: userId,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });

    if (relatedLotId) {
      await db.sequelize.query(
        `
        UPDATE public.lot 
        SET 
          "actualWeight" = :actualWeight, 
          "isWeighted" = :isWeighted,
          "stickerWeight" = :stickerWeight,
          "tareWeight" = :tareWeight,
          "scaleNo" = :scaleNo,
          "crewLotNo" = COALESCE(:crewLotNo, "crewLotNo"),
          "lotNo" = COALESCE(:lotNo, "lotNo"),
          "lottedById" = COALESCE("lottedById", :userId),
          "lottedAt" = COALESCE("lottedAt", NOW()),
          "updatedAt" = NOW()
        WHERE "lotId" = :lotId
      `,
        {
          replacements: {
            lotId: relatedLotId,
            actualWeight: actualWeightInMetricTons,
            isWeighted,
            stickerWeight: totalStickerWeight,
            tareWeight: tareWeight,
            scaleNo: scaleNo,
            crewLotNo: lotNo,
            lotNo: lotNo ? parseInt(lotNo, 10) : null,
            userId: userId,
          },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction,
        },
      );
    }

    if (!externalTransaction) await transaction.commit();

    return {
      inboundId,
      lotId: relatedLotId,
      actualWeight,
      bundles: savedBundles,
      isWeighted,
      stickerWeight: totalStickerWeight,
      tareWeight,
      scaleNo,
    };
  } catch (error) {
    if (!externalTransaction) await transaction.rollback();
    console.error("Error saving inbound with bundles:", error);
    throw error;
  }
};

const saveLotWithBundles = async (
  lotId,
  actualWeight,
  bundles,
  strictValidation = false,
  jobNo = null,
  lotNo = null,
  exWarehouseLot = null,
  tareWeight = 0,
  scaleNo = null,
  userId = null,
  externalTransaction = null,
) => {
  const transaction = externalTransaction || (await db.sequelize.transaction());

  console.log(`[saveLotWithBundles] Starting save:`, {
    lotId,
    jobNo,
    exWarehouseLot,
    bundleCount: bundles.length,
    tareWeight,
    scaleNo,
  });

  try {
    const relatedInboundId = await findRelatedId(lotId, true, jobNo, lotNo);

    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await upsertBundle(
        lotId,
        false,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo,
        bundle.stickerWeight,
        relatedInboundId,
        jobNo,
        exWarehouseLot,
        transaction,
      );
      if (savedBundle) {
        savedBundles.push(savedBundle);
      }
    }

    const totalStickerWeight = calculateTotalStickerWeight(bundles);

    const hasAnyData = bundles.some(
      (b) =>
        (b.weight != null && b.weight > 0) ||
        (b.meltNo != null && b.meltNo.trim() !== ""),
    );
    const isWeighted = hasAnyData;

    const updateQuery = `
      UPDATE public.lot 
      SET 
        "actualWeight" = :actualWeight, 
        "isWeighted" = :isWeighted,
        "stickerWeight" = :stickerWeight,
        "tareWeight" = :tareWeight,
        "scaleNo" = :scaleNo,
        "crewLotNo" = COALESCE(:crewLotNo, "crewLotNo"),
        "lotNo" = COALESCE(:lotNo, "lotNo"),
        "lottedById" = COALESCE("lottedById", :userId),
        "lottedAt" = COALESCE("lottedAt", NOW()),
        "updatedAt" = NOW()
      WHERE "lotId" = :lotId
      RETURNING *
    `;

    const actualWeightInMetricTons = actualWeight / 1000;

    await db.sequelize.query(updateQuery, {
      replacements: {
        lotId,
        actualWeight: actualWeightInMetricTons,
        isWeighted,
        stickerWeight: totalStickerWeight,
        tareWeight: tareWeight, 
        scaleNo: scaleNo, 
        crewLotNo: lotNo,
        lotNo: lotNo ? parseInt(lotNo, 10) : null,
        userId,
      },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });

    if (relatedInboundId) {
      await db.sequelize.query(
        `
        UPDATE public.inbounds 
        SET 
          "actualWeight" = :actualWeight, 
          "isWeighted" = :isWeighted,
          "stickerWeight" = :stickerWeight,
          "tareWeight" = :tareWeight,
          "scaleNo" = :scaleNo,
          "crewLotNo" = COALESCE(:crewLotNo, "crewLotNo"),
          "lotNo" = COALESCE(:lotNo, "lotNo"),
          "lottedById" = COALESCE("lottedById", :userId),
          "lottedAt" = COALESCE("lottedAt", NOW()),
          "updatedAt" = NOW()
        WHERE "inboundId" = :inboundId
      `,
        {
          replacements: {
            inboundId: relatedInboundId,
            actualWeight: actualWeightInMetricTons,
            isWeighted,
            stickerWeight: totalStickerWeight,
            tareWeight: tareWeight, 
            scaleNo: scaleNo, 
            crewLotNo: lotNo,
            lotNo: lotNo ? parseInt(lotNo, 10) : null,
            userId,
          },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction,
        },
      );
    }

    if (!externalTransaction) await transaction.commit();

    return {
      lotId,
      inboundId: relatedInboundId,
      actualWeight,
      bundles: savedBundles,
      stickerWeight: totalStickerWeight,
      isWeighted,
      tareWeight,
      scaleNo,
    };
  } catch (error) {
    if (!externalTransaction) await transaction.rollback();
    console.error("Error saving lot with bundles:", error);
    throw error;
  }
};

const getBundlesIfWeighted = async (
  idValue,
  isInbound,
  strictValidation = false,
) => {
  try {
    let query;
    let replacements;

    if (isInbound) {
      query = `
        SELECT 
          ib.*,
          i."crewLotNo",
          i."stickerWeight" as "inboundStickerWeight",
          i."tareWeight",
          i."scaleNo"
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
          i."stickerWeight" as "inboundStickerWeight",
          i."tareWeight",
          i."scaleNo"
        FROM inboundbundles ib
        LEFT JOIN public.lot i ON ib."lotId" = i."lotId"
        WHERE ib."lotId" = ?
        ORDER BY ib."bundleNo"
      `;
      replacements = [idValue];
    }

    const bundles = await db.sequelize.query(query, {
      replacements: replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    return bundles;
  } catch (error) {
    console.error("Error in getBundlesIfWeighted:", error);
    throw error;
  }
};

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
  resolvedBy,
) => {
  const transaction = await db.sequelize.transaction();
  try {
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
        `Target "coming lot" with Ex-Warehouse Lot '${targetExWLot}' not found.`,
      );
    }
    const targetLotId = targetLot.lotId;

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
      },
    );

    if (!sourceTransaction || !sourceTransaction.inboundId) {
      throw new Error(
        `No previous outbounded transaction found for Ex-Warehouse Lot '${sourceExWLot}' to copy weights from.`,
      );
    }
    const sourceInboundId = sourceTransaction.inboundId;

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
        `No original weighted bundles found for the historical inbound record (inboundId: ${sourceInboundId}).`,
      );
    }

    const totalActualWeight = sourceBundles.reduce(
      (sum, bundle) => sum + parseFloat(bundle.weight || 0),
      0,
    );

    await updateLotActualWeight(targetLotId, totalActualWeight, transaction);

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

    try {
      await updateReportStatus({
        lotId: targetLotId,
        reportStatus: "accepted", 
        resolvedBy: resolvedBy, 
      });
    } catch (reportError) {
      console.error(
        `[ERROR] Duplication succeeded, but failed to update report status for lotId ${targetLotId}:`,
        reportError,
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
      error,
    );
    throw error;
  }
};

const checkOutboundScheduleStatus = async (
  idValue,
  isInbound,
  jobNo = null,
  lotNo = null,
) => {
  try {
    let query;
    let replacements;

    if (isInbound) {
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
        const lotQuery = `
          SELECT "jobNo", "crewLotNo" 
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
      WHERE "jobNo" = :jobNo AND "crewLotNo" = :lotNo
      ORDER BY "createdAt" DESC
      LIMIT 1;
    `;

    const replacements = { jobNo, lotNo: parseInt(lotNo, 10) };

    const [sourceTransaction] = await db.sequelize.query(
      sourceTransactionQuery,
      {
        replacements,
        type: db.sequelize.QueryTypes.SELECT,
      },
    );

    if (!sourceTransaction || !sourceTransaction.inboundId) {
      return []; 
    }
    const sourceInboundId = sourceTransaction.inboundId;

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
  db,
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