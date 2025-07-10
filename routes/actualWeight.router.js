const express = require("express");
const router = express.Router();
const actualWeightModel = require("../models/actualWeight.model");

router.post("/actual/save-inbound-bundles", async (req, res) => {
  const { inboundId, actualWeight, bundles } = req.body;
    console.log("Received data:", req.body);

  try {
    const result = await actualWeightModel.saveInboundWithBundles(inboundId, actualWeight, bundles);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error saving inbound bundles:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/actual/get-inbound-bundles", async (req, res) => {
  const { inboundId } = req.body;
  try {
    const result = await actualWeightModel.getInboundWithBundles(inboundId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching inbound bundles:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/actual/update-inbound-weight", async (req, res) => {
  const { inboundId, actualWeight } = req.body;
  try {
    const result = await actualWeightModel.updateInboundActualWeight(inboundId, actualWeight);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error updating inbound weight:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/actual/update-bundle", async (req, res) => {
  const { inboundBundleId, weight, meltNo } = req.body;
  try {
    const result = await actualWeightModel.updateSingleBundle(inboundBundleId, weight, meltNo);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error updating bundle:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}); 

router.post("/actual/get-inbound-bundles-if-weighted", async (req, res) => {
  const { inboundId } = req.body;

  try {
    const result = await actualWeightModel.getInboundBundlesIfWeighted(inboundId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching inbound bundles if weighted:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



module.exports = router;