const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const usersModel = require("../models/users.model");
const db = require("../database");
const pendingTasksModel = require("../models/pending_tasks_model");
const pendingTasksOfficeModel = require("../models/pending_tasks_office.model");

const {
  setLastReadPendingTaskTime,
  getLastReadPendingTaskTime,
} = require("../models/pending_tasks_model");

// --- LOGGING CONFIG ---
const CONFIRM_LOGS_DIR = path.join(__dirname, "../logs/Confirmed Inbounds");
if (!fs.existsSync(CONFIRM_LOGS_DIR)) {
  fs.mkdirSync(CONFIRM_LOGS_DIR, { recursive: true });
}

const OFFICE_LOGS_DIR = path.join(__dirname, "../logs/Pending Task Office");
if (!fs.existsSync(OFFICE_LOGS_DIR)) {
  fs.mkdirSync(OFFICE_LOGS_DIR, { recursive: true });
}

// --- GLOBAL CACHE FOR LOG MERGING (The Fix) ---
// Key: lotId (Number/String), Value: { timeout: Timer, data: Object }
const pendingLogCache = new Map();

// --- HELPER: Generate Unique Filename ---
const generateUniqueFilename = (dir, jobNo) => {
  let filename = `${jobNo}.json`;
  let counter = 1;
  while (fs.existsSync(path.join(dir, filename))) {
    counter++;
    filename = `${jobNo}_${counter}.json`;
  }
  return path.join(dir, filename);
};

// --- HELPER: Create Log Entry (Generic) ---
const createGenericLogEntry = async (
  dir,
  jobNo,
  userId,
  actionType,
  summaryData,
  detailsData
) => {
  try {
    // 1. Fetch User Details
    let username = "Unknown";
    let userRole = "Unknown";
    try {
      if (userId && userId !== "N/A") {
        const userDetails = await usersModel.getUserById(userId);
        if (userDetails) {
          username = userDetails.username;
          userRole = userDetails.rolename;
        }
      }
    } catch (e) {
      console.error("Log User Fetch Error", e);
    }

    // 2. Prepare Log Content
    const timestamp = new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    });

    const fileContent = {
      header: {
        jobNo: jobNo,
        action: actionType,
        timestamp: timestamp,
        performedBy: {
          userId: userId || "N/A",
          username: username,
          userRole: userRole,
        },
      },
      summary: summaryData,
      details: detailsData,
    };

    // 3. Write File
    const filePath = generateUniqueFilename(dir, jobNo);
    fs.writeFile(filePath, JSON.stringify(fileContent, null, 2), (err) => {
      if (err) console.error(`Failed to write log for ${jobNo}:`, err);
      else console.log(`[LOG CREATED] ${filePath}`);
    });
  } catch (error) {
    console.error(`Error generating log for ${jobNo}:`, error);
  }
};

// Wrapper for Supervisor Logs
const createLogEntry = (jobNo, userId, action, summary, details) =>
  createGenericLogEntry(
    CONFIRM_LOGS_DIR,
    jobNo,
    userId,
    action,
    summary,
    details
  );

// Wrapper for Office Logs
const createOfficeLogEntry = (jobNo, userId, action, summary, details) =>
  createGenericLogEntry(
    OFFICE_LOGS_DIR,
    jobNo,
    userId,
    action,
    summary,
    details
  );

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
      return res.status(400).json({
        error: "jobNo, reportedBy, and discrepancyType are required.",
      });
    }

    if (!["lack", "extra"].includes(discrepancyType)) {
      return res
        .status(400)
        .json({ error: "Invalid discrepancyType. Must be 'lack' or 'extra'." });
    }

    const reportedCount = await pendingTasksModel.reportJobDiscrepancy(
      jobNo,
      reportedBy,
      discrepancyType
    );

    if (reportedCount > 0) {
      // [LOGGING ADDED]
      await createLogEntry(
        jobNo,
        reportedBy,
        "Report Discrepancy (Job Level)",
        {
          type: discrepancyType,
          lotsAffected: reportedCount,
        },
        "Entire job reported as having discrepancy (switched remaining lots to reported status)."
      );

      res.status(200).json({
        message: `Successfully reported discrepancy for ${reportedCount} lot(s) in job ${jobNo}.`,
      });
    } else {
      res.status(404).json({
        message: "No pending, unreported lots found for the specified job.",
      });
    }
  } catch (error) {
    console.error("[Router] Error in /report-job-discrepancy:", error);
    res.status(500).json({ error: "Failed to report job discrepancy." });
  }
});

router.post("/reverse-inbound/:inboundId", async (req, res) => {
  try {
    const { inboundId } = req.params;
    const userId = req.body.userId || (req.user ? req.user.userId : null);
    if (!inboundId) {
      return res.status(400).json({ error: "Inbound ID is required." });
    }

    const result = await pendingTasksModel.reverseInbound(
      parseInt(inboundId, 10)
    );

    // [LOGGING ADDED]
    if (result.success && result.jobNo) {
      await createLogEntry(
        result.jobNo,
        userId,
        "Reverse Inbound",
        { inboundId: inboundId },
        {
          reversedLot: result.exWarehouseLot,
          message:
            "User reversed an inbound task, resetting lot to Pending status.",
        }
      );
    }

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

    // Determine JobNo: Use DB value or fallback to 'SINOxxx' format if null
    const jobNoLog =
      updatedSchedule.outboundJobNo ||
      `SINO${String(scheduleOutboundId).padStart(3, "0")}`;

    await createOfficeLogEntry(
      jobNoLog,
      actorId,
      "Update Schedule Outbound",
      {
        containerNo: containerNo,
        sealNo: sealNo,
      },
      {
        scheduleOutboundId: scheduleOutboundId,
        message: "Container and Seal numbers updated.",
      }
    );
    // --- LOGGING END ---

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
    const { lotId, reportStatus, resolvedBy, expectedBundleCount } = req.body;

    if (!lotId || !reportStatus || !resolvedBy) {
      return res
        .status(400)
        .json({ error: "lotId, reportStatus, and resolvedBy are required" });
    }

    // [FIX]: Force lotId to string for cache lookup
    const cacheKey = String(lotId);
    let quantityUpdateInfo = null;

    // 1. CHECK CACHE with the corrected key
    if (pendingLogCache.has(cacheKey)) {
      const cached = pendingLogCache.get(cacheKey);

      // Stop the standalone log timer
      clearTimeout(cached.timeout);

      quantityUpdateInfo = {
        previousQuantity: cached.data.previousQuantity,
        newQuantity: cached.data.newQuantity,
        message: `Bundle count changed from ${cached.data.previousQuantity} to ${cached.data.newQuantity}`,
      };

      pendingLogCache.delete(cacheKey);
    }

    // 2. Handle Explicit Quantity Update (fallback)
    if (expectedBundleCount !== undefined && expectedBundleCount !== null) {
      const qtyResult =
        await pendingTasksOfficeModel.pendingTasksUpdateQuantity(
          lotId,
          expectedBundleCount
        );

      if (qtyResult) {
        quantityUpdateInfo = {
          previousQuantity: qtyResult.previousBundleCount,
          newQuantity: expectedBundleCount,
          message: `Bundle count updated from ${qtyResult.previousBundleCount} to ${expectedBundleCount}`,
        };
      }
    }

    // 3. Update Report Status
    const updatedReports = await pendingTasksOfficeModel.updateReportStatus({
      lotId,
      reportStatus,
      resolvedBy,
    });

    // 4. GENERATE MERGED LOG
    (async () => {
      try {
        const lotInfo = await db.sequelize.query(
          `SELECT "jobNo", "lotNo" FROM public.lot WHERE "lotId" = :lotId`,
          {
            replacements: { lotId },
            type: db.sequelize.QueryTypes.SELECT,
            plain: true,
          }
        );

        if (lotInfo) {
          const logAction = quantityUpdateInfo
            ? "Resolve Lot Discrepancy"
            : "Resolve Lot Discrepancy";

          const logSummary = {
            status: reportStatus,
            quantityChanged: !!quantityUpdateInfo,
          };

          if (quantityUpdateInfo) {
            logSummary.previousQuantity = quantityUpdateInfo.previousQuantity;
            logSummary.newQuantity = quantityUpdateInfo.newQuantity;
          }

          const logDetails = {
            lotNo: lotInfo.lotNo,
            lotId: lotId,
            resolution: reportStatus,
            message: quantityUpdateInfo
              ? `${quantityUpdateInfo.message} and ${reportStatus}`
              : `Report ${reportStatus}`,
          };

          await createOfficeLogEntry(
            lotInfo.jobNo,
            resolvedBy,
            logAction,
            logSummary,
            logDetails
          );
        }
      } catch (e) {
        console.error("Log error acknowledge-report", e);
      }
    })();

    res.status(200).json({
      message: `Report ${reportStatus} successfully${
        quantityUpdateInfo ? " and quantity updated" : ""
      }.`,
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

    // [LOGGING ADDED]
    (async () => {
      try {
        const lotInfo = await db.sequelize.query(
          `SELECT "jobNo", "lotNo" FROM public.lot WHERE "lotId" = :lotId`,
          {
            replacements: { lotId },
            type: db.sequelize.QueryTypes.SELECT,
            plain: true,
          }
        );

        if (lotInfo) {
          await createOfficeLogEntry(
            lotInfo.jobNo,
            resolvedBy,
            "Resolve Duplicate Report",
            { status: reportStatus },
            { lotNo: lotInfo.lotNo, lotId: lotId }
          );
        }
      } catch (e) {
        console.error("Log error acknowledge-duplicated", e);
      }
    })();

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

    const result = await pendingTasksOfficeModel.getReportSupervisorUsername(
      lotId
    );
    if (!result)
      return res.status(404).json({ error: "No report found for this lotId" });

    res.status(200).json({ username: result.username });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/duplicate-report/:lotId", async (req, res) => {
  try {
    const lotId = parseInt(req.params.lotId);
    if (!lotId)
      return res.status(400).json({ error: "Valid lotId is required" });

    const result = await pendingTasksOfficeModel.getDuplicateReportUsername(
      lotId
    );
    if (!result)
      return res.status(404).json({ error: "No duplicate report found" });

    res.status(200).json({ username: result.username });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/quantity/update", async (req, res) => {
  const { lotId, expectedBundleCount, userId } = req.body;
  const actorId = userId || (req.user ? req.user.userId : "N/A");

  // [FIX]: Force lotId to string to ensure cache key matches the other route
  const cacheKey = String(lotId);

  try {
    const result = await pendingTasksOfficeModel.pendingTasksUpdateQuantity(
      lotId,
      expectedBundleCount
    );

    if (result && result.jobNo) {
      // Clear existing timeout if multiple updates happen quickly
      if (pendingLogCache.has(cacheKey)) {
        clearTimeout(pendingLogCache.get(cacheKey).timeout);
      }

      const logData = {
        previousQuantity: result.previousBundleCount,
        newQuantity: expectedBundleCount,
        jobNo: result.jobNo,
        lotNo: result.lotNo,
        userId: actorId,
      };

      const timeout = setTimeout(() => {
        // Fallback log if no merge happens
        createOfficeLogEntry(
          result.jobNo,
          actorId,
          "Update Bundle Quantity",
          {
            previousQuantity: result.previousBundleCount,
            newQuantity: expectedBundleCount,
          },
          {
            lotNo: result.lotNo,
            lotId: lotId,
            message: `Bundle count changed from ${result.previousBundleCount} to ${expectedBundleCount}`,
          }
        );
        pendingLogCache.delete(cacheKey);
      }, 2000); // 2 second buffer

      // Use the string key
      pendingLogCache.set(cacheKey, { timeout, data: logData });
    }

    res.status(200).json(result.updatedRecord);
  } catch (error) {
    console.error("Error in quantity update route:", error);
    res.status(500).json({ error: "Failed to update quantity." });
  }
});

router.post("/lot-inbound/get", async (req, res) => {
  const { jobNo, exWLot } = req.body;
  if (!jobNo || !exWLot)
    return res.status(400).json({ error: "Missing fields" });
  try {
    const result = await pendingTasksOfficeModel.getLotInboundDate(
      jobNo,
      exWLot
    );
    if (!result) return res.status(404).json({ error: "Lot not found" });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch lot inbound date." });
  }
});

router.post("/lot-inbound/update", async (req, res) => {
  const { jobNo, exWarehouseLot, inboundDate, userId } = req.body;
  if (!jobNo || !exWarehouseLot || !inboundDate || !userId) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    const result = await pendingTasksOfficeModel.updateLotInboundDate(
      jobNo,
      exWarehouseLot,
      inboundDate,
      userId
    );

    // [LOGGING ADDED]
    await createOfficeLogEntry(
      jobNo,
      userId,
      "Update Inbound Date",
      { newDate: inboundDate },
      { exWarehouseLot: exWarehouseLot }
    );

    res
      .status(200)
      .json({ success: true, message: "Updated successfully", data: result });
  } catch (error) {
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
  try {
    const result = await pendingTasksOfficeModel.getLotOutboundDates(
      jobNo,
      lotNo
    );
    if (!result) return res.status(404).json({ error: "Lot not found" });
    res.status(200).json(result);
  } catch (error) {
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
    userId,
  } = req.body;
  // NOTE: Assuming userId is passed for logging purposes, otherwise grab from req.user
  const actorId = userId || (req.user ? req.user.userId : null);

  if (!jobNo || !lotNo)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const result = await pendingTasksOfficeModel.updateLotOutboundDates(
      jobNo,
      lotNo,
      releaseDate,
      releaseEndDate,
      exportDate,
      deliveryDate
    );

    // [LOGGING ADDED]
    await createOfficeLogEntry(
      jobNo,
      actorId,
      "Update Outbound Dates",
      { releaseDate, releaseEndDate, exportDate, deliveryDate },
      { lotNo: lotNo }
    );

    res
      .status(200)
      .json({ success: true, message: "Updated successfully", data: result });
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
    if (!jobNo || !status || !resolvedBy)
      return res.status(400).json({ error: "Missing fields" });
    const result = await pendingTasksOfficeModel.updateJobReportStatus({
      jobNo,
      status,
      resolvedBy,
    });

    // [LOGGING ADDED]
    await createOfficeLogEntry(
      jobNo,
      resolvedBy,
      "Resolve Job Discrepancy",
      { status: status },
      "User acted on job discrepancy report."
    );

    res
      .status(200)
      .json({ message: "Job report status updated.", data: result });
  } catch (error) {
    res.status(500).json({ error: "Failed to update job report status." });
  }
});

router.post("/finalize-job-report", async (req, res) => {
  try {
    const { jobNo, deletedLotIds, resolvedBy } = req.body;
    if (!jobNo || !deletedLotIds || resolvedBy === undefined)
      return res.status(400).json({ error: "Missing fields" });
    await pendingTasksOfficeModel.finalizeJobReport({
      jobNo,
      deletedLotIds,
      resolvedBy,
    });

    // [LOGGING ADDED]
    await createOfficeLogEntry(
      jobNo,
      resolvedBy,
      "Finalize Job Report",
      { lotsDeleted: deletedLotIds.length },
      { deletedLotIds: deletedLotIds }
    );

    res.status(200).json({ message: "Job report finalized successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to finalize job report." });
  }
});

router.delete("/lot/:lotId", async (req, res) => {
  try {
    const { lotId } = req.params;
    const userId = req.user ? req.user.userId : null;
    const deletedLot = await pendingTasksOfficeModel.deleteLot(parseInt(lotId));

    if (deletedLot) {
      // [LOGGING ADDED]
      await createOfficeLogEntry(
        deletedLot.jobNo,
        userId,
        "Delete Lot",
        { lotId: lotId },
        {
          lotNo: deletedLot.lotNo,
          exWarehouseLot: deletedLot.exWarehouseLot,
          message: "Lot permanently deleted.",
        }
      );
      res.status(200).json({ message: "Lot deleted successfully." });
    } else {
      res.status(404).json({ message: "Lot not found." });
    }
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
router.post("/pending-tasks/read", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    // [FIXED] Use standard UTC NOW()
    const query = `
      INSERT INTO public.user_pending_task_status ("userId", "lastReadTime")
      VALUES (:userId, NOW())
      ON CONFLICT ("userId") 
      DO UPDATE SET "lastReadTime" = NOW();
    `;

    await require("../database").sequelize.query(query, {
      replacements: { userId },
      type: require("sequelize").QueryTypes.INSERT,
    });

    res.status(200).json({ message: "Pending task read status updated (UTC)" });
  } catch (error) {
    console.error("[PendingRouter] ERROR updating read status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pending-tasks/read-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const lastReadTime = await getLastReadPendingTaskTime(userId);
    res.status(200).json({ lastReadTime });
  } catch (error) {
    console.error("[PendingRouter] ERROR fetching read status:", error);
    res.status(500).json({ error: "Internal server error" });
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
    const result = await pendingTasksModel.finalizeInboundJob(
      jobNo,
      userId,
      filters || {}
    );

    // [LOGGING ADDED]
    await createLogEntry(
      jobNo,
      userId,
      "Finalize Job (Confirm Finish)",
      {
        status: "Completed",
        lotsAutoConfirmed: result.updatedCount || 0,
      },
      "User clicked 'YES' to confirm finish. Remaining pending lots visible in the current filter were auto-confirmed."
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error finalizing job:", error);
    res.status(500).json({ error: "Failed to finalize job." });
  }
});
module.exports = router;
