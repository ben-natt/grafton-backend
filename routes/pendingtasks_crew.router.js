const express = require("express");
const router = express.Router();
const pendingTasksCrewModal = require("../models/pendingtasks_crew_model");

// This is now the single endpoint for fetching all pending task data.
router.get("/tasks-jobNo", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    // Extract filters from query parameters to pass to the model
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      exWarehouseLot: req.query.exWarehouseLot,
    };

    const result = await pendingTasksCrewModal.getPendingTasks(
      page,
      pageSize,
      filters
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching pending tasks:", error);
    res.status(500).json({ error: "Failed to fetch pending tasks." });
  }
});

// The following endpoints are no longer called by the frontend
router.post("/tasks-inbound", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksCrewModal.getDetailsPendingTasksCrew(
      jobNo
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching inbound details:", error);
    res.status(500).json({ error: "Failed to fetch pending tasks." });
  }
});

router.post("/tasks-user-single-date", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksCrewModal.pendingTasksUserIdSingleDateCrew(
      jobNo
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching user and date info:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
