const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");
const poppler = require("pdf-poppler");

async function generateGrnPdf(data) {
  try {
    console.log("PDF Service: Data received for PDF generation:", data);
    const templatePath = path.join(__dirname, "./grn/GRN Template.pdf");
    try {
      await fs.access(templatePath);
    } catch (error) {
      throw new Error("GRN Pdf not found.");
    }

    const pdfTemplateBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(pdfTemplateBytes);
    const page = pdfDoc.getPages()[0];

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 7;
    const textColor = rgb(0, 0, 0);

    // Check visibility flag from data, default to true if not provided
    const isWeightVisible = data.isWeightVisible !== false;

    const drawText = (text, x, y, customFont = font, size = fontSize) => {
      page.drawText(String(text || "N/A"), {
        x,
        y,
        font: customFont,
        size,
        color: textColor,
      });
    };

    const formatDate = (dateString) => {
      if (!dateString) return "N/A";
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString; // Return original if invalid date

      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = String(date.getFullYear()).slice(-2);

      return `${day}/${month}/${year}`;
    };

    const embedSignature = async (
      base64,
      x,
      y,
      width,
      height,
      signatureName
    ) => {
      if (!base64 || typeof base64 !== "string" || base64.trim() === "") {
        return;
      }

      try {
        const pngImage = await pdfDoc.embedPng(Buffer.from(base64, "base64"));
        page.drawImage(pngImage, { x, y, width, height });
      } catch (e) {
        throw new Error(`Failed to embed Signature`);
      }
    };

    drawText(data.ourReference, 115, 526, boldFont);
    drawText(data.grnNo, 300, 527, boldFont);
    drawText(formatDate(data.releaseDate), 300, 509, boldFont);
    drawText(data.warehouse, 300, 492, boldFont);
    drawText(data.transportVendor, 224, 450, boldFont);
    drawText(data.cargoDetails.commodity, 80, 421, boldFont);
    drawText(data.cargoDetails.shape, 198, 421, boldFont);
    drawText(data.cargoDetails.brand, 300, 421, boldFont);
    drawText(data.containerAndSealNo, 300, 465, boldFont);

    if (data.containerAndSealNo && data.containerAndSealNo == "N/A") {
      // drawText("√", 117, 465, boldFont, 10);
      // A manual tick mark
      const tickX = 117;
      const tickY = 456;
      const tickColor = rgb(0, 0, 0);
      const tickThickness = 1.5; // Adjust for a thicker line like bold text

      // The two lines that form the tick
      page.drawLine({
        start: { x: tickX, y: tickY },
        end: { x: tickX + 4, y: tickY - 5 }, // Short part of the tick
        color: tickColor,
        thickness: tickThickness,
      });
      page.drawLine({
        start: { x: tickX + 4, y: tickY - 5 },
        end: { x: tickX + 10, y: tickY + 3 }, // Long part of the tick
        color: tickColor,
        thickness: tickThickness,
      });
    }

    if (data.containerAndSealNo && data.containerAndSealNo !== "N/A") {
      // drawText("√", 117, 465, boldFont, 10);
      // A manual tick mark
      const tickX = 117;
      const tickY = 467;
      const tickColor = rgb(0, 0, 0);
      const tickThickness = 1.5; // Adjust for a thicker line like bold text

      // The two lines that form the tick
      page.drawLine({
        start: { x: tickX, y: tickY },
        end: { x: tickX + 4, y: tickY - 5 }, // Short part of the tick
        color: tickColor,
        thickness: tickThickness,
      });
      page.drawLine({
        start: { x: tickX + 4, y: tickY - 5 },
        end: { x: tickX + 10, y: tickY + 3 }, // Long part of the tick
        color: tickColor,
        thickness: tickThickness,
      });
    }

    let startY = 393;
    const rowHeight = 14;
    let totalBundles = 0;
    const uomValue = data.uom;

    for (const lot of data.lots) {
      if (startY < 270) break;
      drawText(lot.lotNo, 48, startY);

      if (data.uom != "" && data.uom != null) {
        drawText(uomValue, 120, startY);
      }

      drawText(lot.bundles, 186, startY);

      // Conditionally draw weights based on the visibility flag
      if (isWeightVisible) {
        drawText(lot.actualWeightMt, 228, startY);
        drawText(lot.netWeightMt, 266, startY);
      }

      totalBundles += Number(lot.bundles || 0);
      startY -= rowHeight;
    }

    drawText(totalBundles.toString(), 186, 254, boldFont);
    drawText(data.driverName, 32, 180, boldFont);
    drawText(data.driverIdentityNo, 125, 180, boldFont);
    drawText(data.truckPlateNo, 217, 180, boldFont);
    drawText(data.warehouseStaff, 32, 112, boldFont);
    drawText(data.warehouseSupervisor, 217, 112, boldFont);

    await embedSignature(data.driverSignature, 310, 180, 60, 15, "Driver");
    await embedSignature(
      data.warehouseStaffSignature,
      125,
      112,
      60,
      15,
      "Warehouse Staff"
    );
    await embedSignature(
      data.warehouseSupervisorSignature,
      310,
      112,
      60,
      15,
      "Warehouse Supervisor"
    );

    const pdfBytes = await pdfDoc.save();
    const grnDir = path.join(__dirname, "../grafton-backend/grn");
    const previewDir = path.join(grnDir, "preview");
    await fs.mkdir(previewDir, { recursive: true });

    const safeGrnNo = data.fileName.replace(/[\/\\?%*:|"<>]/g, "_");
    const pdfFileName = `GRN_${safeGrnNo}.pdf`;
    const previewImageFileName = `GRN_${safeGrnNo}_preview`;

    const outputPath = path.join(grnDir, pdfFileName);
    const previewImagePath = path.join(
      previewDir,
      `${previewImageFileName}.png`
    );

    await fs.writeFile(outputPath, pdfBytes);

    let opts = {
      format: "png",
      out_dir: previewDir,
      out_prefix: previewImageFileName,
      page: 1,
      singleFile: true,
    };

    await poppler.convert(outputPath, opts);

    const generatedImagePath = path.join(
      previewDir,
      `${previewImageFileName}-1.png`
    );
    if (
      await fs
        .access(generatedImagePath)
        .then(() => true)
        .catch(() => false)
    ) {
      await fs.rename(generatedImagePath, previewImagePath);
    }

    return { pdfBytes, outputPath, previewImagePath };
  } catch (error) {
    console.error("ERROR during PDF generation");
    throw error;
  }
}

module.exports = { generateGrnPdf };
