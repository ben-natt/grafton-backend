const express = require("express");
const {
  getReportsByStatus, 
  getReportsByLotId,
  getDuplicateReportsByStatus
} = require('../models/notifications.model');
const router = express.Router();

/**
 * @route GET /report/notifications/:status
 * @description Get discrepancy report notifications by status.
 * @access Public
 */
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

/**
 * @route GET /report/notifications/duplicates/:status
 * @description Get duplicate lot report notifications by status.
 * @access Public
 */
router.get('/notifications/duplicates/:status', async (req, res) => {
  try {
    const { status } = req.params;
    
    if (!['pending', 'accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, accepted, or declined' });
    }

    const duplicateReports = await getDuplicateReportsByStatus(status);

    res.status(200).json({
      message: `${status} duplicate reports retrieved successfully`,
      reports: duplicateReports,
    });
  } catch (error) {
    console.error('Error fetching duplicate notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route GET /report/lot/:lotId/reports
 * @description Get all discrepancy reports for a specific lot.
 * @access Public
 */
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
