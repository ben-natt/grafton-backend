const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const db = require("../database");

// Models
const pendingTasksModel = require("../models/pending_tasks_model");
const confirmInboundModel = require("../models/confirm_inbound_model"); // Added this import
const grnModel = require("../models/grn.model");
const actualWeightModel = require("../models/actualWeight.model");

const {
  InboundBundle,
  BundlePieces,
  BeforeImage,
  AfterImage,
} = require("../models/repack.model");

// Helper to save images
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

  const filename = `${type}-${uuidv4()}.jpg`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, buffer);
  return `uploads/img/repacked/${jobNo}-${lotNo}-${bundleNo}/${filename}`;
};

exports.handleSync = async (req, res) => {
  const { jobs } = req.body;
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: "No sync jobs provided." });
  }

  console.log(`[Sync] Received ${jobs.length} jobs to process.`);
  const t = await db.sequelize.transaction();
  const results = [];

  try {
    for (const job of jobs) {
      let payload;
      try {
        // Handle both stringified JSON and pre-parsed objects
        payload =
          typeof job.payload === "string"
            ? JSON.parse(job.payload)
            : job.payload;
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
        continue;
      }

      console.log(`[Sync] Processing job ${job.id} of type ${job.action_type}`);

      switch (job.action_type) {
        case "CONFIRM_INBOUND": {
          const { selectedLots, userId } = payload;
          if (!selectedLots || selectedLots.length === 0) {
            console.warn(`[Sync] CONFIRM_INBOUND skipped: No lots provided.`);
            results.push({ jobId: job.id, status: "SKIPPED" });
            continue;
          }

          // Use the robust model function we updated
          const inserted = await confirmInboundModel.insertInboundFromLots(
            selectedLots,
            userId,
            { transaction: t }
          );

          results.push({
            jobId: job.id,
            status: "OK",
            processed: inserted.length,
          });
          break;
        }

        case "REPORT_DISCREPANCY": {
          const { lotIds, reportedBy } = payload;
          // Use the robust model function
          const reports = await confirmInboundModel.reportConfirmation(
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

        case "REPORT_JOB_DISCREPANCY": {
          const { jobNo, reportedBy, discrepancyType } = payload;
          const reportCount = await pendingTasksModel.reportJobDiscrepancy(
            jobNo,
            reportedBy,
            discrepancyType,
            { transaction: t }
          );
          results.push({ jobId: job.id, status: "OK", processed: reportCount });
          break;
        }

        case "UPDATE_GRN": {
          const outboundId = parseInt(job.target_id, 10);
          await grnModel.updateAndRegenerateGrn(outboundId, payload, {
            transaction: t,
          });
          results.push({ jobId: job.id, status: "OK" });
          break;
        }

        case "UPDATE_CREW_LOT_NO": {
          const { inboundId, lotId, crewLotNo, jobNo, exWarehouseLot } =
            payload;
          let targetInboundId = inboundId;
          let targetLotId = lotId;

          // Attempt to resolve ID if missing
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

          if (targetInboundId) {
            await actualWeightModel.updateCrewLotNo(
              targetInboundId,
              true,
              crewLotNo,
              t
            );
          } else if (targetLotId) {
            await actualWeightModel.updateCrewLotNo(
              targetLotId,
              false,
              crewLotNo,
              t
            );
          }
          results.push({ jobId: job.id, status: "OK" });
          break;
        }

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

          // Similar ID resolution logic
          let resolvedInboundId = inboundId;
          let resolvedLotId = lotId;

          if (!resolvedInboundId && !resolvedLotId && jobNo && exWarehouseLot) {
            const related =
              await actualWeightModel.findRelatedIdByExWarehouseLot(
                jobNo,
                exWarehouseLot
              );
            if (related) {
              resolvedInboundId = related.inboundId;
              resolvedLotId = related.lotId;
            }
          }

          if (resolvedInboundId) {
            await actualWeightModel.saveInboundWithBundles(
              resolvedInboundId,
              actualWeight,
              bundles,
              strictValidation,
              null,
              null,
              t
            );
          } else if (resolvedLotId) {
            await actualWeightModel.saveLotWithBundles(
              resolvedLotId,
              actualWeight,
              bundles,
              strictValidation,
              null,
              null,
              t
            );
          } else if (jobNo && lotNo) {
            // Fallback legacy lookup
            const foundInbound = await actualWeightModel.findRelatedId(
              null,
              false,
              jobNo,
              lotNo
            );
            if (foundInbound) {
              await actualWeightModel.saveInboundWithBundles(
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
                await actualWeightModel.saveLotWithBundles(
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

          let targetInboundId = inboundId;
          let targetLotId = lotId;

          let bundle = await InboundBundle.findOne({
            where: {
              bundleNo: noOfBundle,
              [Op.or]: [
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

          // Update pieces
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

          // Save images
          if (isRepackProvided) {
            if (newBeforeImagesBase64?.length) {
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
            if (newAfterImagesBase64?.length) {
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
          }
          results.push({ jobId: job.id, status: "OK" });
          break;
        }

        default:
          console.warn(`[Sync] Unknown action_type: ${job.action_type}`);
          results.push({ jobId: job.id, status: "SKIPPED" });
      }
    }

    await t.commit();
    console.log("[Sync] Batch processed successfully.");
    res.status(200).json({ message: "Sync successful", results });
  } catch (error) {
    await t.rollback();
    console.error("[Sync] Error during sync batch. Rolling back.", error);
    res
      .status(500)
      .json({ error: "Failed to process sync batch.", message: error.message });
  }
};
