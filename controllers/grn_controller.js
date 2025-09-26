const grnModel = require("../models/grn.model");
const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

const grnController = {
  async listGrns(req, res) {
    console.log("CONTROLLER: Entering listGrns with query:", req.query);
    try {
      // Pass all query params to the model, which now handles pagination, sorting, and filtering
      const { totalCount, data } = await grnModel.getAllGrns(req.query);
      res.status(200).json({
        data,
        page: parseInt(req.query.page) || 1,
        pageSize: parseInt(req.query.pageSize) || 25,
        totalCount,
        totalPages: Math.ceil(
          totalCount / (parseInt(req.query.pageSize) || 25)
        ),
      });
    } catch (error) {
      console.error("CONTROLLER ERROR in listGrns:", error);
      res.status(500).json({ error: "Failed to fetch Goods Release Notes." });
    }
  },

  async previewGrnPdf(req, res) {
    console.log("CONTROLLER: Entering previewGrnPdf");
    try {
      const { outboundId } = req.params;
      const result = await grnModel.getGrnPdfPath(outboundId);

      if (!result || !result.grnImage) {
        return res
          .status(404)
          .json({ error: "PDF record not found for this GRN." });
      }

      const pdfPath = path.join(__dirname, "..", result.grnImage);

      if (fs.existsSync(pdfPath)) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${path.basename(pdfPath)}"`
        );
        res.sendFile(pdfPath);
      } else {
        console.error(`CONTROLLER ERROR: File not found at path: ${pdfPath}`);
        res
          .status(404)
          .json({ error: "PDF file does not exist on the server." });
      }
    } catch (error) {
      console.error("CONTROLLER ERROR in previewGrnPdf:", error);
      res.status(500).json({ error: "Failed to retrieve PDF." });
    }
  },

  async previewGrnImage(req, res) {
    console.log("CONTROLLER: Entering previewGrnImage");
    try {
      const { outboundId } = req.params;
      const result = await grnModel.getGrnPreviewImagePath(outboundId);

      if (!result || !result.grnPreviewImage) {
        return res
          .status(404)
          .json({ error: "Preview image record not found for this GRN." });
      }

      const imagePath = path.join(__dirname, "..", result.grnPreviewImage);

      if (fs.existsSync(imagePath)) {
        res.setHeader("Content-Type", "image/png"); // Assuming PNG format
        res.sendFile(imagePath);
      } else {
        console.error(
          `CONTROLLER ERROR: Image file not found at path: ${imagePath}`
        );
        res
          .status(404)
          .json({ error: "Preview image file does not exist on the server." });
      }
    } catch (error) {
      console.error("CONTROLLER ERROR in previewGrnImage:", error);
      res.status(500).json({ error: "Failed to retrieve preview image." });
    }
  },

  async getGrnFilters(req, res) {
    console.log("CONTROLLER: Entering getGrnFilters");
    try {
      const filters = await grnModel.getFilterOptions();
      res.status(200).json(filters);
    } catch (error) {
      console.error("CONTROLLER ERROR in getGrnFilters:", error);
      res.status(500).json({ error: "Failed to fetch filter options." });
    }
  },

  async downloadMultiplePdfs(req, res) {
    console.log("CONTROLLER: Entering downloadMultiplePdfs");
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: "An array of outbound IDs is required." });
    }

    try {
      const grnRecords = await grnModel.getGrnDetailsForMultipleIds(ids);

      const foundIds = grnRecords.map((r) => r.outboundId);
      const missingDbRecords = ids.filter((id) => !foundIds.includes(id));

      if (missingDbRecords.length > 0) {
        return res.status(404).json({
          error: "Database records not found.",
          details: `Could not find GRNs for the following internal IDs: ${missingDbRecords.join(
            ", "
          )}`,
        });
      }

      const missingFiles = [];
      const pdfBuffers = [];

      for (const record of grnRecords) {
        if (!record.grnImage) {
          missingFiles.push(record.grnNo);
          continue;
        }
        const pdfPath = path.join(__dirname, "..", record.grnImage);
        if (fs.existsSync(pdfPath)) {
          pdfBuffers.push(fs.readFileSync(pdfPath));
        } else {
          missingFiles.push(record.grnNo);
        }
      }

      if (missingFiles.length > 0) {
        const missingGrnsString = missingFiles.join(", ");
        const userFriendlyMessage = `The GRN: ${missingGrnsString} not found in the system. Please try again by removing these GRNs.`;

        return res.status(404).json({
          error: "One or more PDF files could not be found on the server.",
          details: userFriendlyMessage,
        });
      }

      // Merge all found PDFs into one
      const mergedPdf = await PDFDocument.create();
      for (const pdfBytes of pdfBuffers) {
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(
          pdf,
          pdf.getPageIndices()
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="GRN_Compilation.pdf"'
      );
      res.send(Buffer.from(mergedPdfBytes));
    } catch (error) {
      console.error("CONTROLLER ERROR in downloadMultiplePdfs:", error);
      res.status(500).json({ error: "Failed to generate combined PDF." });
    }
  },

  async getGrnForEdit(req, res) {
    try {
      const { outboundId } = req.params;
      const details = await grnModel.getGrnDetailsForEdit(outboundId);
      if (!details) {
        return res
          .status(404)
          .json({ error: "GRN details not found for editing." });
      }
      // Convert signature buffers to base64 for the client
      if (details.driverSignature) {
        details.driverSignature = details.driverSignature.toString("base64");
      }
      if (details.warehouseStaffSignature) {
        details.warehouseStaffSignature =
          details.warehouseStaffSignature.toString("base64");
      }
      if (details.warehouseSupervisorSignature) {
        details.warehouseSupervisorSignature =
          details.warehouseSupervisorSignature.toString("base64");
      }

      res.status(200).json(details);
    } catch (error) {
      console.error("CONTROLLER ERROR in getGrnForEdit:", error);
      res.status(500).json({ error: "Failed to fetch GRN details for edit." });
    }
  },

  async updateGrn(req, res) {
    try {
      const { outboundId } = req.params;
      const formData = req.body;

      // Convert base64 signatures back to buffers before sending to model
      if (formData.driverSignature) {
        formData.driverSignature = Buffer.from(
          formData.driverSignature,
          "base64"
        );
      }
      if (formData.warehouseStaffSignature) {
        formData.warehouseStaffSignature = Buffer.from(
          formData.warehouseStaffSignature,
          "base64"
        );
      }
      if (formData.warehouseSupervisorSignature) {
        formData.warehouseSupervisorSignature = Buffer.from(
          formData.warehouseSupervisorSignature,
          "base64"
        );
      }

      const { pdf, previewImage } = await grnModel.updateAndRegenerateGrn(
        outboundId,
        formData
      );

      res.status(200).json({
        message: "GRN updated successfully.",
        pdf,
        previewImage,
      });
    } catch (error) {
      console.error("CONTROLLER ERROR in updateGrn:", error);
      res
        .status(500)
        .json({ error: "Failed to update GRN.", details: error.message });
    }
  },
};

module.exports = grnController;
