const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const db = require("../database");

// Models
const pendingTasksModel = require("../models/pending_tasks_model");
const confirmInboundModel = require("../models/confirm_inbound_model");
const grnModel = require("../models/grn.model");
const actualWeightModel = require("../models/actualWeight.model");
const usersModel = require("../models/users.model"); // Required for Logging

const {
  InboundBundle,
  BundlePieces,
  BeforeImage,
  AfterImage,
} = require("../models/repack.model");

// --- LOGGING SETUP START ---
const CONFIRM_LOGS_DIR = path.join(__dirname, "../logs/Confirmed Inbounds");
if (!fs.existsSync(CONFIRM_LOGS_DIR)) {
  fs.mkdirSync(CONFIRM_LOGS_DIR, { recursive: true });
}

const generateUniqueFilename = (dir, jobNo) => {
  let filename = `${jobNo}.json`;
  let counter = 1;
  while (fs.existsSync(path.join(dir, filename))) {
    counter++;
    filename = `${jobNo}_${counter}.json`;
  }
  return path.join(dir, filename);
};

const createLogEntry = async (
  jobNo,
  userId,
  actionType,
  summaryData,
  detailsData,
) => {
  try {
    let username = "Unknown";
    let userRole = "Unknown";
    try {
      // Ensure usersModel has getUserById or similar
      const userDetails = await usersModel.getUserById(userId);
      if (userDetails) {
        username = userDetails.username;
        userRole = userDetails.rolename;
      }
    } catch (e) {
      console.warn("Log User Fetch Warning:", e.message);
    }

    const timestamp = new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    });

    const fileContent = {
      header: {
        jobNo: jobNo,
        action: actionType,
        timestamp: timestamp,
        performedBy: {
          userId: userId,
          username: username,
          userRole: userRole,
        },
      },
      summary: summaryData,
      details: detailsData,
    };

    const filePath = generateUniqueFilename(CONFIRM_LOGS_DIR, jobNo);
    fs.writeFile(filePath, JSON.stringify(fileContent, null, 2), (err) => {
      if (err) console.error(`Failed to write log for ${jobNo}:`, err);
      else console.log(`[LOG CREATED] ${filePath}`);
    });
  } catch (error) {
    console.error(`Error generating log for ${jobNo}:`, error);
  }
};
// --- LOGGING SETUP END ---

// Helper to save images
const saveBase64Image = (base64String, jobNo, lotNo, bundleNo, type) => {
  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  const buffer = matches
    ? Buffer.from(matches[2], "base64")
    : Buffer.from(base64String, "base64");

  const dir = path.join(
    __dirname,
    `../uploads/img/repacked/${jobNo}-${lotNo}-${bundleNo}`,
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

  // We do NOT use a global transaction 't' here anymore.
  // We process per job to ensure valid jobs succeed even if one fails (Queue Safety).

  const results = [];

  for (const job of jobs) {
    // Isolated Transaction per Job
    const t = await db.sequelize.transaction();

    try {
      let payload;
      try {
        payload =
          typeof job.payload === "string"
            ? JSON.parse(job.payload)
            : job.payload;
      } catch (parseError) {
        console.error(`[Sync] Payload Parse Error Job ${job.id}`, parseError);
        results.push({
          jobId: job.id,
          status: "FAILED",
          error: "Invalid JSON",
        });
        await t.rollback();
        continue;
      }

      console.log(`[Sync] Processing job ${job.id} type ${job.action_type}`);

      switch (job.action_type) {
        case "CONFIRM_INBOUND": {
          const { selectedLots, userId } = payload;
          if (!selectedLots || selectedLots.length === 0) {
            results.push({ jobId: job.id, status: "SKIPPED" });
            await t.commit();
            continue;
          }

          const inserted = await confirmInboundModel.insertInboundFromLots(
            selectedLots,
            userId,
            { transaction: t },
          );

          // Commit DB Change first
          await t.commit();

          // --- LOGGING LOGIC (Post-Commit) ---
          // Group by JobNo to creating meaningful logs
          const jobsMap = {};
          selectedLots.forEach((lot) => {
            // Ensure we handle case where jobNo might be missing in older payloads
            const jNo = lot.jobNo || "Unknown";
            if (!jobsMap[jNo]) jobsMap[jNo] = { jobNo: jNo, lots: [] };
            jobsMap[jNo].lots.push(lot);
          });

          // Generate one log per Job No found in the batch
          for (const jobNo in jobsMap) {
            const jobData = jobsMap[jobNo];

            // Calculate weights if available in payload (or fetch if critical, but payload usually has it)
            let totalGross = 0;
            let totalNet = 0;

            const lotsDetailed = jobData.lots.map((l) => {
              const g = parseFloat(l.grossWeight || 0);
              const n = parseFloat(l.netWeight || 0);
              totalGross += g;
              totalNet += n;
              return {
                lotId: l.lotId,
                lotNo: l.lotNo,
                exWarehouseLot: l.exWarehouseLot,
                bundleCount: l.expectedBundleCount,
                weights: { gross: g, net: n },
              };
            });

            // Fire and forget logging
            createLogEntry(
              jobNo,
              userId,
              "Confirm Inbound (Sync)",
              {
                totalLots: jobData.lots.length,
                totalGrossWeight: parseFloat(totalGross.toFixed(3)),
                totalNetWeight: parseFloat(totalNet.toFixed(3)),
              },
              lotsDetailed,
            );
          }
          // -----------------------------------

          results.push({
            jobId: job.id,
            status: "OK",
            processed: inserted.length,
          });
          break;
        }

        case "REPORT_DISCREPANCY": {
          const { lotIds, reportedBy } = payload;
          const reports = await confirmInboundModel.reportConfirmation(
            lotIds,
            reportedBy,
            { transaction: t },
          );

          await t.commit();

          // --- LOGGING LOGIC ---
          // We need lot details for logging. Fetch them roughly.
          try {
            const lots = await db.sequelize.query(
              `SELECT "lotId", "lotNo", "jobNo", "exWarehouseLot" FROM public.lot WHERE "lotId" IN (:ids)`,
              {
                replacements: {
                  ids: Array.isArray(lotIds) ? lotIds : [lotIds],
                },
                type: db.sequelize.QueryTypes.SELECT,
              },
            );

            const jobsMap = {};
            lots.forEach((l) => {
              if (!jobsMap[l.jobNo]) jobsMap[l.jobNo] = [];
              jobsMap[l.jobNo].push(l);
            });

            for (const jobNo in jobsMap) {
              createLogEntry(
                jobNo,
                reportedBy,
                "Report Discrepancy (Sync)",
                { totalReportedLots: jobsMap[jobNo].length },
                jobsMap[jobNo].map((l) => ({
                  lotId: l.lotId,
                  lotNo: l.lotNo,
                  exWarehouseLot: l.exWarehouseLot,
                  issue: "Reported via Offline Sync",
                })),
              );
            }
          } catch (logErr) {
            console.error("[Sync] Logging error for discrepancy:", logErr);
          }
          // ---------------------

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
            { transaction: t },
          );

          await t.commit();

          // Log Job Discrepancy
          createLogEntry(
            jobNo,
            reportedBy,
            "Report Job Discrepancy (Sync)",
            { type: discrepancyType },
            {},
          );

          results.push({ jobId: job.id, status: "OK", processed: reportCount });
          break;
        }

        case "UPDATE_GRN": {
          const outboundId = parseInt(job.target_id, 10);
          await grnModel.updateAndRegenerateGrn(outboundId, payload, {
            transaction: t,
          });
          await t.commit();
          results.push({ jobId: job.id, status: "OK" });
          break;
        }

        case "UPDATE_CREW_LOT_NO": {
          const { inboundId, lotId, crewLotNo, jobNo, exWarehouseLot } =
            payload;
          let targetInboundId = inboundId;
          let targetLotId = lotId;

          if (!targetInboundId && !targetLotId && jobNo && exWarehouseLot) {
            const related =
              await actualWeightModel.findRelatedIdByExWarehouseLot(
                jobNo,
                exWarehouseLot,
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
              t,
            );
          } else if (targetLotId) {
            await actualWeightModel.updateCrewLotNo(
              targetLotId,
              false,
              crewLotNo,
              t,
            );
          }
          await t.commit();
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
            // [UPDATED] Extract these fields from payload
            tareWeight,
            scaleNo,
            userId,
          } = payload;

          let resolvedInboundId = inboundId;
          let resolvedLotId = lotId;

          if (!resolvedInboundId && !resolvedLotId && jobNo && exWarehouseLot) {
            const related =
              await actualWeightModel.findRelatedIdByExWarehouseLot(
                jobNo,
                exWarehouseLot,
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
              jobNo, // [UPDATED] Pass jobNo
              lotNo, // [UPDATED] Pass lotNo
              exWarehouseLot, // [UPDATED] Pass exWarehouseLot
              tareWeight, // [UPDATED] Pass tareWeight
              scaleNo, // [UPDATED] Pass scaleNo
              userId, // [UPDATED] Pass userId
              t, // [UPDATED] Pass transaction as final argument
            );
          } else if (resolvedLotId) {
            await actualWeightModel.saveLotWithBundles(
              resolvedLotId,
              actualWeight,
              bundles,
              strictValidation,
              jobNo,
              lotNo,
              exWarehouseLot,
              tareWeight, // [UPDATED] Pass tareWeight
              scaleNo, // [UPDATED] Pass scaleNo
              userId, // [UPDATED] Pass userId
              t, // [UPDATED] Pass transaction as final argument
            );
          } else if (jobNo && lotNo) {
            // Fallback legacy logic
            const foundInbound = await actualWeightModel.findRelatedId(
              null,
              false,
              jobNo,
              lotNo,
            );
            if (foundInbound) {
              await actualWeightModel.saveInboundWithBundles(
                foundInbound,
                actualWeight,
                bundles,
                strictValidation,
                jobNo,
                lotNo,
                null, // exWarehouseLot
                tareWeight, // [UPDATED]
                scaleNo, // [UPDATED]
                userId, // [UPDATED]
                t,
              );
            } else {
              const foundLot = await actualWeightModel.findRelatedId(
                null,
                true,
                jobNo,
                lotNo,
              );
              if (foundLot) {
                await actualWeightModel.saveLotWithBundles(
                  foundLot,
                  actualWeight,
                  bundles,
                  strictValidation,
                  jobNo,
                  lotNo,
                  null, // exWarehouseLot
                  tareWeight, // [UPDATED]
                  scaleNo, // [UPDATED]
                  userId, // [UPDATED]
                  t,
                );
              }
            }
          }
          await t.commit();
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
              { transaction: t },
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
              { transaction: t },
            );
          }

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

          if (isRepackProvided) {
            if (newBeforeImagesBase64?.length) {
              for (const img of newBeforeImagesBase64) {
                const dbPath = saveBase64Image(
                  img.data,
                  jobNo,
                  lotNo,
                  noOfBundle,
                  "before",
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
                  { transaction: t },
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
                  "after",
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
                  { transaction: t },
                );
              }
            }
          }
          await t.commit();
          results.push({ jobId: job.id, status: "OK" });
          break;
        }

        default:
          console.warn(`[Sync] Unknown action_type: ${job.action_type}`);
          results.push({ jobId: job.id, status: "SKIPPED" });
          await t.commit(); // Commit empty transaction to release connection
      }
    } catch (jobError) {
      // If a specific job fails, we rollback ONLY that job's transaction.
      // The loop continues for other jobs.
      console.error(`[Sync] Error processing job ${job.id}:`, jobError);
      await t.rollback();
      results.push({
        jobId: job.id,
        status: "FAILED",
        error: jobError.message,
      });
    }
  }

  // We return 200 even if some failed, so the client knows we received the batch.
  // The client (SyncService) should parse 'results' to know which IDs to delete from local queue.
  // Currently, your SyncService deletes ALL pending jobs if status == 200.
  // IMPORTANT: For robustness, you should eventually update SyncService to only delete jobs where status === "OK" or "SKIPPED".
  // But for now, this change prevents a server crash or full rollback.

  res.status(200).json({ message: "Sync batch processed", results });
};
