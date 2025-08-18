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

const createGrnAndTransactions = async (req, res) => {
  try {
    const grnDataFromRequest = req.body;
    const scheduleId = parseInt(grnDataFromRequest.jobIdentifier, 10);

    const { createdOutbound, lotsForPdf } =
      await outboundModel.createGrnAndTransactions(grnDataFromRequest);

    const scheduleInfo = await pendingTasksModel.pendingOutboundTasksUser(
      scheduleId
    );

    const aggregateDetails = (key) =>
      [...new Set(lotsForPdf.map((lot) => lot[key]).filter(Boolean))].join(
        ", "
      );

    const containerAndSealNo =
      scheduleInfo.containerNo && scheduleInfo.sealNo
        ? `${scheduleInfo.containerNo} / ${scheduleInfo.sealNo}`
        : "N/A";

    // Helper to parse float and fix to decimal places, handling null/NaN
    const parseAndFix = (val, decimals = 2) => {
      const num = parseFloat(val);
      return !isNaN(num) ? num.toFixed(decimals) : (0).toFixed(decimals);
    };

    const pdfData = {
      ...grnDataFromRequest,
      isWeightVisible: grnDataFromRequest.isWeightVisible, // Pass visibility flag
      ourReference: grnDataFromRequest.outboundJobNo,
      grnNo: createdOutbound.grnNo,
      releaseDate: new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short", // PDF date format remains 'MMM'
        year: "numeric",
      }),
      warehouse: lotsForPdf.length > 0 ? lotsForPdf[0].releaseWarehouse : "N/A",
      transportVendor:
        lotsForPdf.length > 0 ? lotsForPdf[0].transportVendor : "N/A",
      containerAndSealNo: containerAndSealNo,
      cargoDetails: {
        commodity: aggregateDetails("commodity")
          ? aggregateDetails("commodity")
          : "N/A",
        shape: aggregateDetails("shape") ? aggregateDetails("shape") : "N/A",
        brand: aggregateDetails("brand") ? aggregateDetails("brand") : "N/A",
      },
      lots: lotsForPdf.map((lot) => ({
        lotNo: `${lot.jobNo}-${lot.lotNo}`,
        bundles: lot.noOfBundle,
        // Use helper to prevent NaN values in PDF
        grossWeightMt: parseAndFix(lot.grossWeight, 2),
        netWeightMt: parseAndFix(lot.netWeight, 2),
        actualWeightMt: parseAndFix(lot.actualWeight, 2),
      })),
    };

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
      res.status(500).json({
        error: "Failed to create GRN.",
        details: error.message,
      });
    }
  }
};

const getOperators = async (req, res) => {
  try {
    const users = await outboundModel.getOperators();
    const staff = users.filter((user) => user.roleId === 1);
    const supervisors = users.filter((user) => user.roleId === 2);

    res.status(200).json({ staff, supervisors });
  } catch (error) {
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
