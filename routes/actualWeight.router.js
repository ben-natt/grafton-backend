const express = require('express');
const router = express.Router();
const actualWeightModel = require("../models/actualWeight.model");

// saveInboundWithBundles (updateInboundActualWeight) (updateLotActualWeight), saveLotWithBundles, getBundlesIfWeighted

// Save actual weight for inbound or lot
router.post("/actual/save-weight", async (req, res) => {
  const { inboundId, lotId, actualWeight, bundles, strictValidation } = req.body;
  
  try {
    // Validation
    if (!inboundId && !lotId) {
      return res.status(400).json({ 
        error: "Either inboundId or lotId must be provided" 
      });
    }
    
    if (inboundId && lotId) {
      return res.status(400).json({ 
        error: "Cannot provide both inboundId and lotId" 
      });
    }
    
    if (!actualWeight || actualWeight <= 0) {
      return res.status(400).json({ 
        error: "Valid actualWeight is required" 
      });
    }
    
    if (!bundles || !Array.isArray(bundles) || bundles.length === 0) {
      return res.status(400).json({ 
        error: "Bundles array is required" 
      });
    }

    let result;
    
    if (inboundId) {
      result = await actualWeightModel.saveInboundWithBundles(
        inboundId, 
        actualWeight, 
        bundles,
        strictValidation // Pass the strictValidation flag
      );
    } else if (lotId) {
      result = await actualWeightModel.saveLotWithBundles(
        lotId, 
        actualWeight, 
        bundles,
        strictValidation // Pass the strictValidation flag
      );
    }
    
    res.status(200).json({
      success: true,
      message: "Actual weight saved successfully",
      data: result
    });
    
  } catch (error) {
    console.error("Error saving actual weight:", error);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});

// router
router.post("/actual/get-bundles-if-weighted", async (req, res) => {
  try {
    const { inboundId, lotId, strictValidation = false } = req.body;
    
    if (!inboundId && !lotId) {
      return res.status(400).json({ error: "Either inboundId or lotId must be provided" });
    }

    const isInbound = inboundId !== undefined;
    const idValue = isInbound ? inboundId : lotId;
    
    const bundles = await actualWeightModel.getBundlesIfWeighted(
      idValue, 
      isInbound,
      strictValidation
    );
    
    console.log(`Returning ${bundles.length} bundles`);
    res.status(200).json(bundles); // Make sure bundles is an array
  } catch (error) {
    console.error('Error in /get-bundles-if-weighted:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/actual/duplicate-bundles", async (req, res) => {
    console.log("[DEBUG] Request Body:", req.body);

    // Get resolvedBy from the request body
    const { sourceExWLot, targetExWLot, resolvedBy } = req.body;
    // console.log("resolvedBy:", resolvedBy);

    try {
        // Add validation for the new parameter
        if (!sourceExWLot || !targetExWLot || !resolvedBy) {
            return res.status(400).json({
                error: "sourceExWLot, targetExWLot, and resolvedBy must be provided"
            });
        }

        const result = await actualWeightModel.duplicateActualWeightBundles(
            sourceExWLot,
            targetExWLot,
            resolvedBy // Pass resolvedBy to the model function
        );

        res.status(200).json({
            success: true,
            message: "Bundles duplicated and status updated successfully",
            data: result
        });

    } catch (error) {
        console.error("[DEBUG] Error caught in /actual/duplicate-bundles route:", error);
        res.status(500).json({
            error: error.message || "Internal server error"
        });
    }
});

router.post("/actual/check-incomplete", async (req, res) => {
  try {
    console.log(`[POST /actual/check-incomplete] Request received`);
    console.log(`[POST /actual/check-incomplete] Request body:`, JSON.stringify(req.body, null, 2));
    
    const { inboundId, strictValidation = false } = req.body;
    
    if (!inboundId) {
      console.log(`[POST /actual/check-incomplete] ERROR - inboundId is missing`);
      return res.status(400).json({ 
        error: "inboundId is required" 
      });
    }
    
    console.log(`[POST /actual/check-incomplete] Processing inboundId: ${inboundId}, strictValidation: ${strictValidation}`);
    
    const result = await actualWeightModel.checkIncompleteBundles(
      inboundId, 
      strictValidation
    );
    
    console.log(`[POST /actual/check-incomplete] Success - sending result:`, JSON.stringify(result, null, 2));
    res.status(200).json(result);
  } catch (error) {
    console.error(`[POST /actual/check-incomplete] Error occurred:`, error);
    console.error(`[POST /actual/check-incomplete] Error stack:`, error.stack);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});




module.exports = router;