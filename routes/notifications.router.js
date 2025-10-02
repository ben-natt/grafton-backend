const express = require("express");
const {
  getReportsByStatus, 
  getReportsByLotId,
  getDuplicateReportsByStatus,
  getJobReportsByStatus,
  // +++ IMPORT NEW DELETE FUNCTIONS +++
  deleteDiscrepancyReportById,
  deleteDuplicateReportById,
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

// +++ START: NEW DELETE ROUTES +++

/**
 * @route DELETE /report/notifications/:reportId
 * @description Delete a discrepancy report by its ID.
 * @access Public
 */
router.delete('/notifications/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    console.log(`[Router] DELETE /notifications/${reportId} hit.`);

    const success = await deleteDiscrepancyReportById(reportId);

    if (success) {
      res.status(200).json({ message: `Discrepancy report ${reportId} deleted successfully.` });
    } else {
      // Return 404 if the model function indicates no report was found/deleted.
      res.status(404).json({ error: `Discrepancy report with ID ${reportId} not found.` });
    }
  } catch (error) {
    console.error(`Error deleting discrepancy report ${req.params.reportId}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route DELETE /report/notifications/duplicates/:duplicatedId
 * @description Delete a duplicate lot report by its ID.
 * @access Public
 */
router.delete('/notifications/duplicates/:duplicatedId', async (req, res) => {
  try {
    const { duplicatedId } = req.params;
    console.log(`[Router] DELETE /notifications/duplicates/${duplicatedId} hit.`);

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

// +++ END: NEW DELETE ROUTES +++

module.exports = router;