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

// Get bundles (with fallback logic: try inboundId first, then lotId if no bundles found)
router.post("/actual/get-bundles-if-weighted", async (req, res) => {
  try {
    const { inboundId, lotId, jobNo, lotNo, strictValidation = false } = req.body;
    
    let finalIdValue = null;
    let isInbound = true;
    let bundles = [];
    let searchAttempts = [];
    
    // Priority 1: Check for inboundId
    if (inboundId && inboundId !== 0) {
      console.log(`Using provided inboundId: ${inboundId}`);
      finalIdValue = inboundId;
      isInbound = true;
      
      bundles = await actualWeightModel.getBundlesIfWeighted(finalIdValue, isInbound, strictValidation);
      searchAttempts.push({ type: 'inboundId', id: finalIdValue, found: bundles.length });
    }
    // Priority 2: Check for lotId if inboundId not found/is 0 OR if no bundles found with inboundId
    if ((!bundles || bundles.length === 0) && lotId && lotId !== 0) {
      console.log(`${bundles.length === 0 ? 'No bundles found with inboundId, trying' : 'Using'} provided lotId: ${lotId}`);
      finalIdValue = lotId;
      isInbound = false;
      
      bundles = await actualWeightModel.getBundlesIfWeighted(finalIdValue, isInbound, strictValidation);
      searchAttempts.push({ type: 'lotId', id: finalIdValue, found: bundles.length });
    }
    
    // Priority 3: Try to find using jobNo and lotNo if still no bundles found
    if ((!bundles || bundles.length === 0) && jobNo && lotNo) {
      console.log(`${bundles.length === 0 ? 'No bundles found with provided IDs, looking up' : 'Looking up'} using jobNo: ${jobNo}, lotNo: ${lotNo}`);
      
      // First try to find inboundId using jobNo and lotNo
      const inboundResult = await actualWeightModel.findRelatedId(null, false, jobNo, lotNo);
      
      if (inboundResult && inboundResult !== 0) {
        console.log(`Found inboundId from jobNo/lotNo: ${inboundResult}`);
        finalIdValue = inboundResult;
        isInbound = true;
        
        bundles = await actualWeightModel.getBundlesIfWeighted(finalIdValue, isInbound, strictValidation);
        searchAttempts.push({ type: 'inboundId (from jobNo/lotNo)', id: finalIdValue, found: bundles.length });
        
        // If no bundles found with inboundId, try lotId
        if (!bundles || bundles.length === 0) {
          console.log(`No bundles found with inboundId ${finalIdValue}, trying to find lotId from jobNo/lotNo`);
          const lotResult = await actualWeightModel.findRelatedId(null, true, jobNo, lotNo);
          
          if (lotResult && lotResult !== 0) {
            console.log(`Found lotId from jobNo/lotNo: ${lotResult}`);
            finalIdValue = lotResult;
            isInbound = false;
            
            bundles = await actualWeightModel.getBundlesIfWeighted(finalIdValue, isInbound, strictValidation);
            searchAttempts.push({ type: 'lotId (from jobNo/lotNo)', id: finalIdValue, found: bundles.length });
          }
        }
      } else {
        // If no inbound found, try to find lotId directly using jobNo and lotNo
        console.log(`No inboundId found from jobNo/lotNo, trying to find lotId`);
        const lotResult = await actualWeightModel.findRelatedId(null, true, jobNo, lotNo);
        
        if (lotResult && lotResult !== 0) {
          console.log(`Found lotId from jobNo/lotNo: ${lotResult}`);
          finalIdValue = lotResult;
          isInbound = false;
          
          bundles = await actualWeightModel.getBundlesIfWeighted(finalIdValue, isInbound, strictValidation);
          searchAttempts.push({ type: 'lotId (from jobNo/lotNo)', id: finalIdValue, found: bundles.length });
        }
      }
    }

    // Log all search attempts
    // console.log('Search attempts:', searchAttempts);

    if (!bundles || bundles.length === 0) {
      console.log(`No bundles found after all attempts`);
      return res.status(404).json({ 
        error: "No bundles found after searching all possible IDs",
        searchAttempts: searchAttempts,
        finalSearchedId: finalIdValue,
        finalSearchedType: isInbound ? 'inboundId' : 'lotId'
      });
    }

    console.log(`Successfully found ${bundles.length} bundles with ${isInbound ? 'inboundId' : 'lotId'}: ${finalIdValue}`);
    res.json(bundles);

  } catch (error) {
    console.error("Error in get-bundles-if-weighted:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      details: error.message 
    });
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