const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const db = require("../database");
const pendingTasksModel = require("../models/pending_tasks_model");
const confirmInboundLogic = require("../models/confirm_inbound_model");
const grnModel = require("../models/grn.model");
const actualWeightModel = require("../models/actualWeight.model");

const saveBase64Image = (base64String, jobNo, lotNo, bundleNo, type) => {
  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  const buffer = matches
    ? Buffer.from(matches[2], "base64")
    : Buffer.from(base64String, "base64");

  const dir = path.join(
    __dirname,
    `../uploads/img/repacked/${jobNo}-${lotNo}-${bundleNo}`
  );
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename = `${type}-${uuidv4()}.jpg`; // Assuming jpg for simplicity or extract ext
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, buffer);
  return `uploads/img/repacked/${jobNo}-${lotNo}-${bundleNo}/${filename}`;
};

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

        case "UPDATE_CREW_LOT_NO": {
          const { inboundId, lotId, crewLotNo, jobNo, exWarehouseLot } =
            payload;

          // Try to find ID if missing using stable identifiers (jobNo + exWarehouseLot)
          let targetInboundId = inboundId;
          let targetLotId = lotId;

          if (!targetInboundId && !targetLotId && jobNo && exWarehouseLot) {
            const related =
              await actualWeightModel.findRelatedIdByExWarehouseLot(
                jobNo,
                exWarehouseLot
              );
            if (related) {
              if (related.inboundId) targetInboundId = related.inboundId;
              else if (related.lotId) targetLotId = related.lotId;
            }
          }

          let updateResult = null;
          if (targetInboundId) {
            updateResult = await actualWeightModel.updateCrewLotNo(
              targetInboundId,
              true,
              crewLotNo,
              t
            );
          } else if (targetLotId) {
            updateResult = await actualWeightModel.updateCrewLotNo(
              targetLotId,
              false,
              crewLotNo,
              t
            );
          } else {
            // Fallback: if we can't resolve IDs but have jobNo and old lotNo?
            // No, lotNo changed. We depend on exWarehouseLot.
            throw new Error("Could not resolve Inbound/Lot ID for lot update");
          }
          results.push({ jobId: job.id, status: "OK" });
          break;
        }

        // --- UPDATED CASE: SAVE ACTUAL WEIGHT ---
        case "SAVE_ACTUAL_WEIGHT": {
          const {
            inboundId,
            lotId,
            jobNo,
            lotNo,
            actualWeight,
            bundles,
            strictValidation,
            exWarehouseLot,
          } = payload;

          let result;
          if (inboundId) {
            result = await actualWeightModel.saveInboundWithBundles(
              inboundId,
              actualWeight,
              bundles,
              strictValidation,
              null,
              null,
              t
            );
          } else if (lotId) {
            result = await actualWeightModel.saveLotWithBundles(
              lotId,
              actualWeight,
              bundles,
              strictValidation,
              null,
              null,
              t
            );
          } else {
            // 1. Try lookup by ExWarehouseLot (Stable)
            if (jobNo && exWarehouseLot) {
              const related =
                await actualWeightModel.findRelatedIdByExWarehouseLot(
                  jobNo,
                  exWarehouseLot
                );
              if (related) {
                if (related.inboundId) {
                  result = await actualWeightModel.saveInboundWithBundles(
                    related.inboundId,
                    actualWeight,
                    bundles,
                    strictValidation,
                    jobNo,
                    null,
                    t
                  );
                } else if (related.lotId) {
                  result = await actualWeightModel.saveLotWithBundles(
                    related.lotId,
                    actualWeight,
                    bundles,
                    strictValidation,
                    jobNo,
                    null,
                    t
                  );
                }
              }
            }

            // 2. If still not found, try old method (JobNo + LotNo)
            if (!result && jobNo && lotNo) {
              const foundInbound = await actualWeightModel.findRelatedId(
                null,
                false,
                jobNo,
                lotNo
              );
              if (foundInbound) {
                result = await actualWeightModel.saveInboundWithBundles(
                  foundInbound,
                  actualWeight,
                  bundles,
                  strictValidation,
                  jobNo,
                  lotNo,
                  t
                );
              } else {
                const foundLot = await actualWeightModel.findRelatedId(
                  null,
                  true,
                  jobNo,
                  lotNo
                );
                if (foundLot) {
                  result = await actualWeightModel.saveLotWithBundles(
                    foundLot,
                    actualWeight,
                    bundles,
                    strictValidation,
                    jobNo,
                    lotNo,
                    t
                  );
                }
              }
            }

            if (!result)
              throw new Error("Could not resolve Inbound/Lot ID for sync save");
          }
          results.push({ jobId: job.id, status: "OK" });
          break;
        }

        case "SAVE_BUNDLE_REPACK": {
          const {
            inboundId,
            lotId,
            jobNo,
            lotNo,
            noOfBundle,
            isRelabelled,
            isRebundled,
            isRepackProvided,
            noOfMetalStrap,
            repackDescription,
            incompleteBundle,
            noOfPieces,
            pieceEntries,
            newBeforeImagesBase64,
            newAfterImagesBase64,
          } = payload;

          console.log(
            `[Sync] Processing Repack for Job ${jobNo} Lot ${lotNo} Bundle ${noOfBundle}`
          );

          // 1. Find or Create Bundle (Reuse logic from repack.router.js via Model if possible, or raw sequelize here)
          // For brevity, assuming we use the models directly imported
          // You might need to import { InboundBundle, BeforeImage, AfterImage, ... } from repack.model

          // ... resolution of ID logic (inbound vs lot) same as router ...
          let targetInboundId = inboundId;
          let targetLotId = lotId;

          // (Insert ID resolution logic here if IDs are null but job/lot provided)

          // Find existing bundle
          let bundle = await InboundBundle.findOne({
            where: {
              bundleNo: noOfBundle,
              [db.Sequelize.Op.or]: [
                { inboundId: targetInboundId || -1 },
                { lotId: targetLotId || -1 },
              ],
            },
            transaction: t,
          });

          if (!bundle) {
            bundle = await InboundBundle.create(
              {
                inboundId: targetInboundId,
                lotId: targetLotId,
                bundleNo: noOfBundle,
                isRelabelled,
                isRebundled,
                isRepackProvided,
                noOfMetalStrap,
                repackDescription,
                incompleteBundle,
                noOfPieces,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              { transaction: t }
            );
          } else {
            await bundle.update(
              {
                isRelabelled,
                isRebundled,
                isRepackProvided,
                noOfMetalStrap,
                repackDescription,
                incompleteBundle,
                noOfPieces,
                updatedAt: new Date(),
              },
              { transaction: t }
            );
          }

          // 2. Handle Bundle Pieces
          if (pieceEntries && Array.isArray(pieceEntries)) {
            await BundlePieces.destroy({
              where: { bundleid: bundle.inboundBundleId },
              transaction: t,
            });
            const piecesToCreate = pieceEntries.map((p) => ({
              bundleid: bundle.inboundBundleId,
              piecetype: p.type,
              quantity: p.quantity,
            }));
            await BundlePieces.bulkCreate(piecesToCreate, { transaction: t });
          }

          // 3. Handle Images (Write Base64 to disk)
          if (
            isRepackProvided &&
            newBeforeImagesBase64 &&
            newBeforeImagesBase64.length > 0
          ) {
            for (const img of newBeforeImagesBase64) {
              const dbPath = saveBase64Image(
                img.data,
                jobNo,
                lotNo,
                noOfBundle,
                "before"
              );
              await BeforeImage.create(
                {
                  inboundId: targetInboundId,
                  lotId: targetLotId,
                  inboundBundleId: bundle.inboundBundleId,
                  imageUrl: dbPath,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
                { transaction: t }
              );
            }
          }

          if (
            isRepackProvided &&
            newAfterImagesBase64 &&
            newAfterImagesBase64.length > 0
          ) {
            for (const img of newAfterImagesBase64) {
              const dbPath = saveBase64Image(
                img.data,
                jobNo,
                lotNo,
                noOfBundle,
                "after"
              );
              await AfterImage.create(
                {
                  inboundId: targetInboundId,
                  lotId: targetLotId,
                  inboundBundleId: bundle.inboundBundleId,
                  imageUrl: dbPath,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
                { transaction: t }
              );
            }
          }

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
