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
  const { jobNo, lotNo, inboundDate } = req.body;

  if (!jobNo || !lotNo || !inboundDate) {
    return res.status(400).json({
      error: "jobNo, lotNo, and inboundDate are required.",
    });
  }

  try {
    // Check if lot exists
    const existingLot = await pendingTasksOfficeModel.getLotInboundDate(
      jobNo,
      lotNo
    );

    if (!existingLot) {
      return res.status(404).json({ error: "Lot not found" });
    }

    // Update the lot
    const result = await pendingTasksOfficeModel.updateLotInboundDate(
      jobNo,
      lotNo,
      inboundDate
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

// Get outbound dates for a specific lot
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

// Update outbound dates for a specific lot
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

module.exports = router;
