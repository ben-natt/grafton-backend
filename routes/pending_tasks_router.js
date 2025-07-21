const express = require("express");
const router = express.Router();
const pendingTasksModel = require("../models/pending_tasks_model");

// --- INBOUND ROUTES---
router.get("/tasks-jobNo", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const { totalCount, data } = await pendingTasksModel.findJobNoPendingTasks(
      page,
      pageSize
    );
    res.status(200).json({
      data: data,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      totalCount: totalCount,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending tasks." });
  }
});

router.post("/tasks-inbound", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksModel.getDetailsPendingTasks(jobNo);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending tasks." });
  }
});

router.post("/pending/tasks-inbound-crew", async (req, res) => {
  const { jobNo, lotNo } = req.body;

  if (!jobNo || !lotNo) {
    return res.status(400).json({ error: "jobNo and lotNo are required." });
  }

  try {
    const result = await pendingTasksModel.getDetailsPendingTasksCrew(
      jobNo,
      lotNo
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending tasks for crew." });
  }
});

router.get("/tasks-lotNos", async (req, res) => {
  const { jobNo } = req.query;

  if (!jobNo) {
    return res.status(400).json({ error: "jobNo is required." });
  }

  try {
    const result = await pendingTasksModel.getLotNosForJob(jobNo);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch lotNos." });
  }
});

router.post("/tasks-user", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksModel.pendingTasksUserId(jobNo);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching stock records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/tasks-user-single-date", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksModel.pendingTasksUserIdSingleDate(jobNo);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching stock records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// OFFICE VERSION
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

    const updatedReports = await pendingTasksModel.updateReportStatus({
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

    const result = await pendingTasksModel.getReportSupervisorUsername(lotId);

    if (!result) {
      return res.status(404).json({ error: "No report found for this lotId" });
    }

    res.status(200).json({ username: result.username });
  } catch (error) {
    console.error("Error fetching report supervisor username:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tasks-inbound/sortReport", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksModel.getDetailsPendingTasksOrderByReport(
      jobNo
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending tasks." });
  }
});

router.post("/quantity/update", async (req, res) => {
  const { lotId, expectedBundleCount } = req.body; // changed from jobNo to lotId
  try {
    const result = await pendingTasksModel.pendingTasksUpdateQuantity(
      lotId,
      expectedBundleCount
    );
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update quantity." });
  }
});

router.get("/tasks-jobNo-office", async (req, res) => {
  try {
    const result = await pendingTasksModel.findJobNoOfficePendingTasks();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending tasks." });
  }
});

// --- OUTBOUND ROUTES ---
router.get("/tasks-outbound-ids", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const { totalCount, data } =
      await pendingTasksModel.findScheduleIdPendingOutbound(page, pageSize);
    res.status(200).json({
      data: data,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      totalCount: totalCount,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch pending outbound schedule IDs." });
  }
});

router.post("/tasks-outbound", async (req, res) => {
  const { scheduleOutboundId } = req.body;
  if (!scheduleOutboundId) {
    return res.status(400).json({ error: "scheduleOutboundId is required." });
  }
  try {
    const result = await pendingTasksModel.getDetailsPendingOutbound(
      scheduleOutboundId
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending outbound tasks." });
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

// OFFICE VERSION
// --- INBOUND ROUTES---
router.post("/tasks-inbound-office", async (req, res) => {
  try {
    const { filters, pagination } = req.body;
    const page = pagination?.page || 1;
    const pageSize = pagination?.pageSize || 10;
    const result = await pendingTasksModel.findInboundTasksOffice(
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
    const result = await pendingTasksModel.findOutboundTasksOffice(
      filters,
      page,
      pageSize
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending outbound tasks." });
  }
});

router.post("/tasks-outbound-office-date", async (req, res) => {
  const { scheduleOutboundId } = req.body;
  if (!scheduleOutboundId) {
    return res.status(400).json({ error: "scheduleOutboundId is required." });
  }
  try {
    const result = await pendingTasksModel.pendingOutboundTasksUserIdSingleDate(
      scheduleOutboundId
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching stock records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/tasks-outbound-ids-office", async (req, res) => {
  try {
    const result =
      await pendingTasksModel.findScheduleIdPendingOutboundOffice();
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch pending outbound schedule IDs." });
  }
});

module.exports = router;
