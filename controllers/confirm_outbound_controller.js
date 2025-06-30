const outboundModel = require("../models/confirm_outbound.model");
const pdfService = require("../pdf.services");

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
    console.error("Error in getConfirmationDetails controller:", error);
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
    console.error("Error in confirmOutbound controller:", error);
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
    console.error("Error in getGrnDetails controller:", error);
    res.status(500).json({ error: "Failed to generate GRN." });
  }
};

const createGrnAndTransactions = async (req, res) => {
  try {
    const grnDataFromRequest = req.body;

    const { createdOutbound, lotsForPdf } =
      await outboundModel.createGrnAndTransactions(grnDataFromRequest);

    const aggregateDetails = (key) =>
      [...new Set(lotsForPdf.map((lot) => lot[key]).filter(Boolean))].join(
        ", "
      );

    const pdfData = {
      ...grnDataFromRequest,
      ourReference: grnDataFromRequest.outboundJobNo,
      grnNo: createdOutbound.grnNo,
      releaseDate: new Date(createdOutbound.outboundedDate).toLocaleDateString(
        "en-GB",
        { day: "2-digit", month: "short", year: "numeric" }
      ),
      warehouse: lotsForPdf.length > 0 ? lotsForPdf[0].releaseWarehouse : "",
      cargoDetails: {
        commodity: aggregateDetails("commodity"),
        shape: aggregateDetails("shape"),
        brand: aggregateDetails("brand"),
      },
      lots: lotsForPdf.map((lot) => ({
        lotNo: `${lot.jobNo}-${lot.lotNo}`, // Correctly formats the inbound lot number
        bundles: lot.noOfBundle,
        grossWeightMt: parseFloat(lot.grossWeight * 0.907185).toFixed(2),
        netWeightMt: parseFloat(lot.netWeight * 0.907185).toFixed(2),
      })),
    };

    const pdfBytes = await pdfService.generateGrnPdf(pdfData);

    res.setHeader("Content-Type", "application/pdf");
    const safeGrnNo = pdfData.grnNo.replace(/[\/\\?%*:|"<>]/g, "_");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=GRN_${safeGrnNo}.pdf`
    );
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("Error in createGrnAndTransactions controller:", error);
    res.status(500).json({
      error: "Failed to create GRN.",
      details: error.message,
    });
  }
};

const getOperators = async (req, res) => {
  try {
    const users = await outboundModel.getOperators();
    const staff = users.filter((user) => user.roleId === 1);
    const supervisors = users.filter((user) => user.roleId === 2);
    res.status(200).json({ staff, supervisors });
  } catch (error) {
    console.error("Error in getOperators controller:", error);
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
