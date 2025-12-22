const express = require("express");
const router = express.Router();
const actualWeightModel = require("../models/actualWeight.model");

// Save actual weight for inbound or lot
router.post("/actual/save-weight", async (req, res) => {
  const {
    inboundId,
    lotId,
    jobNo,
    lotNo,
    actualWeight,
    bundles,
    strictValidation,
    exWarehouseLot,
    tareWeight,
    scaleNo,
    userId,
  } = req.body;

  try {
    // Validation - must have either IDs or jobNo/lotNo
    if (!inboundId && !lotId && (!jobNo || !lotNo)) {
      return res.status(400).json({
        error:
          "Either (inboundId or lotId) OR (jobNo and lotNo) must be provided",
      });
    }

    if (inboundId && lotId) {
      return res.status(400).json({
        error: "Cannot provide both inboundId and lotId",
      });
    }

    if (actualWeight == null || actualWeight < 0) {
      return res.status(400).json({
        error: "A valid, non-negative actualWeight is required",
      });
    }

    if (!bundles || !Array.isArray(bundles) || bundles.length === 0) {
      return res.status(400).json({
        error: "Non-empty bundles array is required",
      });
    }

    // Validate bundle structure - check for stickerWeight if provided
    for (const bundle of bundles) {
      if (bundle.stickerWeight != null && bundle.stickerWeight < 0) {
        return res.status(400).json({
          error: `Invalid stickerWeight for bundle ${bundle.bundleNo}: must be non-negative`,
        });
      }
    }

    let result;

    if (inboundId) {
      result = await actualWeightModel.saveInboundWithBundles(
        inboundId,
        actualWeight,
        bundles,
        strictValidation,
        jobNo,
        lotNo,
        exWarehouseLot,
        tareWeight,
        scaleNo,
        userId
      );
    } else if (lotId) {
      result = await actualWeightModel.saveLotWithBundles(
        lotId,
        actualWeight,
        bundles,
        strictValidation,
        jobNo,
        lotNo,
        exWarehouseLot,
        tareWeight,
        scaleNo,
        userId
      );
    } else {
      // Handle case where we only have jobNo and lotNo
      // First try to find inboundId
      const inboundResult = await actualWeightModel.findRelatedId(
        null,
        false,
        jobNo,
        exWarehouseLot
      );

      if (inboundResult) {
        result = await actualWeightModel.saveInboundWithBundles(
          inboundResult,
          actualWeight,
          bundles,
          strictValidation,
          jobNo,
          lotNo,
          exWarehouseLot,
          tareWeight,
          scaleNo,
          userId
        );
      } else {
        // If no inbound found, try to find lotId
        const lotResult = await actualWeightModel.findRelatedId(
          null,
          true,
          jobNo,
          exWarehouseLot
        );

        if (lotResult) {
          result = await actualWeightModel.saveLotWithBundles(
            lotResult,
            actualWeight,
            bundles,
            strictValidation,
            jobNo,
            lotNo,
            exWarehouseLot,
            tareWeight,
            scaleNo,
            userId
          );
        } else {
          return res.status(404).json({
            error: "No matching inbound or lot found for given jobNo and lotNo",
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Actual weight saved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error saving actual weight:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
});

// Get bundles (with fallback logic: try inboundId first, then lotId if no bundles found)
router.post("/actual/get-bundles-if-weighted", async (req, res) => {
  try {
    const {
      inboundId,
      lotId,
      jobNo,
      lotNo,
      exWarehouseLot,
      strictValidation = false,
    } = req.body;

    let finalIdValue = null;
    let isInbound = true;
    let bundles = [];
    let searchAttempts = [];

    if (inboundId && inboundId !== 0) {
      try {
        const verifyQuery = `
      SELECT "inboundId", "jobNo", "exWarehouseLot", "noOfBundle" 
      FROM public.inbounds 
      WHERE "inboundId" = $1
    `;
        const [verifyResult] = await actualWeightModel.db.sequelize.query(
          verifyQuery,
          {
            bind: [inboundId],
            type: actualWeightModel.db.sequelize.QueryTypes.SELECT,
          }
        );

        if (!verifyResult) {
          return res.status(404).json({
            error: `Inbound record with inboundId ${inboundId} not found`,
          });
        }

        // Verify jobNo matches if provided
        if (jobNo && verifyResult.jobNo !== jobNo) {
          return res.status(400).json({
            error: `JobNo mismatch: provided '${jobNo}' but inboundId ${inboundId} has '${verifyResult.jobNo}'`,
          });
        }

        // Verify exWarehouseLot matches if provided
        if (exWarehouseLot && verifyResult.exWarehouseLot !== exWarehouseLot) {
          return res.status(400).json({
            error: `ExWarehouseLot mismatch: provided '${exWarehouseLot}' but inboundId ${inboundId} has '${verifyResult.exWarehouseLot}'`,
          });
        }
      } catch (err) {
        console.error("[VALIDATION ERROR]", err);
        return res.status(500).json({
          error: "Validation failed",
          details: err.message,
        });
      }
    }

    if (lotId && lotId !== 0) {
      try {
        const verifyQuery = `
      SELECT "lotId", "jobNo", "exWarehouseLot", "expectedBundleCount" 
      FROM public.lot 
      WHERE "lotId" = $1
    `;
        const [verifyResult] = await actualWeightModel.db.sequelize.query(
          verifyQuery,
          {
            bind: [lotId],
            type: actualWeightModel.db.sequelize.QueryTypes.SELECT,
          }
        );

        if (!verifyResult) {
          return res.status(404).json({
            error: `Lot record with lotId ${lotId} not found`,
          });
        }

        // Verify jobNo matches if provided
        if (jobNo && verifyResult.jobNo !== jobNo) {
          return res.status(400).json({
            error: `JobNo mismatch: provided '${jobNo}' but lotId ${lotId} has '${verifyResult.jobNo}'`,
          });
        }

        // Verify exWarehouseLot matches if provided
        if (exWarehouseLot && verifyResult.exWarehouseLot !== exWarehouseLot) {
          return res.status(400).json({
            error: `ExWarehouseLot mismatch: provided '${exWarehouseLot}' but lotId ${lotId} has '${verifyResult.exWarehouseLot}'`,
          });
        }
      } catch (err) {
        console.error("[VALIDATION ERROR]", err);
        return res.status(500).json({
          error: "Validation failed",
          details: err.message,
        });
      }
    }

    // Priority 1: Check for inboundId
    if (inboundId && inboundId !== 0) {
      finalIdValue = inboundId;
      isInbound = true;

      bundles = await actualWeightModel.getBundlesIfWeighted(
        finalIdValue,
        isInbound,
        strictValidation
      );
      searchAttempts.push({
        type: "inboundId",
        id: finalIdValue,
        found: bundles.length,
      });
    }
    // Priority 2: Check for lotId if inboundId not found/is 0 OR if no bundles found with inboundId
    if ((!bundles || bundles.length === 0) && lotId && lotId !== 0) {
      finalIdValue = lotId;
      isInbound = false;

      bundles = await actualWeightModel.getBundlesIfWeighted(
        finalIdValue,
        isInbound,
        strictValidation
      );
      searchAttempts.push({
        type: "lotId",
        id: finalIdValue,
        found: bundles.length,
      });
    }

    // Priority 3: Try to find using jobNo and lotNo if still no bundles found
    if ((!bundles || bundles.length === 0) && jobNo && lotNo) {
      console.log(
        `${
          bundles.length === 0
            ? "No bundles found with provided IDs, looking up"
            : "Looking up"
        } using jobNo: ${jobNo}, lotNo: ${lotNo}`
      );

      // First try to find inboundId using jobNo and lotNo
      const inboundResult = await actualWeightModel.findRelatedId(
        null,
        false,
        jobNo,
        lotNo
      );

      if (inboundResult && inboundResult !== 0) {
        console.log(`Found inboundId from jobNo/lotNo: ${inboundResult}`);
        finalIdValue = inboundResult;
        isInbound = true;

        bundles = await actualWeightModel.getBundlesIfWeighted(
          finalIdValue,
          isInbound,
          strictValidation
        );
        searchAttempts.push({
          type: "inboundId (from jobNo/lotNo)",
          id: finalIdValue,
          found: bundles.length,
        });

        // If no bundles found with inboundId, try lotId
        if (!bundles || bundles.length === 0) {
          const lotResult = await actualWeightModel.findRelatedId(
            null,
            true,
            jobNo,
            lotNo
          );

          if (lotResult && lotResult !== 0) {
            console.log(`Found lotId from jobNo/lotNo: ${lotResult}`);
            finalIdValue = lotResult;
            isInbound = false;

            bundles = await actualWeightModel.getBundlesIfWeighted(
              finalIdValue,
              isInbound,
              strictValidation
            );
            searchAttempts.push({
              type: "lotId (from jobNo/lotNo)",
              id: finalIdValue,
              found: bundles.length,
            });
          }
        }
      } else {
        // If no inbound found, try to find lotId directly using jobNo and lotNo
        console.log(
          `No inboundId found from jobNo/lotNo, trying to find lotId`
        );
        const lotResult = await actualWeightModel.findRelatedId(
          null,
          true,
          jobNo,
          lotNo
        );

        if (lotResult && lotResult !== 0) {
          console.log(`Found lotId from jobNo/lotNo: ${lotResult}`);
          finalIdValue = lotResult;
          isInbound = false;

          bundles = await actualWeightModel.getBundlesIfWeighted(
            finalIdValue,
            isInbound,
            strictValidation
          );
          searchAttempts.push({
            type: "lotId (from jobNo/lotNo)",
            id: finalIdValue,
            found: bundles.length,
          });
        }
      }
    }

    if (!bundles || bundles.length === 0) {
      return res.status(404).json({
        error: "No bundles found after searching all possible IDs",
        searchAttempts: searchAttempts,
        finalSearchedId: finalIdValue,
        finalSearchedType: isInbound ? "inboundId" : "lotId",
      });
    }

    console.log(
      `Successfully found ${bundles.length} bundles with ${
        isInbound ? "inboundId" : "lotId"
      }: ${finalIdValue}`
    );

    // Log additional info about crewLotNo and stickerWeight if available
    if (bundles.length > 0) {
      const sampleBundle = bundles[0];
      console.log(`Additional bundle info:`, {
        crewLotNo: sampleBundle.crewLotNo || "N/A",
        bundleStickerWeight: sampleBundle.stickerWeight || "N/A",
        inboundStickerWeight: sampleBundle.inboundStickerWeight || "N/A",
      });
    }

    res.json(bundles);
  } catch (error) {
    console.error("Error in get-bundles-if-weighted:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

router.post("/actual/duplicate-bundles", async (req, res) => {
  console.log("[DEBUG] Request Body:", req.body);

  // Get resolvedBy from the request body
  const { sourceExWLot, targetExWLot, resolvedBy, lotId } = req.body;
  // console.log("resolvedBy:", resolvedBy);

  try {
    // Add validation for the new parameter
    if (!sourceExWLot || !targetExWLot || !resolvedBy || !lotId) {
      return res.status(400).json({
        error:
          "sourceExWLot, targetExWLot, resolvedBy, and lotId must be provided",
      });
    }

    const result = await actualWeightModel.duplicateActualWeightBundles(
      sourceExWLot,
      targetExWLot,
      lotId,
      resolvedBy // Pass resolvedBy to the model function
    );

    res.status(200).json({
      success: true,
      message: "Bundles duplicated and status updated successfully",
      data: result,
    });
  } catch (error) {
    console.error(
      "[DEBUG] Error caught in /actual/duplicate-bundles route:",
      error
    );
    res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
});

// save lotNo
router.post("/actual/update-crew-lotno", async (req, res) => {
  try {
    const { inboundId, lotId, crewLotNo } = req.body;

    let finalIdValue = null;
    let isInbound = true;
    let updateResult = null;
    let searchAttempts = [];

    // Priority 1: inboundId
    if (inboundId && inboundId !== 0) {
      finalIdValue = inboundId;
      isInbound = true;

      updateResult = await actualWeightModel.updateCrewLotNo(
        finalIdValue,
        isInbound,
        crewLotNo
      );

      searchAttempts.push({
        type: "inboundId",
        id: finalIdValue,
        updated: updateResult ? 1 : 0,
      });
    }

    // Priority 2: lotId if inboundId not provided or failed
    if (!updateResult && lotId && lotId !== 0) {
      finalIdValue = lotId;
      isInbound = false;

      updateResult = await actualWeightModel.updateCrewLotNo(
        finalIdValue,
        isInbound,
        crewLotNo
      );

      searchAttempts.push({
        type: "lotId",
        id: finalIdValue,
        updated: updateResult ? 1 : 0,
      });
    }

    // Response formatting
    if (updateResult) {
      res.json({
        success: true,
        message: `Crew Lot No successfully updated to ${crewLotNo} in both tables.`,
        finalSearchedId: finalIdValue,
        finalSearchedType: isInbound ? "inboundId" : "lotId",
        searchAttempts,
        updatedRecords: updateResult,
      });
    } else {
      res.status(404).json({
        success: false,
        message:
          "Unable to update Crew Lot No. No matching inboundId or lotId found.",
        searchAttempts,
      });
    }
  } catch (error) {
    console.error("Error in update-crew-lotno:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
});

// checks if the jobNo/lotNo is already scheduled outbound also used in repack page to check if it is outbounded
router.post("/actual/check-outbound-status", async (req, res) => {
  try {
    const { inboundId, lotId, jobNo, lotNo } = req.body;

    let finalIdValue = null;
    let isInbound = true;
    let outboundStatus = null;
    let searchAttempts = [];
    let resolvedJobNo = jobNo;
    let resolvedLotNo = lotNo;

    // Priority 1: Check for inboundId
    if (inboundId && inboundId !== 0) {
      finalIdValue = inboundId;
      isInbound = true;

      outboundStatus = await actualWeightModel.checkOutboundScheduleStatus(
        finalIdValue,
        isInbound,
        resolvedJobNo,
        resolvedLotNo
      );

      searchAttempts.push({
        type: "inboundId",
        id: finalIdValue,
        found: outboundStatus ? 1 : 0,
      });
    }

    // Priority 2: Check for lotId if inboundId not found/is 0 OR if no status found with inboundId
    if (!outboundStatus && lotId && lotId !== 0) {
      finalIdValue = lotId;
      isInbound = false;

      outboundStatus = await actualWeightModel.checkOutboundScheduleStatus(
        finalIdValue,
        isInbound,
        resolvedJobNo,
        resolvedLotNo
      );

      searchAttempts.push({
        type: "lotId",
        id: finalIdValue,
        found: outboundStatus ? 1 : 0,
      });
    }

    // Priority 3: Try to find using jobNo and lotNo if still no status found
    if (!outboundStatus && jobNo && lotNo) {
      // First try to find inboundId using jobNo and lotNo
      const inboundResult = await actualWeightModel.findRelatedId(
        null,
        false,
        jobNo,
        lotNo
      );

      if (inboundResult && inboundResult !== 0) {
        finalIdValue = inboundResult;
        isInbound = true;

        outboundStatus = await actualWeightModel.checkOutboundScheduleStatus(
          finalIdValue,
          isInbound,
          jobNo,
          lotNo
        );

        searchAttempts.push({
          type: "inboundId (from jobNo/lotNo)",
          id: finalIdValue,
          found: outboundStatus ? 1 : 0,
        });

        // If no status found with inboundId, try lotId
        if (!outboundStatus) {
          const lotResult = await actualWeightModel.findRelatedId(
            null,
            true,
            jobNo,
            lotNo
          );

          if (lotResult && lotResult !== 0) {
            finalIdValue = lotResult;
            isInbound = false;

            outboundStatus =
              await actualWeightModel.checkOutboundScheduleStatus(
                finalIdValue,
                isInbound,
                jobNo,
                lotNo
              );

            searchAttempts.push({
              type: "lotId (from jobNo/lotNo)",
              id: finalIdValue,
              found: outboundStatus ? 1 : 0,
            });
          }
        }
      } else {
        // If no inbound found, try to find lotId directly using jobNo and lotNo
        const lotResult = await actualWeightModel.findRelatedId(
          null,
          true,
          jobNo,
          lotNo
        );

        if (lotResult && lotResult !== 0) {
          finalIdValue = lotResult;
          isInbound = false;

          outboundStatus = await actualWeightModel.checkOutboundScheduleStatus(
            finalIdValue,
            isInbound,
            jobNo,
            lotNo
          );

          searchAttempts.push({
            type: "lotId (from jobNo/lotNo)",
            id: finalIdValue,
            found: outboundStatus ? 1 : 0,
          });
        }
      }
    }

    // Prepare response
    const isScheduledForOutbound = !!outboundStatus;
    let message = "";
    let scheduledDate = null;
    let outboundReference = null;

    if (isScheduledForOutbound) {
      const status = outboundStatus;

      // Format the scheduled date
      if (status.scheduledAt) {
        scheduledDate = new Date(status.scheduledAt)
          .toISOString()
          .split("T")[0];
      }

      // Create outbound reference
      outboundReference = `OUT-${status.scheduleOutboundId}`;

      // Create appropriate message based on outbound status
      if (status.isOutbounded) {
        message = `This lot has already been outbounded (${outboundReference}). Weight editing is disabled.`;
      } else if (
        status.releaseDate ||
        status.exportDate ||
        status.deliveryDate
      ) {
        const releaseInfo = status.releaseDate
          ? `Release: ${new Date(status.releaseDate).toLocaleDateString()}`
          : "";
        const exportInfo = status.exportDate
          ? `Export: ${new Date(status.exportDate).toLocaleDateString()}`
          : "";
        const deliveryInfo = status.deliveryDate
          ? `Delivery: ${new Date(status.deliveryDate).toLocaleDateString()}`
          : "";

        const dates = [releaseInfo, exportInfo, deliveryInfo]
          .filter(Boolean)
          .join(", ");
        message = `This lot is scheduled for outbound (${outboundReference}). ${dates}. Weight editing is disabled.`;
      } else {
        message = `This lot is scheduled for outbound (${outboundReference}) on ${scheduledDate}. Weight editing is disabled.`;
      }
    } else {
      message = "Lot is not scheduled for outbound. Weight editing is allowed.";
    }

    // Return response
    res.json({
      isScheduledForOutbound,
      scheduledDate,
      outboundReference,
      message,
      searchAttempts,
      finalSearchedId: finalIdValue,
      finalSearchedType: isInbound ? "inboundId" : "lotId",
      outboundDetails: outboundStatus
        ? {
            selectedInboundId: outboundStatus.selectedInboundId,
            scheduleOutboundId: outboundStatus.scheduleOutboundId,
            isOutbounded: outboundStatus.isOutbounded,
            releaseDate: outboundStatus.releaseDate,
            exportDate: outboundStatus.exportDate,
            deliveryDate: outboundStatus.deliveryDate,
          }
        : null,
    });
  } catch (error) {
    console.error("Error in check-outbound-status:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
      isScheduledForOutbound: false,
      message:
        "Error checking outbound status. Weight editing is temporarily disabled.",
    });
  }
});

router.post("/actual/get-historical-bundles", async (req, res) => {
  const { jobNo, lotNo } = req.body;
  try {
    // Validation
    if (!jobNo || !lotNo) {
      console.log("[DEBUG] Validation failed: jobNo or lotNo is missing.");
      return res.status(400).json({
        error: "Both jobNo and lotNo must be provided.",
      });
    }

    const bundles = await actualWeightModel.getHistoricalBundlesByJobAndLot(
      jobNo,
      lotNo
    );

    if (bundles && bundles.length > 0) {
      console.log(
        `[DEBUG] Found ${bundles.length} bundles. Sending 200 OK response.`
      );
      res.status(200).json(bundles);
    } else {
      console.log(
        "[DEBUG] No bundles found by the model. Sending 404 Not Found response."
      );
      res.status(404).json({
        error: `No historical bundles found for ${jobNo} - ${lotNo}.`,
      });
    }
  } catch (error) {
    console.error("[DEBUG] An error occurred in the router:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
});

module.exports = router;
