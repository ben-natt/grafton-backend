const express = require('express');
const router = express.Router();
const actualWeightModel = require("../models/actualWeight.model");

// saveInboundWithBundles (updateInboundActualWeight) (updateLotActualWeight), saveLotWithBundles, getBundlesIfWeighted

// Save actual weight for inbound or lot
router.post("/actual/save-weight", async (req, res) => {
  const { inboundId, lotId, actualWeight, bundles } = req.body;
  
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
        bundles
      );
    } else if (lotId) {
      result = await actualWeightModel.saveLotWithBundles(
        lotId, 
        actualWeight, 
        bundles
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

router.post("/actual/get-bundles-if-weighted", async (req, res) => {
  const { inboundId, lotId } = req.body;

  try {
    let result;
    if (inboundId) {
      result = await actualWeightModel.getBundlesIfWeighted(inboundId, true);
    } else if (lotId) {
      result = await actualWeightModel.getBundlesIfWeighted(lotId, false);
    } else {
      return res.status(400).json({ error: "Either inboundId or lotId must be provided" });
    }
    res.status(200).json(result);
  } catch (error) {
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


module.exports = router;