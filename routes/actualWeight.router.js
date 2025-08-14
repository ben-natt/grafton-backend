const express = require('express');
const router = express.Router();
const actualWeightModel = require("../models/actualWeight.model");

// Save actual weight for inbound or lot
router.post("/actual/save-weight", async (req, res) => {
  const { inboundId, lotId, jobNo, lotNo, actualWeight, bundles, strictValidation } = req.body;
  
  try {
    // Validation - must have either IDs or jobNo/lotNo
    if (!inboundId && !lotId && (!jobNo || !lotNo)) {
      return res.status(400).json({ 
        error: "Either (inboundId or lotId) OR (jobNo and lotNo) must be provided" 
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
        error: "Non-empty bundles array is required" 
      });
    }

    let result;
    
    if (inboundId) {
      result = await actualWeightModel.saveInboundWithBundles(
        inboundId, 
        actualWeight, 
        bundles,
        strictValidation
      );
    } else if (lotId) {
      result = await actualWeightModel.saveLotWithBundles(
        lotId, 
        actualWeight, 
        bundles,
        strictValidation
      );
    } else {
      // Handle case where we only have jobNo and lotNo
      // First try to find inboundId
      const inboundResult = await actualWeightModel.findRelatedId(null, false, jobNo, lotNo);
      
      if (inboundResult) {
        result = await actualWeightModel.saveInboundWithBundles(
          inboundResult, 
          actualWeight, 
          bundles,
          strictValidation,
          jobNo,
          lotNo
        );
      } else {
        // If no inbound found, try to find lotId
        const lotResult = await actualWeightModel.findRelatedId(null, true, jobNo, lotNo);
        
        if (lotResult) {
          result = await actualWeightModel.saveLotWithBundles(
            lotResult, 
            actualWeight, 
            bundles,
            strictValidation,
            jobNo,
            lotNo
          );
        } else {
          return res.status(404).json({ 
            error: "No matching inbound or lot found for given jobNo and lotNo" 
          });
        }
      }
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

// Get bundles (now supports jobNo/lotNo as alternative to IDs)
router.post("/actual/get-bundles-if-weighted", async (req, res) => {
  try {
    const { inboundId, lotId, jobNo, lotNo, strictValidation = false } = req.body;
    
    // Validate we have either IDs or jobNo/lotNo
    if (!inboundId && !lotId && (!jobNo || !lotNo)) {
      return res.status(400).json({ 
        error: "Either (inboundId or lotId) OR (jobNo and lotNo) must be provided" 
      });
    }

    let idValue, isInbound;
    
    if (inboundId) {
      idValue = inboundId;
      isInbound = true;
    } else if (lotId) {
      idValue = lotId;
      isInbound = false;
    } else {
      // Try to find ID using jobNo and lotNo
      // First try to find inboundId
      const inboundResult = await actualWeightModel.findRelatedId(null, false, jobNo, lotNo);
      
      if (inboundResult) {
        idValue = inboundResult;
        isInbound = true;
      } else {
        // Try to find lotId
        const lotResult = await actualWeightModel.findRelatedId(null, true, jobNo, lotNo);
        
        if (lotResult) {
          idValue = lotResult;
          isInbound = false;
        } else {
          return res.status(404).json({ 
            error: "No matching inbound or lot found for given jobNo and lotNo" 
          });
        }
      }
    }
    
    const bundles = await actualWeightModel.getBundlesIfWeighted(
      idValue, 
      isInbound,
      strictValidation
    );
    
    res.status(200).json(bundles);
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
// Check incomplete bundles (now supports jobNo/lotNo as alternative)
router.post("/actual/check-incomplete", async (req, res) => {
  try {
    const { inboundId, jobNo, lotNo, strictValidation = false } = req.body;
    
    // Validate we have either inboundId or jobNo/lotNo
    if (!inboundId && (!jobNo || !lotNo)) {
      return res.status(400).json({ 
        error: "Either inboundId OR (jobNo and lotNo) must be provided" 
      });
    }

    let actualInboundId = inboundId;
    
    if (!actualInboundId) {
      // Try to find inboundId using jobNo and lotNo
      const inboundResult = await actualWeightModel.findRelatedId(null, false, jobNo, lotNo);
      
      if (!inboundResult) {
        return res.status(404).json({ 
          error: "No matching inbound found for given jobNo and lotNo" 
        });
      }
      
      actualInboundId = inboundResult;
    }
    
    const result = await actualWeightModel.checkIncompleteBundles(
      actualInboundId, 
      strictValidation
    );
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error in /check-incomplete:', error);
    res.status(500).json({ 
      error: error.message || "Internal server error" 
    });
  }
});

module.exports = router;