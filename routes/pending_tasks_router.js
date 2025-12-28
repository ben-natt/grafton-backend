const express = require("express");
const router = express.Router();

const pendingTasksModel = require("../models/pending_tasks_model");
const pendingTasksOfficeModel = require("../models/pending_tasks_office.model");

const {
  setLastReadPendingTaskTime,
  getLastReadPendingTaskTime,
} = require('../models/pending_tasks_model');

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
    
    if (!jobNo || !reportedBy || !discrepancyType) {
      return res.status(400).json({ error: "jobNo, reportedBy, and discrepancyType are required." });
    }

    if (!['lack', 'extra'].includes(discrepancyType)) {
      return res.status(400).json({ error: "Invalid discrepancyType. Must be 'lack' or 'extra'." });
    }

    const reportedCount = await pendingTasksModel.reportJobDiscrepancy(jobNo, reportedBy, discrepancyType);

    if (reportedCount > 0) {
      res.status(200).json({
        message: `Successfully reported discrepancy for ${reportedCount} lot(s) in job ${jobNo}.`
      });
    } else {
      res.status(404).json({ message: "No pending, unreported lots found for the specified job." });
    }
  } catch (error) {
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
      jobNo: req.query.jobNo, 
    };
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

// ----------------------------------- OFFICE Flow ---------------------------------
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
    if (!lotId) return res.status(400).json({ error: "lotId is required" });

    const result = await pendingTasksOfficeModel.getReportSupervisorUsername(lotId);
    if (!result) return res.status(404).json({ error: "No report found for this lotId" });

    res.status(200).json({ username: result.username });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/duplicate-report/:lotId", async (req, res) => {
  try {
    const lotId = parseInt(req.params.lotId);
    if (!lotId) return res.status(400).json({ error: "Valid lotId is required" });

    const result = await pendingTasksOfficeModel.getDuplicateReportUsername(lotId);
    if (!result) return res.status(404).json({ error: "No duplicate report found" });

    res.status(200).json({ username: result.username });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/quantity/update", async (req, res) => {
  const { lotId, expectedBundleCount } = req.body;
  try {
    const result = await pendingTasksOfficeModel.pendingTasksUpdateQuantity(
      lotId,
      expectedBundleCount
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to update quantity." });
  }
});

router.post("/lot-inbound/get", async (req, res) => {
  const { jobNo, lotNo, exWLot } = req.body;
  if (!jobNo || !lotNo || !exWLot) return res.status(400).json({ error: "Missing fields" });
  try {
    const result = await pendingTasksOfficeModel.getLotInboundDate(jobNo, lotNo, exWLot);
    if (!result) return res.status(404).json({ error: "Lot not found" });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch lot inbound date." });
  }
});

router.post("/lot-inbound/update", async (req, res) => {
  const { jobNo, lotNo, exWarehouseLot, inboundDate, userId } = req.body;
  if (!jobNo || !lotNo || !exWarehouseLot || !inboundDate || !userId) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    const result = await pendingTasksOfficeModel.updateLotInboundDate(
      jobNo, lotNo, exWarehouseLot, inboundDate, userId
    );
    res.status(200).json({ success: true, message: "Updated successfully", data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to update lot inbound date." });
  }
});

router.post("/tasks-inbound-office", async (req, res) => {
  try {
    const { filters, pagination } = req.body;
    const page = pagination?.page || 1;
    const pageSize = pagination?.pageSize || 10;
    const result = await pendingTasksOfficeModel.findInboundTasksOffice(filters, page, pageSize);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending inbound tasks." });
  }
});

router.post("/tasks-outbound-office", async (req, res) => {
  try {
    const { filters, pagination } = req.body;
    const page = pagination?.page || 1;
    const pageSize = pagination?.pageSize || 10;
    const result = await pendingTasksOfficeModel.findOutboundTasksOffice(filters, page, pageSize);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending outbound tasks." });
  }
});

router.post("/lot-outbound/get", async (req, res) => {
  const { jobNo, lotNo } = req.body;
  try {
    const result = await pendingTasksOfficeModel.getLotOutboundDates(jobNo, lotNo);
    if (!result) return res.status(404).json({ error: "Lot not found" });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch outbound dates." });
  }
});

router.post("/lot-outbound/update", async (req, res) => {
  const { jobNo, lotNo, releaseDate } = req.body;
  if (!jobNo || !lotNo || !releaseDate) return res.status(400).json({ error: "Missing fields" });
  try {
    const result = await pendingTasksOfficeModel.updateLotOutboundDates(
      jobNo, lotNo, req.body.releaseDate, req.body.releaseEndDate, req.body.exportDate, req.body.deliveryDate
    );
    res.status(200).json({ success: true, message: "Updated successfully", data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to update outbound dates." });
  }
});

router.get("/job-report-info/:jobNo", async (req, res) => {
  try {
    const { jobNo } = req.params;
    const info = await pendingTasksOfficeModel.getJobReportInfo(jobNo);
    if (info) res.status(200).json(info);
    else res.status(404).json({ message: "No pending report found." });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch job report info." });
  }
});

router.post("/acknowledge-job-report", async (req, res) => {
  try {
    const { jobNo, status, resolvedBy } = req.body;
    if (!jobNo || !status || !resolvedBy) return res.status(400).json({ error: "Missing fields" });
    const result = await pendingTasksOfficeModel.updateJobReportStatus({ jobNo, status, resolvedBy });
    res.status(200).json({ message: "Job report status updated.", data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to update job report status." });
  }
});

router.post('/finalize-job-report', async (req, res) => {
  try {
    const { jobNo, deletedLotIds, resolvedBy } = req.body;
    if (!jobNo || !deletedLotIds || resolvedBy === undefined) return res.status(400).json({ error: 'Missing fields' });
    await pendingTasksOfficeModel.finalizeJobReport({ jobNo, deletedLotIds, resolvedBy });
    res.status(200).json({ message: 'Job report finalized successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to finalize job report.' });
  }
});

router.delete("/lot/:lotId", async (req, res) => {
  try {
    const { lotId } = req.params;
    const result = await pendingTasksOfficeModel.deleteLot(parseInt(lotId));
    if (result) res.status(200).json({ message: "Lot deleted successfully." });
    else res.status(404).json({ message: "Lot not found." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete lot." });
  }
});

// --- STATUS CHECKS (FIXED) ---

router.get("/status/supervisor", async (req, res) => {
  try {
    const userId = req.query.userId; 
    const status = await pendingTasksModel.getSupervisorPendingStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    console.error("Error checking supervisor status:", error);
    res.status(500).json({ error: "Failed to check supervisor status" });
  }
});

router.get("/status/office", async (req, res) => {
  try {
    const userId = req.query.userId; 
    // This now connects to the UPDATED function in pending_tasks_office.model.js
    const status = await pendingTasksOfficeModel.getOfficePendingStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    console.error("Error checking office status:", error);
    res.status(500).json({ error: "Failed to check office status" });
  }
});
router.post('/pending-tasks/read', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    // [FIXED] Use standard UTC NOW()
    const query = `
      INSERT INTO public.user_pending_task_status ("userId", "lastReadTime")
      VALUES (:userId, NOW())
      ON CONFLICT ("userId") 
      DO UPDATE SET "lastReadTime" = NOW();
    `;

    await require("../database").sequelize.query(query, {
      replacements: { userId },
      type: require("sequelize").QueryTypes.INSERT
    });

    res.status(200).json({ message: 'Pending task read status updated (UTC)' });
  } catch (error) {
    console.error('[PendingRouter] ERROR updating read status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/pending-tasks/read-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const lastReadTime = await getLastReadPendingTaskTime(userId);
    res.status(200).json({ lastReadTime });
  } catch (error) {
    console.error('[PendingRouter] ERROR fetching read status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post("/finalize-job", async (req, res) => {
  try {
    // Extract filters from body
    const { jobNo, userId, filters } = req.body;
    
    if (!jobNo || !userId) {
      return res.status(400).json({ error: "jobNo and userId are required." });
    }

    // Pass filters to the model
    const result = await pendingTasksModel.finalizeInboundJob(jobNo, userId, filters || {});
    res.status(200).json(result);
  } catch (error) {
    console.error("Error finalizing job:", error);
    res.status(500).json({ error: "Failed to finalize job." });
  }
});
module.exports = router;