const express = require("express");
const {getReportsByStatus, getReportsByLotId} = require('../models/notifications.model');
const router = express.Router();

// Updated router endpoint
router.get('/notifications/:status', async (req, res) => {
  try {
    const { status } = req.params;
    
    if (!['pending', 'accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, accepted, or declined' });
    }

    const reports = await getReportsByStatus(status);

    res.status(200).json({
      message: `${status} reports retrieved successfully`,
      reports,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all reports for a specific lot
router.get('/lot/:lotId/reports', async (req, res) => {
  try {
    const { lotId } = req.params;

    const reports = await getReportsByLotId(lotId);

    res.status(200).json({
      message: 'Lot reports retrieved successfully',
      reports,
    });
  } catch (error) {
    console.error('Error fetching lot reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
