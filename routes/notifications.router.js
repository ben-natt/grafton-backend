const express = require("express");
const {
  getReportsByStatus, 
  getReportsByLotId,
  getDuplicateReportsByStatus,
  getJobReportsByStatus,
  deleteDiscrepancyReportById,
  deleteDuplicateReportById,
  setLastReadTime, 
  getLastReadTime,
} = require('../models/notifications.model');
const router = express.Router();

/**
 * @route GET /report/notifications/:status
 * @description Get discrepancy report notifications by status (both lot and job level).
 * @access Public
 */
router.get('/notifications/:status', async (req, res) => {
  try {
    const { status } = req.params;
    console.log(`[Router] GET /notifications/${status} hit.`);
    
    if (!['pending', 'accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, accepted, or declined' });
    }

    const [lotReports, jobReports] = await Promise.all([
      getReportsByStatus(status),
      getJobReportsByStatus(status)
    ]);

    console.log(`[Router] Fetched ${lotReports.length} lot-level reports and ${jobReports.length} job-level reports.`);

    const combinedReports = [...lotReports, ...jobReports];

    combinedReports.sort((a, b) => new Date(b.reportedOn) - new Date(a.reportedOn));
    
    console.log(`[Router] Responding with a total of ${combinedReports.length} discrepancy reports.`);

    res.status(200).json({
      message: `${status} reports retrieved successfully`,
      reports: combinedReports,
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

/**
 * @route DELETE /report/notifications/:status/:reportId
 * @description Delete a discrepancy report by its ID and status.
 * @access Public
 */
router.delete('/notifications/:status/:reportId', async (req, res) => {
  try {
    const { reportId, status } = req.params;
    console.log(`[Router] DELETE /notifications/${status}/${reportId} hit.`);

    const success = await deleteDiscrepancyReportById(reportId);

    if (success) {
      res.status(200).json({ message: `Discrepancy report ${reportId} deleted successfully.` });
    } else {
      res.status(404).json({ error: `Discrepancy report with ID ${reportId} not found.` });
    }
  } catch (error) {
    console.error(`Error deleting discrepancy report ${req.params.reportId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route DELETE /report/notifications/duplicates/:status/:duplicatedId
 * @description Delete a duplicate lot report by its ID and status.
 * @access Public
 */
router.delete('/notifications/duplicates/:status/:duplicatedId', async (req, res) => {
  try {
    const { duplicatedId, status } = req.params;
    console.log(`[Router] DELETE /notifications/duplicates/${status}/${duplicatedId} hit.`);

    const success = await deleteDuplicateReportById(duplicatedId);

    if (success) {
      res.status(200).json({ message: `Duplicate report ${duplicatedId} deleted successfully.` });
    } else {
      res.status(404).json({ error: `Duplicate report with ID ${duplicatedId} not found.` });
    }
  } catch (error) {
    console.error(`Error deleting duplicate report ${req.params.duplicatedId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/notifications/read', async (req, res) => {
  try {
    console.log("--- [Router] POST /notifications/read HIT ---");
    console.log("Request Body:", req.body);

    const { userId, timestamp } = req.body;
    
    if (!userId || !timestamp) {
      console.error("--- [Router] ERROR: Missing fields ---");
      return res.status(400).json({ error: 'Missing userId or timestamp' });
    }
    
    await setLastReadTime(userId, timestamp);
    
    console.log("--- [Router] Success: Read status updated ---");
    res.status(200).json({ message: 'Read status updated' });
  } catch (error) {
    console.error('--- [Router] CRITICAL ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/notifications/read-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const lastReadTime = await getLastReadTime(userId);
    
    res.status(200).json({ lastReadTime });
  } catch (error) {
    console.error('Error fetching read status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

