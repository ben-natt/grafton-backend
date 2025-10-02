const express = require("express");
const {
  getReportsByStatus, 
  getReportsByLotId,
  getDuplicateReportsByStatus,
  getJobReportsByStatus // <-- IMPORT THE NEW FUNCTION
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
    // +++ CONSOLE LOG: Track when the endpoint is hit +++
    console.log(`[Router] GET /notifications/${status} hit.`);
    
    if (!['pending', 'accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, accepted, or declined' });
    }

    // +++ MODIFICATION: Fetch both lot-level and job-level reports in parallel +++
    const [lotReports, jobReports] = await Promise.all([
      getReportsByStatus(status),
      getJobReportsByStatus(status)
    ]);

    // +++ CONSOLE LOG: See how many of each were found +++
    console.log(`[Router] Fetched ${lotReports.length} lot-level reports and ${jobReports.length} job-level reports.`);

    const combinedReports = [...lotReports, ...jobReports];

    // Sort combined list by timestamp DESC so newest appear first
    combinedReports.sort((a, b) => new Date(b.reportedOn) - new Date(a.reportedOn));
    
    // +++ CONSOLE LOG: Confirm the total count being sent +++
    console.log(`[Router] Responding with a total of ${combinedReports.length} discrepancy reports.`);

    res.status(200).json({
      message: `${status} reports retrieved successfully`,
      reports: combinedReports, // <-- Send the combined array
    });
  } catch (error) {
    // +++ CONSOLE LOG: Catch any errors during the process +++
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