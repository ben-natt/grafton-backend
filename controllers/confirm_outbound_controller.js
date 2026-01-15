const outboundModel = require("../models/confirm_outbound.model");
const pendingTasksModel = require("../models/pending_tasks_model");
const pdfService = require("../pdf.services");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const usersModel = require("../models/users.model");

const LOGS_DIR = path.join(__dirname, "../logs/Confirmed Outbounds");
if (!fsSync.existsSync(LOGS_DIR)) {
  fsSync.mkdirSync(LOGS_DIR, { recursive: true });
}

const generateUniqueFilename = (dir, jobNo) => {
  const safeJob = (jobNo || "UNKNOWN").replace(/[^a-z0-9]/gi, "-");
  let baseName = `${safeJob}`;
  let filename = `${baseName}.json`;
  let counter = 1;

  while (fsSync.existsSync(path.join(dir, filename))) {
    filename = `${baseName}_${counter}.json`;
    counter++;
  }
  return path.join(dir, filename);
};

const createLogEntry = async (jobNo, userId, actionType, logDetails) => {
  try {
    let username = "Unknown";
    try {
      if (userId) {
        const idToFetch = typeof userId === "object" ? userId.id : userId;
        const userDetails = await usersModel.getUserById(idToFetch);
        if (userDetails) {
          username = userDetails.username;
        }
      }
    } catch (e) {
      console.error("Log User Fetch Error", e);
    }

    const timestamp = new Date().toLocaleString("en-SG", {
      timeZone: "Asia/Singapore",
    });

    const fileContent = {
      header: {
        outboundJobNo: jobNo,
        timestamp: timestamp,
        performedBy: {
          userId: userId || "N/A",
          username: username,
        },
      },
      action: actionType,
      data: logDetails,
    };

    const filePath = generateUniqueFilename(LOGS_DIR, jobNo);
    await fs.writeFile(filePath, JSON.stringify(fileContent, null, 2));
    console.log(`[LOG CREATED] ${filePath}`);
  } catch (error) {
    console.error(`Error generating log for ${jobNo}:`, error);
  }
};

const getConfirmationDetails = async (req, res) => {
  try {
    const { selectedInboundId } = req.params;
    const details = await outboundModel.getConfirmationDetailsById(
      selectedInboundId
    );

    if (!details) {
      return res.status(404).json({ error: "Confirmation details not found." });
    }
    res.status(200).json(details);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch confirmation details." });
  }
};

const getStuffingPhotos = async (req, res) => {
  try {
    const { scheduleOutboundId } = req.params;
    const photos = await outboundModel.getStuffingPhotosByScheduleId(
      scheduleOutboundId
    );
    res.status(200).json({ photos });
  } catch (error) {
    console.error("Error fetching stuffing photos:", error);
    res.status(500).json({ error: "Failed to fetch stuffing photos." });
  }
};

const confirmOutbound = async (req, res) => {
  try {
    const { itemsToConfirm, scheduleOutboundId, outboundJobNo } = req.body;
    if (
      !itemsToConfirm ||
      !Array.isArray(itemsToConfirm) ||
      itemsToConfirm.length === 0
    ) {
      return res.status(400).json({ error: "No items to confirm." });
    }
    const selectedInboundIds = itemsToConfirm.map(
      (item) => item.selectedInboundId
    );
    if (selectedInboundIds.includes(undefined)) {
      return res.status(400).json({
        error: "One or more items are missing the selectedInboundId.",
      });
    }

    res.status(200).json({
      message: "Selection confirmed. Proceed to GRN generation.",
      data: {
        confirmedIds: selectedInboundIds,
        scheduleOutboundId: scheduleOutboundId,
        outboundJobNo: outboundJobNo,
        selectedLots: itemsToConfirm,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to confirm outbound selection." });
  }
};

const getGrnDetails = async (req, res) => {
  try {
    const { scheduleOutboundId, selectedInboundIds } = req.body;
    if (
      !scheduleOutboundId ||
      !selectedInboundIds ||
      !Array.isArray(selectedInboundIds) ||
      selectedInboundIds.length === 0
    ) {
      return res.status(400).json({
        error:
          "A scheduleOutboundId and a list of selectedInboundIds are required.",
      });
    }
    const grnDetails = await outboundModel.getGrnDetailsForSelection(
      scheduleOutboundId,
      selectedInboundIds
    );
    if (!grnDetails) {
      return res
        .status(404)
        .json({ error: "GRN details not found for the given selection." });
    }
    res.status(200).json(grnDetails);
  } catch (error) {
    res.status(500).json({ error: "Failed to generate GRN." });
  }
};

const updateOutboundDetails = async (req, res) => {
  try {
    const { scheduleOutboundId } = req.params;
    const {
      selectedInboundId,
      releaseDate,
      containerNo,
      sealNo,
      tareWeight,
      uom,
      outboundJobNo,
      userId,
    } = req.body;

    if (!selectedInboundId) {
      return res.status(400).json({ error: "selectedInboundId is required." });
    }

    await outboundModel.updateOutboundDetails(
      parseInt(scheduleOutboundId),
      selectedInboundId,
      {
        releaseDate,
        containerNo,
        sealNo,
        tareWeight,
        uom,
      }
    );

    // --- LOGGING ---
    if (outboundJobNo) {
      const logDetails = {
        updateType: "Container/Shipping Details",
        changes: {
          selectedInboundId,
          releaseDate,
          containerNo,
          sealNo,
          tareWeight,
          uom,
        },
      };
      createLogEntry(
        outboundJobNo,
        userId,
        "Update Outbound Details",
        logDetails
      );
    }
    // --- END LOGGING ---

    res.status(200).json({ message: "Outbound details updated successfully." });
  } catch (error) {
    console.error("Error updating outbound details:", error);
    res.status(500).json({ error: "Failed to update outbound details." });
  }
};

const getUserSignature = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }
    const signature = await outboundModel.getUserSignature(userId);
    if (signature) {
      res.status(200).json({ signature: signature.toString("base64") });
    } else {
      res.status(404).json({ message: "Signature not found for this user." });
    }
  } catch (error) {
    console.error("Error fetching user signature:", error);
    res.status(500).json({ error: "Failed to fetch user signature" });
  }
};

const createGrnAndTransactions = async (req, res) => {
  try {
    const grnDataFromRequest = req.body;
    const {
      stuffingPhotos,
      userId,
      driverSignature,
      warehouseStaffSignature,
      warehouseSupervisorSignature,
      scheduleOutboundId,
      outboundJobNo,
      isWeightVisible,
      containerNo,
      sealNo,
      releaseDate,
      tareWeight,
      uom,
    } = grnDataFromRequest;

    // --- Photo Limit Validation ---
    const PHOTO_LIMIT = 15;
    const newPhotosCount =
      stuffingPhotos && Array.isArray(stuffingPhotos)
        ? stuffingPhotos.length
        : 0;

    const existingPhotosCount =
      await outboundModel.countStuffingPhotosByScheduleId(scheduleOutboundId);

    if (existingPhotosCount + newPhotosCount > PHOTO_LIMIT) {
      return res.status(400).json({
        error: "Photo limit exceeded.",
        details: `A maximum of ${PHOTO_LIMIT} photos is allowed. You already have ${existingPhotosCount} saved and are trying to add ${newPhotosCount}.`,
      });
    }

    if (warehouseSupervisorSignature) {
      const savedSignature = await outboundModel.getUserSignature(userId);
      if (!savedSignature) {
        const signatureBuffer = Buffer.from(
          warehouseSupervisorSignature,
          "base64"
        );
        await outboundModel.updateUserSignature(userId, signatureBuffer);
      }
    }

    if (driverSignature) {
      grnDataFromRequest.driverSignature = Buffer.from(
        driverSignature,
        "base64"
      );
    }
    if (warehouseStaffSignature) {
      grnDataFromRequest.warehouseStaffSignature = Buffer.from(
        warehouseStaffSignature,
        "base64"
      );
    }
    if (warehouseSupervisorSignature) {
      grnDataFromRequest.warehouseSupervisorSignature = Buffer.from(
        warehouseSupervisorSignature,
        "base64"
      );
    }

    let newlyUploadedPaths = [];
    if (stuffingPhotos && Array.isArray(stuffingPhotos)) {
      const photoUrls = [];
      const uploadDir = path.join(
        __dirname,
        "..",
        "uploads",
        "img",
        "stuffing_photos"
      );
      await fs.mkdir(uploadDir, { recursive: true });

      for (const base64Photo of stuffingPhotos) {
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
        const filePath = path.join(uploadDir, fileName);

        await fs.writeFile(filePath, base64Photo, { encoding: "base64" });
        const imageUrl = `/uploads/img/stuffing_photos/${fileName}`;
        photoUrls.push(imageUrl);
      }
      grnDataFromRequest.stuffingPhotos = photoUrls;
      newlyUploadedPaths = photoUrls;
    }

    const scheduleId = parseInt(grnDataFromRequest.jobIdentifier, 10);

    const {
      createdOutbound,
      lotsForPdf,
      deletedPhotoUrls = [], 
    } = await outboundModel.createGrnAndTransactions(grnDataFromRequest);

    // --- LOGGING IMPLEMENTATION ---
    const loggedLots = lotsForPdf.map((lot) => ({
      lotNo: `${lot.jobNo}-${lot.lotNo}`,
      brand: lot.brand,
      commodity: lot.commodity,
      grossWeight: lot.grossWeight,
      netWeight: lot.netWeight,
      actualWeight: lot.actualWeight,
      noOfBundle: lot.noOfBundle,
    }));

    // Ensure we log "N/A" only if values are explicitly missing/undefined, not just empty strings
    const logContainerNo =
      containerNo !== undefined && containerNo !== null ? containerNo : "N/A";
    const logSealNo = sealNo !== undefined && sealNo !== null ? sealNo : "N/A";

    const logDetails = {
      grnInfo: {
        grnNo: createdOutbound.grnNo,
        outboundId: createdOutbound.outboundId,
        scheduleId: scheduleId,
      },
      containerDetails: {
        containerNo: logContainerNo,
        sealNo: logSealNo,
        releaseDate: releaseDate,
        tareWeight: tareWeight,
        uom: uom,
      },
      settings: {
        isWeightVisible: isWeightVisible,
      },
      photos: {
        newlyAddedCount: newPhotosCount,
        existingCountBefore: existingPhotosCount,
        newlyUploadedPaths: newlyUploadedPaths,
        deletedCount: deletedPhotoUrls.length,
        deletedPhotoUrls: deletedPhotoUrls,
      },
      selectedLots: loggedLots,
    };

    createLogEntry(
      outboundJobNo,
      userId,
      "GRN Generated / Outbound Confirmed",
      logDetails
    );
    // --- END LOGGING ---

    const scheduleInfo = await pendingTasksModel.pendingOutboundTasksUser(
      scheduleId
    );

    const grnDetailsForPdf = await outboundModel.getGrnDetailsForSelection(
      scheduleId,
      grnDataFromRequest.selectedInboundIds
    );

    const aggregateDetails = (key) =>
      [...new Set(lotsForPdf.map((lot) => lot[key]).filter(Boolean))].join(
        ", "
      );

    const uniqueBrands = [
      ...new Set(lotsForPdf.map((lot) => lot.brand).filter(Boolean)),
    ];

    const multipleBrands = uniqueBrands.length > 1;
    const singleBrandForHeader =
      uniqueBrands.length === 1 ? uniqueBrands[0] : "";

    // IMPORTANT: Ensure Container/Seal appear in PDF if they are in the request but not yet in DB schedule info
    const finalContainerNo =
      containerNo && containerNo.trim() !== ""
        ? containerNo
        : scheduleInfo.containerNo;
    const finalSealNo =
      sealNo && sealNo.trim() !== "" ? sealNo : scheduleInfo.sealNo;

    const containerAndSealNo =
      finalContainerNo && finalSealNo
        ? `${finalContainerNo} / ${finalSealNo}`
        : "N/A";

    const parseAndFix = (val, decimals = 2) => {
      const num = parseFloat(val);
      return !isNaN(num) ? num.toFixed(decimals) : (0).toFixed(decimals);
    };

    const releaseDateForPdf = new Date(grnDataFromRequest.releaseDate);

    const pdfData = {
      ...grnDataFromRequest,
      isWeightVisible: grnDataFromRequest.isWeightVisible,
      ourReference: grnDataFromRequest.outboundJobNo,
      grnNo: createdOutbound.grnNo,
      releaseDate: releaseDateForPdf.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Singapore",
      }),
      warehouse: lotsForPdf.length > 0 ? lotsForPdf[0].releaseWarehouse : "N/A",
      transportVendor:
        lotsForPdf.length > 0 ? lotsForPdf[0].transportVendor : "N/A",
      containerAndSealNo: containerAndSealNo,
      uom: grnDataFromRequest.uom,
      fileName: grnDetailsForPdf.fileName,
      cargoDetails: {
        commodity: aggregateDetails("commodity")
          ? aggregateDetails("commodity")
          : "N/A",
        shape: aggregateDetails("shape") ? aggregateDetails("shape") : "N/A",
        brand: singleBrandForHeader,
      },
      multipleBrands: multipleBrands,
      lots: lotsForPdf.map((lot) => {
        const actualWeight = parseFloat(lot.actualWeight) || 0;
        const grossWeight = parseFloat(lot.grossWeight) || 0;
        const displayWeight = actualWeight !== 0 ? actualWeight : grossWeight;

        return {
          lotNo: `${lot.jobNo}-${lot.lotNo}`,
          bundles: lot.noOfBundle,
          grossWeightMt: parseAndFix(lot.grossWeight, 2),
          netWeightMt: parseAndFix(lot.netWeight, 2),
          actualWeightMt: parseAndFix(displayWeight, 2),
          brand: lot.brand,
        };
      }),
    };

    console.log("Controller: pdfData for PDF service:", pdfData);

    const { outputPath, previewImagePath } = await pdfService.generateGrnPdf(
      pdfData
    );

    const stats = await fs.stat(outputPath);
    const fileSizeInBytes = stats.size;
    const relativePdfPath = path.relative(
      path.join(__dirname, ".."),
      outputPath
    );
    const relativePreviewPath = path.relative(
      path.join(__dirname, ".."),
      previewImagePath
    );

    await outboundModel.updateOutboundWithPdfDetails(
      createdOutbound.outboundId,
      relativePdfPath,
      fileSizeInBytes,
      relativePreviewPath
    );

    const pdfBuffer = await fs.readFile(outputPath);
    const base64Pdf = pdfBuffer.toString("base64");

    const previewImageBuffer = await fs.readFile(previewImagePath);
    const base64PreviewImage = previewImageBuffer.toString("base64");

    res.status(200).json({
      pdf: base64Pdf,
      previewImage: base64PreviewImage,
    });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      if (error.isDuplicate) {
        return res.status(409).json({
          error: "GRN Generation Failed",
          details: error.message,
        });
      } else {
        res.status(500).json({
          error: "Failed to create GRN.",
          details: error.message,
        });
      }
    }
  }
};

module.exports = {
  getConfirmationDetails,
  getStuffingPhotos,
  confirmOutbound,
  updateOutboundDetails,
  getGrnDetails,
  getUserSignature,
  createGrnAndTransactions,
};
