const db = require("../database");

// Modal
const saveInboundBundleData = async (bundleData) => {
  try {
    // Check if inboundBundleId exists in inboundbundles table
    if (bundleData.inboundBundleId) {
      // Update existing record by inboundBundleId
      const existingBundleQuery = `
        SELECT "inboundBundleId", "inboundId", "bundleNo"
        FROM public.inboundbundles 
        WHERE "inboundBundleId" = :inboundBundleId
      `;

      const existingBundle = await db.sequelize.query(existingBundleQuery, {
        replacements: { inboundBundleId: bundleData.inboundBundleId },
        type: db.sequelize.QueryTypes.SELECT,
      });

      if (existingBundle.length > 0) {
        // Update existing record
        const updateQuery = `
          UPDATE public.inboundbundles 
          SET 
            "isRelabelled" = :isRelabelled,
            "isRebundled" = :isRebundled,
            "isRepackProvided" = :isRepackProvided,
            "noOfMetalStrap" = :noOfMetalStrap,
            "repackDescription" = :repackDescription,
            "beforeImagesId" = :beforeImagesId,
            "afterImagesId" = :afterImagesId,
            "meltNo" = :meltNo,
            "updatedAt" = NOW()
          WHERE "inboundBundleId" = :inboundBundleId
        `;

        await db.sequelize.query(updateQuery, {
          replacements: {
            inboundBundleId: bundleData.inboundBundleId,
            isRelabelled: bundleData.isRelabelled || false,
            isRebundled: bundleData.isRebundled || false,
            isRepackProvided: bundleData.isRepackProvided || false,
            noOfMetalStrap: bundleData.noOfMetalStrap || null,
            repackDescription: bundleData.repackDescription || null,
            beforeImagesId: bundleData.beforeImagesId || null,
            afterImagesId: bundleData.afterImagesId || null,
            meltNo: bundleData.meltNo || null,
          },
          type: db.sequelize.QueryTypes.UPDATE,
        });

        console.log(`Updated bundle with inboundBundleId: ${bundleData.inboundBundleId}`);
        return {
          success: true,
          action: 'updated',
          recordsAffected: 1,
          inboundBundleId: bundleData.inboundBundleId,
          message: `Successfully updated bundle with ID: ${bundleData.inboundBundleId}`
        };

      } else {
        throw new Error(`Inbound bundle not found for inboundBundleId: ${bundleData.inboundBundleId}`);
      }

    } else {
      // Create new record - need inboundId and bundleNo
      if (!bundleData.inboundId || !bundleData.bundleNo) {
        throw new Error('inboundId and bundleNo are required for creating new bundle');
      }

      // Check if inbound exists
      const inboundQuery = `
        SELECT "inboundId", "noOfBundle", "netWeight"
        FROM public.inbounds 
        WHERE "inboundId" = :inboundId
      `;

      const inboundRecord = await db.sequelize.query(inboundQuery, {
        replacements: { inboundId: bundleData.inboundId },
        type: db.sequelize.QueryTypes.SELECT,
      });

      if (inboundRecord.length === 0) {
        throw new Error(`Inbound record not found for inboundId: ${bundleData.inboundId}`);
      }

      // Check if bundle number already exists
      const bundleCheckQuery = `
        SELECT "inboundBundleId"
        FROM public.inboundbundles 
        WHERE "inboundId" = :inboundId AND "bundleNo" = :bundleNo
      `;

      const existingBundleNo = await db.sequelize.query(bundleCheckQuery, {
        replacements: { 
          inboundId: bundleData.inboundId, 
          bundleNo: bundleData.bundleNo 
        },
        type: db.sequelize.QueryTypes.SELECT,
      });

      if (existingBundleNo.length > 0) {
        throw new Error(`Bundle number ${bundleData.bundleNo} already exists for inboundId: ${bundleData.inboundId}`);
      }

      const { noOfBundle, netWeight } = inboundRecord[0];
      const weightPerBundle = bundleData.weight || (netWeight / noOfBundle);

      // Create single bundle record
      const insertQuery = `
        INSERT INTO public.inboundbundles 
        ("inboundId", "bundleNo", "weight", "meltNo", "isOutbounded", "isRelabelled", 
         "isRebundled", "isRepackProvided", "noOfMetalStrap", "repackDescription", 
         "beforeImagesId", "afterImagesId", "createdAt", "updatedAt")
        VALUES 
        (:inboundId, :bundleNo, :weight, :meltNo, :isOutbounded, :isRelabelled, 
         :isRebundled, :isRepackProvided, :noOfMetalStrap, :repackDescription, 
         :beforeImagesId, :afterImagesId, :createdAt, :updatedAt)
        RETURNING "inboundBundleId"
      `;

      const result = await db.sequelize.query(insertQuery, {
        replacements: {
          inboundId: bundleData.inboundId,
          bundleNo: bundleData.bundleNo,
          weight: weightPerBundle,
          meltNo: bundleData.meltNo || null,
          isOutbounded: false,
          isRelabelled: bundleData.isRelabelled || false,
          isRebundled: bundleData.isRebundled || false,
          isRepackProvided: bundleData.isRepackProvided || false,
          noOfMetalStrap: bundleData.noOfMetalStrap || null,
          repackDescription: bundleData.repackDescription || null,
          beforeImagesId: bundleData.beforeImagesId || null,
          afterImagesId: bundleData.afterImagesId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        type: db.sequelize.QueryTypes.INSERT,
      });

      const newInboundBundleId = result[0][0].inboundBundleId;

      console.log(`Created new bundle with inboundBundleId: ${newInboundBundleId}`);
      return {
        success: true,
        action: 'created',
        recordsAffected: 1,
        inboundBundleId: newInboundBundleId,
        message: `Successfully created bundle with ID: ${newInboundBundleId}`
      };
    }

  } catch (error) {
    console.error("Error in saveInboundBundleData:", error);
    throw error;
  }
};

module.exports = {
  saveInboundBundleData,
};