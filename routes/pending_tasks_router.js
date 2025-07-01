const express = require("express");
const router = express.Router();
const pendingTasksModel = require("../models/pending_tasks_model");

// --- INBOUND ROUTES---
router.get("/tasks-jobNo", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const result = await pendingTasksModel.findJobNoPendingTasks(
      page,
      pageSize
    );
    res.status(200).json({
      data: result,
      page,
      pageSize,
      totalPages: Math.ceil(result.totalCount / pageSize),
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
    const { lotId } = req.body;

    if (!lotId) {
      return res.status(400).json({ error: "lotId is required" });
    }
    const updatedLots = await pendingTasksModel.updateReportStatus(lotId);
    if (!updatedLots || updatedLots.length === 0) {
      return res
        .status(404)
        .json({ error: "Lot not found or already updated" });
    }
    res.status(200).json({
      message: "Lot report status updated successfully.",
      updatedLot: updatedLots[0],
    });
  } catch (error) {
    console.error("Error updating report status:", error);
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

// --- OUTBOUND ROUTES ---
// Fetch schedule IDs for pending outbound tasks
router.get("/tasks-outbound-ids", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const result = await pendingTasksModel.findScheduleIdPendingOutbound(
      page,
      pageSize
    );
    res.status(200).json({
      data: result,
      page,
      pageSize,
      totalPages: Math.ceil(result.totalCount / pageSize),
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch pending outbound schedule IDs." });
  }
});

// Fetch details for pending outbound tasks based on scheduleOutboundId
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

// Fetch user details for a pending outbound task based on scheduleOutboundId
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
router.post("/tasks-outbound-office", async (req, res) => {
  const { scheduleOutboundId } = req.body;
  if (!scheduleOutboundId) {
    return res.status(400).json({ error: "scheduleOutboundId is required." });
  }
  try {
    const result = await pendingTasksModel.getDetailsPendingOutboundOffice(
      scheduleOutboundId
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending tasks." });
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

module.exports = router;
