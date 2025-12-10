const express = require("express");
const router = express.Router();
const pendingTasksCrewModal = require("../models/pendingtasks_crew_model");

// This is now the single endpoint for fetching all pending task data.
router.get("/tasks-jobNo", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      exWarehouseLot: req.query.exWarehouseLot,
    };

    const result = await pendingTasksCrewModal.getPendingTasksWithIncompleteStatus(
      page,
      pageSize,
      filters
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching pending tasks with incomplete status:", error);
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

router.get("/status", async (req, res) => {
  try {
    // [FIX] Extract userId from query parameters
    const userId = req.query.userId; 
    
    // [FIX] Pass userId to the model function
    const result = await pendingTasksCrewModal.getCrewPendingStatus(userId);
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching crew pending status:", error);
    res.status(500).json({ error: "Failed to fetch status." });
  }
});

router.post("/read", async (req, res) => {
  try {
    // [FIX] Accept readTime from body
    const { userId, readTime } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "UserId is required" });
    }

    // Pass explicit readTime
    const result = await pendingTasksCrewModal.updateCrewReadStatus(userId, readTime);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error marking tasks as read:", error);
    res.status(500).json({ error: "Failed to update read status." });
  }
});


module.exports = router;
