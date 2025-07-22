const express = require("express");
const router = express.Router();
const actualWeightModel = require("../models/actualWeight.model");

router.post("/actual/save-weight", async (req, res) => {
  const { inboundId, lotId, actualWeight, bundles } = req.body;
  
  try {
    let result;
    if (inboundId) {
      result = await actualWeightModel.saveInboundWithBundles(inboundId, actualWeight, bundles);
    } else if (lotId) {
      result = await actualWeightModel.saveLotWithBundles(lotId, actualWeight, bundles);
    } else {
      return res.status(400).json({ error: "Either inboundId or lotId must be provided" });
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/actual/get-weight", async (req, res) => {
  const { inboundId, lotId } = req.body;

  try {
    let result;
    if (inboundId) {
      result = await actualWeightModel.getInboundWithBundles(inboundId);
    } else if (lotId) {
      result = await actualWeightModel.getLotWithBundles(lotId);
    } else {
      return res.status(400).json({ error: "Either inboundId or lotId must be provided" });
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/actual/update-bundle", async (req, res) => {
  const { bundleId, weight, meltNo } = req.body;

  try {
    if (!bundleId) {
      return res.status(400).json({ error: "bundleId is required" });
    }
    const result = await actualWeightModel.updateSingleBundle(bundleId, weight, meltNo);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
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

module.exports = router;