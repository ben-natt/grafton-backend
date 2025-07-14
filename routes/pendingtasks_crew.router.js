const express = require("express");
const router = express.Router();
const pendingTasksCrewModal = require("../models/pendingtasks_crew_model");

router.get("/tasks-jobNo", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const { totalCount, data } = await pendingTasksCrewModal.findJobNoPendingTasksCrew(
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
    const result = await pendingTasksCrewModal.getDetailsPendingTasksCrew(jobNo);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch pending tasks." });
  }
});

router.post("/tasks-user-single-date", async (req, res) => {
  const { jobNo } = req.body;
  try {
    const result = await pendingTasksCrewModal.pendingTasksUserIdSingleDateCrew(jobNo);
    res.status(200).json(result); // Send single object (or null)
  } catch (error) {
    console.error("Error fetching stock records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


module.exports = router;
