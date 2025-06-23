const express = require("express");
const router = express.Router();
const pendingTasksModel = require("../models/pending_tasks_model");

router.get("/tasks-jobNo", async (req, res) => {
  try {
    const result = await pendingTasksModel.findJobNoPendingTasks();
    res.status(200).json(result);
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

// --- OUTBOUND ROUTES ---
// Fetch job numbers for pending outbound tasks
router.get("/tasks-outbound-jobNo", async (req, res) => {
  try {
    const result = await pendingTasksModel.findJobNoPendingOutbound();
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch pending outbound job numbers." });
  }
});

// Fetch details for pending outbound tasks based on job number
router.post("/tasks-outbound", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksModel.getDetailsPendingOutbound(jobNo);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending outbound tasks." });
  }
});

router.post("/tasks-outbound-user", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksModel.pendingOutboundTasksUserId(jobNo);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching user info for outbound task:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
