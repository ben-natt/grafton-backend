const db = require("../database");
const pendingTasksModel = require("../models/pending_tasks_model");
const confirmInboundLogic = require("../models/confirm_inbound_model");
const grnModel = require("../models/grn.model");

// This is the new function that will process the batch
exports.handleSync = async (req, res) => {
  const { jobs } = req.body;
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: "No sync jobs provided." });
  }

  console.log(`[Sync] Received ${jobs.length} jobs to process.`);

  // Start a single database transaction for the entire batch
  const t = await db.sequelize.transaction();
  const results = [];

  try {
    // Process each job sequentially inside the transaction
    for (const job of jobs) {
      // Add error handling for individual job parsing
      let payload;
      try {
        payload = JSON.parse(job.payload);
      } catch (parseError) {
        console.error(
          `[Sync] Failed to parse payload for job ${job.id}`,
          parseError
        );
        results.push({
          jobId: job.id,
          status: "FAILED",
          error: "Invalid JSON payload",
        });
        continue; // Skip this job
      }

      console.log(`[Sync] Processing job ${job.id} of type ${job.action_type}`);

      switch (job.action_type) {
        case "REPORT_JOB_DISCREPANCY": {
          // Use block scope
          const { jobNo, reportedBy, discrepancyType } = payload;
          const reportCount = await pendingTasksModel.reportJobDiscrepancy(
            jobNo,
            reportedBy,
            discrepancyType,
            { transaction: t } // <-- Pass the transaction
          );
          results.push({ jobId: job.id, status: "OK", processed: reportCount });
          break;
        }

        // --- THIS IS THE UPDATED BLOCK ---
        case "CONFIRM_INBOUND": {
          // Use block scope
          const { selectedLots, userId } = payload;

          // Call your real, refactored model function
          const insertedInbounds =
            await confirmInboundLogic.insertInboundFromLots(
              selectedLots,
              userId,
              { transaction: t } // <-- Pass the master transaction
            );

          results.push({
            jobId: job.id,
            status: "OK",
            processed: insertedInbounds.length,
          });
          break;
        }
        // --- END OF UPDATE ---

        // You can add more cases here for other offline actions
        // For example, "REPORT_DISCREPANCY" (from the dialog)
        case "REPORT_DISCREPANCY": {
          // Assumed action_type from other button
          const { lotIds, reportedBy } = payload;
          const reports = await confirmInboundLogic.reportConfirmation(
            lotIds,
            reportedBy,
            { transaction: t }
          );
          results.push({
            jobId: job.id,
            status: "OK",
            processed: reports.length,
          });
          break;
        }

        case "UPDATE_GRN": {
          const outboundId = parseInt(job.target_id, 10);
          if (isNaN(outboundId)) {
            throw new Error(`Invalid outboundId: ${job.target_id}`);
          }
          const updateData = payload; // payload is already parsed JSON

          console.log(`[Sync] Processing UPDATE_GRN for ${outboundId}`);

          // Call the refactored model function, passing the transaction
          await grnModel.updateAndRegenerateGrn(outboundId, updateData, {
            transaction: t,
          });

          results.push({ jobId: job.id, status: "OK" });
          break;
        }

        default:
          console.warn(`[Sync] Unknown action_type: ${job.action_type}`);
          results.push({ jobId: job.id, status: "SKIPPED" });
      }
    }

    // If all jobs processed without throwing an error, commit the transaction
    await t.commit();
    console.log("[Sync] Batch processed successfully. Committing transaction.");
    res.status(200).json({
      message: "Sync successful",
      results: results,
    });
  } catch (error) {
    // If any job fails, rollback the entire batch
    await t.rollback();
    console.error(
      "[Sync] Error during sync batch. Rolling back transaction.",
      error
    );
    res.status(500).json({
      error: "Failed to process sync batch.",
      message: error.message,
      failedJobId: error.jobId || null,
    });
  }
};
