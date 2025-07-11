const express = require("express");
const router = express.Router();
const repackModel = require("../models/repack.model");
const db = require("../database");

// POST route for saving inbound bundle data (single bundle)
router.post("/save-inbound-bundle", async (req, res) => {
  try {
    const {
      inboundBundleId, // For updates
      inboundId, // For new records
      bundleNo, // For new records
      weight, // Optional for new records
      isRelabelled,
      isRebundled,
      isRepackProvided,
      noOfMetalStrap,
      repackDescription,
      beforeImagesId,
      afterImagesId,
      meltNo
    } = req.body;

    // Validate required fields
    if (!inboundBundleId && (!inboundId || !bundleNo)) {
      return res.status(400).json({ 
        error: "Either inboundBundleId (for update) or inboundId and bundleNo (for create) is required" 
      });
    }

    // Prepare data object
    const bundleData = {
      inboundBundleId: inboundBundleId || null,
      inboundId: inboundId || null,
      bundleNo: bundleNo || null,
      weight: weight || null,
      isRelabelled: isRelabelled || false,
      isRebundled: isRebundled || false,
      isRepackProvided: isRepackProvided || false,
      noOfMetalStrap: noOfMetalStrap || null,
      repackDescription: repackDescription || null,
      beforeImagesId: beforeImagesId || null,
      afterImagesId: afterImagesId || null,
      meltNo: meltNo || null
    };

    // Call the modal function
    const result = await repackModel.saveInboundBundleData(bundleData);

    res.status(200).json({
      success: true,
      data: result,
      message: result.message
    });

  } catch (error) {
    console.error("Error in save-inbound-bundle route:", error);
    
    // Handle specific error cases
    if (error.message.includes('not found')) {
      return res.status(404).json({ 
        error: "Record not found",
        details: error.message 
      });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({ 
        error: "Conflict - Bundle already exists",
        details: error.message 
      });
    }

    if (error.message.includes('required')) {
      return res.status(400).json({ 
        error: "Bad Request - Missing required fields",
        details: error.message 
      });
    }

    res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message 
    });
  }
});

// GET route to check if inbound bundles exist for a specific inboundId
router.get("/check-inbound-bundles/:inboundId", async (req, res) => {
  try {
    const { inboundId } = req.params;

    if (!inboundId) {
      return res.status(400).json({ 
        error: "inboundId is required" 
      });
    }

    const checkQuery = `
      SELECT COUNT(*) as count, 
             array_agg("inboundBundleId") as bundleIds
      FROM public.inboundbundles 
      WHERE "inboundId" = :inboundId
    `;

    const result = await db.sequelize.query(checkQuery, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    const count = parseInt(result[0].count);
    
    res.status(200).json({
      exists: count > 0,
      count: count,
      bundleIds: result[0].bundleIds || []
    });

  } catch (error) {
    console.error("Error in check-inbound-bundles route:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message 
    });
  }
});

// GET route to fetch existing bundle data for editing
router.get("/inbound-bundles/:inboundId", async (req, res) => {
  try {
    const { inboundId } = req.params;

    if (!inboundId) {
      return res.status(400).json({ 
        error: "inboundId is required" 
      });
    }

    const query = `
      SELECT 
        "inboundBundleId",
        "inboundId",
        "bundleNo",
        "weight",
        "meltNo",
        "isOutbounded",
        "isRelabelled",
        "isRebundled",
        "isRepackProvided",
        "noOfMetalStrap",
        "repackDescription",
        "beforeImagesId",
        "afterImagesId",
        "createdAt",
        "updatedAt"
      FROM public.inboundbundles 
      WHERE "inboundId" = :inboundId
      ORDER BY "bundleNo"
    `;

    const result = await db.sequelize.query(query, {
      replacements: { inboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    res.status(200).json({
      success: true,
      data: result,
      count: result.length
    });

  } catch (error) {
    console.error("Error in get inbound-bundles route:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message 
    });
  }
});

// GET route to fetch a specific bundle by inboundBundleId
router.get("/inbound-bundle/:inboundBundleId", async (req, res) => {
  try {
    const { inboundBundleId } = req.params;

    if (!inboundBundleId) {
      return res.status(400).json({ 
        error: "inboundBundleId is required" 
      });
    }

    const query = `
      SELECT 
        "inboundBundleId",
        "inboundId",
        "bundleNo",
        "weight",
        "meltNo",
        "isOutbounded",
        "isRelabelled",
        "isRebundled",
        "isRepackProvided",
        "noOfMetalStrap",
        "repackDescription",
        "beforeImagesId",
        "afterImagesId",
        "createdAt",
        "updatedAt"
      FROM public.inboundbundles 
      WHERE "inboundBundleId" = :inboundBundleId
    `;

    const result = await db.sequelize.query(query, {
      replacements: { inboundBundleId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (result.length === 0) {
      return res.status(404).json({
        error: "Bundle not found",
        message: `No bundle found with inboundBundleId: ${inboundBundleId}`
      });
    }

    res.status(200).json({
      success: true,
      data: result[0]
    });

  } catch (error) {
    console.error("Error in get inbound-bundle route:", error);
    res.status(500).json({ 
      error: "Internal Server Error",
      details: error.message 
    });
  }
});

module.exports = router;