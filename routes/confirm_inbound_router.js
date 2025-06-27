const express = require("express");
const confirmInboundModel = require('../models/confirm_inbound_model');
const {reportConfirmation,insertInboundFromLots } = require('../models/confirm_inbound_model');
const router = express.Router();

// ROUTER TO DO REPORT
router.post('/tasks-report-confirmation', async (req, res) => {
  try {
    const { lotIds } = req.body;

    if (!Array.isArray(lotIds) || lotIds.length === 0) {
      return res.status(400).json({ error: 'lotIds must be a non-empty array' });
    }

    const updatedLots = await reportConfirmation(lotIds);

    if (!updatedLots || updatedLots.length === 0) {
      return res.status(404).json({ error: 'No lots were updated. Please check lotIds.' });
    }

    res.status(200).json({
      message: 'Lot report statuses updated successfully.',
      updatedLots,
    });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// ROUTER TO DO THE UPDATE AND ADDING OF INBOUND
router.post("/tasks-complete-inbound", async (req, res) => {
  const { selectedLots, userId } = req.body;

  if (!Array.isArray(selectedLots) || selectedLots.length === 0) {
    return res.status(400).json({ error: "Lots array is required and cannot be empty." });
  }

  if (!userId) {
    return res.status(400).json({ error: "User ID is required." });
  }

  try {
    const result = await confirmInboundModel.insertInboundFromLots(selectedLots, userId);
    res.status(200).json({ success: true, inserted: result });
  } catch (error) {
    console.error("Error inserting inbounds:", error);
    res.status(500).json({ error: "Failed to insert inbounds.", details: error.message });
  }
});




module.exports = router;
