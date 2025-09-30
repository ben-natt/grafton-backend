const outboundModel = require("../models/confirm_outbound.model");
const pendingTasksModel = require("../models/pending_tasks_model");
const pdfService = require("../pdf.services");
const fs = require("fs").promises;
const path = require("path");

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

    console.log("CONTROLLER: Confirming outbound selection is valid.");
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
      // If found, send the signature back as a base64 string
      res.status(200).json({ signature: signature.toString("base64") });
    } else {
      // This is not an error; it's expected if the user has never signed.
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
      warehouseSupervisorSignature,
      scheduleOutboundId,
    } = grnDataFromRequest;

    // --- Photo Limit Validation ---
    const PHOTO_LIMIT = 15;
    const newPhotosCount =
      stuffingPhotos && Array.isArray(stuffingPhotos)
        ? stuffingPhotos.length
        : 0;

    // Get the count of photos already in the database for this schedule
    const existingPhotosCount =
      await outboundModel.countStuffingPhotosByScheduleId(scheduleOutboundId);

    if (existingPhotosCount + newPhotosCount > PHOTO_LIMIT) {
      return res.status(400).json({
        error: "Photo limit exceeded.",
        details: `A maximum of ${PHOTO_LIMIT} photos is allowed. You already have ${existingPhotosCount} saved and are trying to add ${newPhotosCount}.`,
      });
    }
    // --- End Validation ---

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

    // --- Image Handling Logic --- (rest of the function continues as before)
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
    }

    const scheduleId = parseInt(grnDataFromRequest.jobIdentifier, 10);

    const { createdOutbound, lotsForPdf } =
      await outboundModel.createGrnAndTransactions(grnDataFromRequest);

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

    const containerAndSealNo =
      scheduleInfo.containerNo && scheduleInfo.sealNo
        ? `${scheduleInfo.containerNo} / ${scheduleInfo.sealNo}`
        : "N/A";

    const parseAndFix = (val, decimals = 2) => {
      const num = parseFloat(val);
      return !isNaN(num) ? num.toFixed(decimals) : (0).toFixed(decimals);
    };

    const pdfData = {
      ...grnDataFromRequest,
      isWeightVisible: grnDataFromRequest.isWeightVisible,
      ourReference: grnDataFromRequest.outboundJobNo,
      grnNo: createdOutbound.grnNo,
      releaseDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
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
        brand: aggregateDetails("brand") ? aggregateDetails("brand") : "N/A",
      },
      lots: lotsForPdf.map((lot) => {
        const actualWeight = parseFloat(lot.actualWeight) || 0;
        const grossWeight = parseFloat(lot.grossWeight) || 0;

        const displayWeight = actualWeight !== 0 ? actualWeight : grossWeight;

        return {
          lotNo: `${lot.jobNo}-${lot.lotNo}`,
          bundles: lot.noOfBundle,
          grossWeightMt: parseAndFix(lot.grossWeight, 2), // Not used in PDF but kept for consistency
          netWeightMt: parseAndFix(lot.netWeight, 2),
          actualWeightMt: parseAndFix(displayWeight, 2), // This will be drawn in the Gross Weight space
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
      // Check for our custom duplicate error
      if (error.isDuplicate) {
        return res.status(409).json({
          // 409 Conflict is a good status code for this
          error: "GRN Generation Failed",
          details: error.message,
        });
      } else {
        // Added else to prevent sending two responses
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


// const getOperators = async (req, res) => {
//   try {
//     const users = await outboundModel.getOperators();
//     const staff = users.filter((user) => user.roleId === 1);
//     const supervisors = users.filter((user) => user.roleId === 2);

//     res.status(200).json({ staff, supervisors });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to fetch operators." });
//   }
// };
