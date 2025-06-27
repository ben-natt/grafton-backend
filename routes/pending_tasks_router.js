const express = require("express");
const router = express.Router();
const pendingTasksModel = require("../models/pending_tasks_model");

// --- INBOUND ROUTES---
router.get('/tasks-jobNo', async (req, res) => {
    try {
        const result = await pendingTasksModel.findJobNoPendingTasks();
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending tasks.' });
    }
});


router.post('/tasks-inbound', async (req, res) => {
    const { jobNo } = req.body;
    try {
        const result = await pendingTasksModel.getDetailsPendingTasks(jobNo);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending tasks.' });
    }
});


router.post('/tasks-user', async (req, res) => {
    const { jobNo } = req.body;
    try {
        const result = await pendingTasksModel.pendingTasksUserId(jobNo);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching stock records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


router.post('/tasks-user-single-date', async (req, res) => {
    const { jobNo } = req.body;
    try {
        const result = await pendingTasksModel.pendingTasksUserIdSingleDate(jobNo);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching stock records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// OFFICE VERSION
router.post('/acknowledge-report', async (req, res) => {
  try {
    const { lotId } = req.body;

    if (!lotId) {
      return res.status(400).json({ error: 'lotId is required' });
    }
    const updatedLots = await pendingTasksModel.updateReportStatus(lotId);
    if (!updatedLots || updatedLots.length === 0) {
      return res.status(404).json({ error: 'Lot not found or already updated' });
    }
    res.status(200).json({
      message: 'Lot report status updated successfully.',
      updatedLot: updatedLots[0],
    });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tasks-inbound/sortReport', async (req, res) => {
    const { jobNo } = req.body;
    try {
        const result = await pendingTasksModel.getDetailsPendingTasksOrderByReport(jobNo);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending tasks.' });
    }
});

router.post('/quantity/update', async (req, res) => {
    const { lotId, expectedBundleCount } = req.body; // changed from jobNo to lotId
    try {
        const result = await pendingTasksModel.pendingTasksUpdateQuantity(lotId, expectedBundleCount);
        res.status(200).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update quantity.' });
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


// OFFICE VERSION
router.post('/tasks-outbound-office', async (req, res) => {
    const { jobNo } = req.body;
    try {
        const result = await pendingTasksModel.getDetailsPendingOutboundOffice(jobNo);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending tasks.' });
    }
});

router.post('/tasks-outbound-single-date-user', async (req, res) => {
    const { jobNo } = req.body;
    try {
        const result = await pendingTasksModel.pendingOutboundTasksUserIdSingleDate(jobNo);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching stock records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});




module.exports = router;
