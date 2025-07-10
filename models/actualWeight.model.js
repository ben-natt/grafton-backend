const db = require("../database");

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
    } else {
      console.log("No inbound found with ID:", inboundId);
      return null;
    }
  } catch (error) {
    console.error("Error updating inbound actual weight:", error);
    throw error;
  }
};



const deleteExistingBundles = async (inboundId) => {
  try {
    const query = `
      DELETE FROM public.inboundbundles 
      WHERE "inboundId" = :inboundId
    `;

    const result = await db.sequelize.query(query, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.DELETE,
    });

    console.log("Existing bundles deleted for inboundId:", inboundId);
    return result;
  } catch (error) {
    console.error("Error deleting existing bundles:", error);
    throw error;
  }
};

const insertInboundBundle = async (inboundId, bundleNo, weight, meltNo) => {
  try {
    const query = `
      INSERT INTO public.inboundbundles 
      ("inboundId", "bundleNo", weight, "meltNo", "isOutbounded", "createdAt", "updatedAt")
      VALUES (:inboundId, :bundleNo, :weight, :meltNo, false, NOW(), NOW())
      RETURNING *
    `;

    const result = await db.sequelize.query(query, {
      replacements: { 
        inboundId, 
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

const saveInboundWithBundles = async (inboundId, actualWeight, bundles) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    // Update inbound actual weight
    await updateInboundActualWeight(inboundId, actualWeight);
    
    // Delete existing bundles
    await deleteExistingBundles(inboundId);
    
    // Insert new bundles
    const savedBundles = [];
    for (const bundle of bundles) {
      const savedBundle = await insertInboundBundle(
        inboundId,
        bundle.bundleNo,
        bundle.weight,
        bundle.meltNo
      );
      savedBundles.push(savedBundle);
    }

    await transaction.commit();
    console.log("Inbound with bundles saved successfully");
    return {
      inboundId,
      actualWeight,
      bundles: savedBundles
    };
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

    if (result.length > 0) {
      console.log("Inbound with bundles retrieved:", result.length, "records");
      return result;
    } else {
      console.log("No inbound found with ID:", inboundId);
      return [];
    }
  } catch (error) {
    console.error("Error fetching inbound with bundles:", error);
    throw error;
  }
};

const updateSingleBundle = async (inboundBundleId, weight, meltNo) => {
  try {
    const query = `
      UPDATE public.inboundbundles 
      SET weight = :weight, 
          "meltNo" = :meltNo, 
          "updatedAt" = NOW()
      WHERE "inboundBundleId" = :inboundBundleId
      RETURNING *
    `;

    const result = await db.sequelize.query(query, {
      replacements: { 
        inboundBundleId, 
        weight, 
        meltNo: meltNo || null 
      },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    if (result.length > 0) {
      console.log("Bundle updated successfully:", result[0]);
      return result[0];
    } else {
      console.log("No bundle found with ID:", inboundBundleId);
      return null;
    }
  } catch (error) {
    console.error("Error updating bundle:", error);
    throw error;
  }
};

const getInboundBundlesIfWeighted = async (inboundId) => {
  try {
    // First, check if isWeighted is true for the inboundId
    const checkQuery = `
      SELECT "isWeighted" FROM public.inbounds 
      WHERE "inboundId" = :inboundId
      LIMIT 1;
    `;

    const [inbound] = await db.sequelize.query(checkQuery, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (!inbound || inbound.isWeighted !== true) {
      console.log("Inbound is not weighted or not found.");
      return []; // Return empty array if not weighted
    }

    // If weighted, fetch inbound bundles
    const bundlesQuery = `
      SELECT 
        "inboundBundleId",
        "inboundId",
        "bundleNo",
        weight,
        "meltNo",
        "isOutbounded",
        "createdAt",
        "updatedAt"
      FROM public.inboundbundles
      WHERE "inboundId" = :inboundId
      ORDER BY "bundleNo";
    `;

    const bundles = await db.sequelize.query(bundlesQuery, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    console.log("Inbound bundles retrieved:", bundles.length);
    return bundles;
  } catch (error) {
    console.error("Error fetching inbound bundles if weighted:", error);
    throw error;
  }
};


module.exports = {
  updateInboundActualWeight,
  deleteExistingBundles,
  insertInboundBundle,
  saveInboundWithBundles,
  getInboundWithBundles,
  updateSingleBundle,
  getInboundBundlesIfWeighted
};