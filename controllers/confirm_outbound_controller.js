const outboundModel = require("../models/confirm_outbound.model");
const pendingTasksModel = require("../models/pending_tasks_model");
const pdfService = require("../pdf.services");
const fs = require("fs").promises;
const path = require("path");

const getConfirmationDetails = async (req, res) => {
  console.log("CONTROLLER: Entering getConfirmationDetails");
  try {
    const { selectedInboundId } = req.params;
    console.log(
      `CONTROLLER: Fetching details for selectedInboundId: ${selectedInboundId}`
    );
    const details = await outboundModel.getConfirmationDetailsById(
      selectedInboundId
    );

    if (!details) {
      console.log("CONTROLLER: No confirmation details found.");
      return res.status(404).json({ error: "Confirmation details not found." });
    }

    console.log("CONTROLLER: Successfully fetched confirmation details.");
    res.status(200).json(details);
  } catch (error) {
    console.error("CONTROLLER ERROR in getConfirmationDetails:", error);
    res.status(500).json({ error: "Failed to fetch confirmation details." });
  }
};

const confirmOutbound = async (req, res) => {
  console.log("CONTROLLER: Entering confirmOutbound");
  try {
    const { itemsToConfirm, scheduleOutboundId, outboundJobNo } = req.body;
    console.log("CONTROLLER: Received payload for confirmOutbound:", req.body);
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
    console.error("CONTROLLER ERROR in confirmOutbound:", error);
    res.status(500).json({ error: "Failed to confirm outbound selection." });
  }
};

const getGrnDetails = async (req, res) => {
  console.log("CONTROLLER: Entering getGrnDetails");
  try {
    const { scheduleOutboundId, selectedInboundIds } = req.body;
    console.log("CONTROLLER: Received payload for getGrnDetails:", req.body);
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
      console.log("CONTROLLER: No GRN details found for selection.");
      return res
        .status(404)
        .json({ error: "GRN details not found for the given selection." });
    }
    console.log("CONTROLLER: Successfully fetched GRN details.");
    res.status(200).json(grnDetails);
  } catch (error) {
    console.error("CONTROLLER ERROR in getGrnDetails:", error);
    res.status(500).json({ error: "Failed to generate GRN." });
  }
};

const createGrnAndTransactions = async (req, res) => {
  console.log("\n--- CONTROLLER: Entering createGrnAndTransactions ---");
  try {
    const grnDataFromRequest = req.body;
    console.log(
      "CONTROLLER: Received GRN data from request:",
      JSON.stringify(grnDataFromRequest, null, 2)
    );
    const scheduleId = parseInt(grnDataFromRequest.jobIdentifier, 10);

    console.log("CONTROLLER: 1. Calling model to create DB records...");
    const { createdOutbound, lotsForPdf } =
      await outboundModel.createGrnAndTransactions(grnDataFromRequest);
    console.log(
      "CONTROLLER: 1. Model call successful. Created Outbound ID:",
      createdOutbound.outboundId
    );

    console.log(
      `CONTROLLER: 2. Fetching schedule info for scheduleId: ${scheduleId}`
    );
    const scheduleInfo = await pendingTasksModel.pendingOutboundTasksUser(
      scheduleId
    );
    console.log("CONTROLLER: 2. Fetched schedule info:", scheduleInfo);

    console.log("CONTROLLER: 3. Preparing data for PDF generation...");
    const aggregateDetails = (key) =>
      [...new Set(lotsForPdf.map((lot) => lot[key]).filter(Boolean))].join(
        ", "
      );

    const containerAndSealNo =
      scheduleInfo.containerNo && scheduleInfo.sealNo
        ? `${scheduleInfo.containerNo} / ${scheduleInfo.sealNo}`
        : "NA";

    const pdfData = {
      ...grnDataFromRequest,
      ourReference: grnDataFromRequest.outboundJobNo,
      grnNo: createdOutbound.grnNo,
      releaseDate: new Date(createdOutbound.outboundedDate).toLocaleDateString(
        "en-GB",
        { day: "2-digit", month: "short", year: "numeric" }
      ),
      warehouse: lotsForPdf.length > 0 ? lotsForPdf[0].releaseWarehouse : "",
      containerAndSealNo: containerAndSealNo,
      cargoDetails: {
        commodity: aggregateDetails("commodity"),
        shape: aggregateDetails("shape"),
        brand: aggregateDetails("brand"),
      },
      lots: lotsForPdf.map((lot) => ({
        lotNo: `${lot.jobNo}-${lot.lotNo}`,
        bundles: lot.noOfBundle,
        grossWeightMt: parseFloat(lot.grossWeight * 0.907185).toFixed(2),
        netWeightMt: parseFloat(lot.netWeight * 0.907185).toFixed(2),
      })),
    };
    console.log(
      "CONTROLLER: 3. PDF data prepared:",
      JSON.stringify(pdfData, null, 2)
    );

    console.log(
      "CONTROLLER: 4. Calling PDF service to generate PDF and Image..."
    );
    const { outputPath, previewImagePath } = await pdfService.generateGrnPdf(
      pdfData
    );
    console.log(
      `CONTROLLER: 4. PDF service successful. PDF: ${outputPath}, Preview Image: ${previewImagePath}`
    );

    console.log("CONTROLLER: 5. Getting file size and updating database...");
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

    console.log(
      `CONTROLLER: 5. PDF path: ${relativePdfPath}, Preview path: ${relativePreviewPath}, Size: ${fileSizeInBytes} bytes.`
    );

    await outboundModel.updateOutboundWithPdfDetails(
      createdOutbound.outboundId,
      relativePdfPath,
      fileSizeInBytes,
      relativePreviewPath
    );
    console.log(
      "CONTROLLER: 5. Database updated with PDF and Preview Image details."
    );

    console.log("CONTROLLER: 6. Reading files and encoding to Base64...");
    const pdfBuffer = await fs.readFile(outputPath);
    const base64Pdf = pdfBuffer.toString("base64");

    // --- NEW: Read preview image and encode it ---
    const previewImageBuffer = await fs.readFile(previewImagePath);
    const base64PreviewImage = previewImageBuffer.toString("base64");

    console.log("CONTROLLER: 6. Base64 encoding complete.");
    console.log(
      `CONTROLLER: 6. Sending JSON response with Base64 PDF and Image data.`
    );

    // --- MODIFICATION: Return both PDF and image data ---
    res.status(200).json({
      pdf: base64Pdf,
      previewImage: base64PreviewImage,
    });

    console.log(
      "--- CONTROLLER: createGrnAndTransactions finished successfully. ---"
    );
  } catch (error) {
    console.error("--- CONTROLLER ERROR in createGrnAndTransactions: ---");
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to create GRN.",
        details: error.message,
      });
    }
  }
};

const getOperators = async (req, res) => {
  console.log("CONTROLLER: Entering getOperators");
  try {
    const users = await outboundModel.getOperators();
    const staff = users.filter((user) => user.roleId === 1);
    const supervisors = users.filter((user) => user.roleId === 2);
    console.log(
      `CONTROLLER: Found ${staff.length} staff and ${supervisors.length} supervisors.`
    );
    res.status(200).json({ staff, supervisors });
  } catch (error) {
    console.error("CONTROLLER ERROR in getOperators:", error);
    res.status(500).json({ error: "Failed to fetch operators." });
  }
};

module.exports = {
  getConfirmationDetails,
  confirmOutbound,
  getGrnDetails,
  createGrnAndTransactions,
  getOperators,
};
