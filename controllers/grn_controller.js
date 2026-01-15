// - Updated grn_controller.js
const grnModel = require("../models/grn.model");
const path = require("path");
const fs = require("fs").promises;
const { PDFDocument } = require("pdf-lib");
const fsSync = require("fs");
const usersModel = require("../models/users.model");

// --- LOGGING CONFIGURATION ---
const LOGS_DIR = path.join(__dirname, "../logs/GRN Edited");
if (!fsSync.existsSync(LOGS_DIR)) {
  fsSync.mkdirSync(LOGS_DIR, { recursive: true });
}

// Helper: Generate Unique Filename based on GRN Number
const generateUniqueFilename = (dir, grnNo) => {
  const safeGrn = (grnNo || "UNKNOWN_GRN").replace(/[^a-z0-9]/gi, "-");
  let baseName = `${safeGrn}`;
  let filename = `${baseName}.json`;
  let counter = 1;

  while (fsSync.existsSync(path.join(dir, filename))) {
    filename = `${baseName}_${counter}.json`;
    counter++;
  }
  return path.join(dir, filename);
};

// Helper: Create Log Entry with Structured Format
const createLogEntry = async (
  grnNo,
  jobNo,
  userId,
  actionType,
  summaryData,
  detailsData
) => {
  try {
    let username = "Unknown";
    let userRole = "Unknown"; // Added role for completeness if available
    try {
      if (userId) {
        const idToFetch = typeof userId === "object" ? userId.id : userId;
        const userDetails = await usersModel.getUserById(idToFetch);
        if (userDetails) {
          username = userDetails.username;
          userRole = userDetails.rolename;
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
        outboundJobNo: jobNo, // Job Number
        grnNo: grnNo, // GRN Number
        action: actionType,
        timestamp: timestamp,
        performedBy: {
          userId: userId || "N/A",
          username: username,
          userRole: userRole,
        },
      },
      summary: summaryData,
      details: detailsData,
    };

    // Filename based on GRN Number
    const filePath = generateUniqueFilename(LOGS_DIR, grnNo);
    await fs.writeFile(filePath, JSON.stringify(fileContent, null, 2));
    console.log(`[LOG CREATED] ${filePath}`);
  } catch (error) {
    console.error(`Error generating log for GRN ${grnNo}:`, error);
  }
};

const grnController = {
  async listGrns(req, res) {
    console.log("CONTROLLER: Entering listGrns with query:", req.query);
    try {
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
        res.setHeader("Content-Type", "image/png");
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
        return res.status(404).json({
          error: "One or more PDF files could not be found on the server.",
          details: `The GRN: ${missingGrnsString} not found in the system.`,
        });
      }

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

  async getDropdownOptions(req, res) {
    try {
      const options = await grnModel.getDropdownOptions();
      res.status(200).json(options);
    } catch (error) {
      console.error("CONTROLLER ERROR in getDropdownOptions:", error);
      res.status(500).json({ error: "Failed to fetch dropdown options." });
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
      if (details.driverSignature)
        details.driverSignature = details.driverSignature.toString("base64");
      if (details.warehouseStaffSignature)
        details.warehouseStaffSignature =
          details.warehouseStaffSignature.toString("base64");
      if (details.warehouseSupervisorSignature)
        details.warehouseSupervisorSignature =
          details.warehouseSupervisorSignature.toString("base64");

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
      const { userId } = formData;

      // 1. Fetch Previous Details (Snapshot for Logging)
      let previousDetails = {};
      try {
        previousDetails = await grnModel.getGrnDetailsForEdit(outboundId);
      } catch (err) {
        console.warn("Could not fetch previous details for logging:", err);
      }

      // 2. Prepare Signatures for DB
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

      // 3. Execute Update
      const { pdf, previewImage } = await grnModel.updateAndRegenerateGrn(
        outboundId,
        formData
      );

      // 4. LOGGING SYSTEM
      try {
        const jobNo =
          previousDetails.ourReference ||
          previousDetails.jobIdentifier ||
          "UnknownJob";
        const grnNo = previousDetails.grnNo || "UnknownGRN";

        // --- Build "Updated Data" Snapshot ---
        // Copy previous details and overwrite with new form data
        const updatedDataSnapshot = {
          ...previousDetails,
          releaseDate: formData.releaseDate,
          releaseWarehouse: formData.releaseWarehouse,
          transportVendor: formData.transportVendor,
          commodities: formData.commodities, // Note: aggregates might behave differently than single edits
          shapes: formData.shapes,
          containerNo: formData.containerNo,
          sealNo: formData.sealNo,
          uom: formData.uom,
        };

        // Update specific lots in the snapshot if their brands changed
        if (formData.updatedBrands && previousDetails.lots) {
          updatedDataSnapshot.lots = previousDetails.lots.map((lot) => {
            const update = formData.updatedBrands.find(
              (u) => u.outboundTransactionId === lot.outboundTransactionId
            );
            if (update) {
              return { ...lot, brand: update.newBrand };
            }
            return lot;
          });
        }

        // --- Compare for Summary ---
        const changedFields = [];

        const compare = (key, label) => {
          const prev = previousDetails[key] || "";
          const curr = formData[key] || "";
          if (prev != curr) {
            changedFields.push(label);
          }
        };

        compare("releaseDate", "Release Date");
        compare("releaseWarehouse", "Warehouse");
        compare("transportVendor", "Transport Vendor");
        compare("commodities", "Commodity");
        compare("shapes", "Shape");
        compare("containerNo", "Container No");
        compare("sealNo", "Seal No");
        compare("uom", "UOM");

        // Compare Brands specifically per lot
        if (formData.updatedBrands && previousDetails.lots) {
          formData.updatedBrands.forEach((update) => {
            const originalLot = previousDetails.lots.find(
              (l) => l.outboundTransactionId === update.outboundTransactionId
            );
            if (
              originalLot &&
              (originalLot.brand || "") !== (update.newBrand || "")
            ) {
              changedFields.push(
                `Brand updated for Job ${originalLot.jobNo} - Lot ${originalLot.lotNo}`
              );
            }
          });
        }

        // Only log if something actually changed (or if it's a save action regardless)
        if (changedFields.length > 0) {
          const summaryData = {
            fieldsChanged: changedFields,
          };

          const detailsData = {
            previousData: previousDetails,
            updatedData: updatedDataSnapshot,
          };

          await createLogEntry(
            grnNo,
            jobNo,
            userId,
            "GRN Edited",
            summaryData,
            detailsData
          );
        }
      } catch (logError) {
        console.error("Logging failed inside updateGrn:", logError);
      }

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
