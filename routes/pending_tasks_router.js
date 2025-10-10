const express = require("express");
const router = express.Router();

const pendingTasksModel = require("../models/pending_tasks_model");
const pendingTasksOfficeModel = require("../models/pending_tasks_office.model");

// ------------------------ Supervisor Flow ----------------------
// --- INBOUND ROUTES---
router.get("/tasks-jobNo", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      exWarehouseLot: req.query.exWarehouseLot,
    };
    const result = await pendingTasksModel.getPendingInboundTasks(
      page,
      pageSize,
      filters
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching pending inbound tasks:", error);
    res.status(500).json({ error: "Failed to fetch pending tasks." });
  }
});

router.post("/report-job-discrepancy", async (req, res) => {
  try {
    const { jobNo, reportedBy, discrepancyType } = req.body;
    // +++ CONSOLE LOG: What the router received +++
    console.log(`[Router] POST /report-job-discrepancy received:`, { jobNo, reportedBy, discrepancyType });

    if (!jobNo || !reportedBy || !discrepancyType) {
      return res.status(400).json({ error: "jobNo, reportedBy, and discrepancyType are required." });
    }

    if (!['lack', 'extra'].includes(discrepancyType)) {
      return res.status(400).json({ error: "Invalid discrepancyType. Must be 'lack' or 'extra'." });
    }

    const reportedCount = await pendingTasksModel.reportJobDiscrepancy(jobNo, reportedBy, discrepancyType);

    // +++ CONSOLE LOG: What the model function returned +++
    console.log(`[Router] Model reported ${reportedCount} lots. Sending response.`);

    if (reportedCount > 0) {
      res.status(200).json({
        message: `Successfully reported discrepancy for ${reportedCount} lot(s) in job ${jobNo}.`
      });
    } else {
      res.status(404).json({ message: "No pending, unreported lots found for the specified job." });
    }
  } catch (error) {
    // +++ CONSOLE LOG: Log any router-level errors +++
    console.error("[Router] Error in /report-job-discrepancy:", error);
    res.status(500).json({ error: "Failed to report job discrepancy." });
  }
});
router.post("/reverse-inbound/:inboundId", async (req, res) => {
  try {
    const { inboundId } = req.params;
    if (!inboundId) {
      return res.status(400).json({ error: "Inbound ID is required." });
    }

    const result = await pendingTasksModel.reverseInbound(parseInt(inboundId, 10));
    res
      .status(200)
      .json({ message: "Inbound successfully reversed.", data: result });
  } catch (error) {
    console.error("Error in reverse-inbound route:", error);
    res.status(500).json({
      error: "Failed to reverse inbound task.",
      details: error.message,
    });

  }
});

// --- OUTBOUND ROUTES ---
router.get("/tasks-outbound-ids", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      jobNo: req.query.jobNo, // Add jobNo filter
    };
    // Call the new unified function for outbound tasks
    const result = await pendingTasksModel.getPendingOutboundTasks(
      page,
      pageSize,
      filters
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching pending outbound tasks:", error);
    res.status(500).json({ error: "Failed to fetch pending outbound tasks." });
  }
});

router.put("/schedule-outbound/:scheduleOutboundId", async (req, res) => {
  try {
    const scheduleOutboundId = parseInt(req.params.scheduleOutboundId);
    const { containerNo, sealNo } = req.body;

    if (isNaN(scheduleOutboundId)) {
      return res.status(400).json({ error: "Invalid scheduleOutboundId." });
    }

    if (!containerNo || !sealNo) {
      return res
        .status(400)
        .json({ error: "Both containerNo and sealNo are required." });
    }

    const updatedSchedule =
      await pendingTasksModel.updateScheduleOutboundDetails(
        scheduleOutboundId,
        { containerNo, sealNo }
      );

    if (!updatedSchedule || updatedSchedule.length === 0) {
      return res
        .status(404)
        .json({ error: "Schedule not found or no changes made." });
    }

    res.status(200).json({
      message: "Schedule details updated successfully.",
      data: updatedSchedule[0],
    });
  } catch (error) {
    console.error("Error updating schedule details:", error);
    res.status(500).json({ error: "Failed to update schedule details." });
  }
});

router.post("/tasks-outbound-user", async (req, res) => {
  const { scheduleOutboundId } = req.body;
  if (!scheduleOutboundId) {
    return res.status(400).json({ error: "scheduleOutboundId is required." });
  }
  try {
    const result = await pendingTasksModel.pendingOutboundTasksUser(
      scheduleOutboundId
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching user info for outbound task:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ----------------------------------- OFFICE Flow ---------------------------------
// --- NEW ROUTE FOR FILTER OPTIONS ---
router.get("/office-filter-options", async (req, res) => {
  try {
    const isOutbound = req.query.isOutbound === "true";
    const options = await pendingTasksOfficeModel.getOfficeFilterOptions(
      isOutbound
    );
    res.status(200).json(options);
  } catch (error) {
    console.error("Error fetching filter options:", error);
    res.status(500).json({ error: "Failed to fetch filter options." });
  }
});

// --- INBOUND ROUTES ---
router.post("/acknowledge-report", async (req, res) => {
  try {
    const { lotId, reportStatus, resolvedBy } = req.body;

    if (!lotId || !reportStatus || !resolvedBy) {
      return res
        .status(400)
        .json({ error: "lotId, reportStatus, and resolvedBy are required" });
    }

    if (!["accepted", "declined"].includes(reportStatus)) {
      return res.status(400).json({
        error: "Invalid reportStatus. Must be 'accepted' or 'declined'",
      });
    }

    const updatedReports = await pendingTasksOfficeModel.updateReportStatus({
      lotId,
      reportStatus,
      resolvedBy,
    });

    if (!updatedReports || updatedReports.length === 0) {
      return res
        .status(404)
        .json({ error: "No pending report found to update for this lotId." });
    }

    res.status(200).json({
      message: `Report ${reportStatus} successfully.`,
      updatedReport: updatedReports[0],
    });
  } catch (error) {
    console.error("Error resolving report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/acknowledge-duplicated", async (req, res) => {
  try {
    const { lotId, reportStatus, resolvedBy } = req.body;

    if (!lotId || !reportStatus || !resolvedBy) {
      return res
        .status(400)
        .json({ error: "lotId, reportStatus, and resolvedBy are required" });
    }

    if (!["accepted", "declined"].includes(reportStatus)) {
      return res.status(400).json({
        error: "Invalid reportStatus. Must be 'accepted' or 'declined'",
      });
    }

    const updatedReports = await pendingTasksOfficeModel.updateDuplicateStatus({
      lotId,
      reportStatus,
      resolvedBy,
    });

    if (!updatedReports || updatedReports.length === 0) {
      return res
        .status(404)
        .json({ error: "No pending report found to update for this lotId." });
    }

    res.status(200).json({
      message: `Report ${reportStatus} successfully.`,
      updatedReport: updatedReports[0],
    });
  } catch (error) {
    console.error("Error resolving report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/report-supervisor/:lotId", async (req, res) => {
  try {
    const lotId = parseInt(req.params.lotId);

    if (!lotId) {
      return res.status(400).json({ error: "lotId is required" });
    }

    const result = await pendingTasksOfficeModel.getReportSupervisorUsername(
      lotId
    );

    if (!result) {
      return res.status(404).json({ error: "No report found for this lotId" });
    }

    res.status(200).json({ username: result.username });
  } catch (error) {
    console.error("Error fetching report supervisor username:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/duplicate-report/:lotId", async (req, res) => {
  try {
    const lotId = parseInt(req.params.lotId);

    if (!lotId || isNaN(lotId)) {
      return res.status(400).json({ error: "Valid lotId is required" });
    }

    const result = await pendingTasksOfficeModel.getDuplicateReportUsername(
      lotId
    );

    if (!result) {
      return res.status(404).json({
        error: "No duplicate report found for this lotId",
        message: "No user has reported this lot as a duplicate",
      });
    }

    res.status(200).json({
      username: result.username,
      message: "Username retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching duplicate report username:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/quantity/update", async (req, res) => {
  const { lotId, expectedBundleCount } = req.body; // changed from jobNo to lotId
  try {
    const result = await pendingTasksOfficeModel.pendingTasksUpdateQuantity(
      lotId,
      expectedBundleCount
    );
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update quantity." });
  }
});

// Router endpoints (add to your existing router file) (edit functionality )
router.post("/lot-inbound/get", async (req, res) => {
  const { jobNo, lotNo } = req.body;

  if (!jobNo || !lotNo) {
    return res.status(400).json({
      error: "jobNo and lotNo are required in the request body.",
    });
  }

  try {
    const result = await pendingTasksOfficeModel.getLotInboundDate(
      jobNo,
      lotNo
    );

    if (!result) {
      return res.status(404).json({ error: "Lot not found" });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch lot inbound date." });
  }
});

// Update inbound date for a specific lot (edit functionality )
router.post("/lot-inbound/update", async (req, res) => {
  const { jobNo, lotNo, inboundDate, userId } = req.body; // Added userId

  if (!jobNo || !lotNo || !inboundDate || !userId) {
    return res.status(400).json({
      error: "jobNo, lotNo, inboundDate, and userId are required.",
    });
  }

  try {
    const existingLot = await pendingTasksOfficeModel.getLotInboundDate(jobNo, lotNo);
    if (!existingLot) {
      return res.status(404).json({ error: "Lot not found" });
    }

    // MODIFIED: Pass userId for activity logging
    const result = await pendingTasksOfficeModel.updateLotInboundDate(
      jobNo,
      lotNo,
      inboundDate,
      userId
    );

    res.status(200).json({
      success: true,
      message: "Lot inbound date updated successfully",
      data: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update lot inbound date." });
  }
});

router.post("/tasks-inbound-office", async (req, res) => {
  try {
    const { filters, pagination } = req.body;
    const page = pagination?.page || 1;
    const pageSize = pagination?.pageSize || 10;
    const result = await pendingTasksOfficeModel.findInboundTasksOffice(
      filters,
      page,
      pageSize
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending inbound tasks." });
  }
});

// --- OUTBOUND ROUTES ---
router.post("/tasks-outbound-office", async (req, res) => {
  try {
    const { filters, pagination } = req.body;
    const page = pagination?.page || 1;
    const pageSize = pagination?.pageSize || 10;
    const result = await pendingTasksOfficeModel.findOutboundTasksOffice(
      filters,
      page,
      pageSize
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending outbound tasks." });
  }
});

router.post("/lot-outbound/get", async (req, res) => {
  const { jobNo, lotNo } = req.body;
  if (!jobNo || !lotNo) {
    return res.status(400).json({
      error: "jobNo and lotNo are required in the request body.",
    });
  }
  try {
    const result = await pendingTasksOfficeModel.getLotOutboundDates(
      jobNo,
      lotNo
    );
    if (!result) {
      return res.status(404).json({ error: "Lot not found" });
    }
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch outbound dates." });
  }
});

router.post("/lot-outbound/update", async (req, res) => {
  const {
    jobNo,
    lotNo,
    releaseDate,
    releaseEndDate,
    exportDate,
    deliveryDate,
  } = req.body;

  if (!jobNo || !lotNo || !releaseDate) {
    return res.status(400).json({
      error: "jobNo, lotNo, and releaseDate are required.",
    });
  }

  try {
    const existingLot = await pendingTasksOfficeModel.getLotOutboundDates(
      jobNo,
      lotNo
    );
    if (!existingLot) {
      return res.status(404).json({ error: "Lot not found" });
    }
    const result = await pendingTasksOfficeModel.updateLotOutboundDates(
      jobNo,
      lotNo,
      releaseDate,
      releaseEndDate,
      exportDate,
      deliveryDate
    );
    res.status(200).json({
      success: true,
      message: "Outbound dates updated successfully",
      data: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update outbound dates." });
  }
});

router.get("/job-report-info/:jobNo", async (req, res) => {
  try {
    const { jobNo } = req.params;
    const info = await pendingTasksOfficeModel.getJobReportInfo(jobNo);
    if (info) {
      res.status(200).json(info);
    } else {
      res.status(404).json({ message: "No pending report found for this job." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch job report info." });
  }
});

// NEW & CONSOLIDATED: Handles the initial "Accept" or "Decline" of a job report
router.post("/acknowledge-job-report", async (req, res) => {
  try {
    const { jobNo, status, resolvedBy } = req.body;
    if (!jobNo || !status || !resolvedBy) {
      return res.status(400).json({ error: "jobNo, status, and resolvedBy are required." });
    }
    const result = await pendingTasksOfficeModel.updateJobReportStatus({ jobNo, status, resolvedBy });
    res.status(200).json({ message: "Job report status updated.", data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to update job report status." });
  }
});

// NEW ROUTE: Handles finalization of an "extra lots" report.
router.post('/finalize-job-report', async (req, res) => {
  try {
    const { jobNo, deletedLotIds, resolvedBy } = req.body;
    if (!jobNo || !deletedLotIds || resolvedBy === undefined) {
      return res.status(400).json({ error: 'Missing required fields: jobNo, deletedLotIds, resolvedBy' });
    }
    await pendingTasksOfficeModel.finalizeJobReport({
      jobNo,
      deletedLotIds,
      resolvedBy,
    });
    res.status(200).json({ message: 'Job report finalized successfully.' });
  } catch (error) {
    console.error('Error finalizing job report:', error);
    res.status(500).json({ error: 'Failed to finalize job report.' });
  }
});

// NEW ROUTE: Deletes a lot (by updating its status)
router.delete("/lot/:lotId", async (req, res) => {
  try {
    const { lotId } = req.params;
    const result = await pendingTasksOfficeModel.deleteLot(parseInt(lotId));
    if (result) {
      res.status(200).json({ message: "Lot deleted successfully." });
    } else {
      res.status(404).json({ message: "Lot not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to delete lot." });
  }
});
  
module.exports = router;
