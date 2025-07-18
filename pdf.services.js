const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");
const poppler = require("pdf-poppler");

async function generateGrnPdf(data) {
  try {
    const templatePath = path.join(__dirname, "./grn/GRN Template.pdf");
    try {
      await fs.access(templatePath);
    } catch (error) {
      console.error(
        "PDF SERVICE ERROR: Template file not found at path:",
        templatePath
      );
      throw new Error("GRN Template.pdf not found.");
    }

    const pdfTemplateBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(pdfTemplateBytes);
    const page = pdfDoc.getPages()[0];

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 7;
    const textColor = rgb(0, 0, 0);

    const drawText = (text, x, y, customFont = font, size = fontSize) => {
      page.drawText(String(text || "-"), {
        x,
        y,
        font: customFont,
        size,
        color: textColor,
      });
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
        console.log(
          `PDF SERVICE: Skipping ${signatureName} signature as it is empty.`
        );
        return;
      }
      // Log first 30 chars to check if it looks like a valid base64 string
      console.log(
        `PDF SERVICE: Embedding ${signatureName} signature. Base64 (first 30 chars): ${base64.substring(
          0,
          30
        )}...`
      );
      try {
        const pngImage = await pdfDoc.embedPng(Buffer.from(base64, "base64"));
        page.drawImage(pngImage, { x, y, width, height });
        console.log(
          `PDF SERVICE: Successfully embedded ${signatureName} signature.`
        );
      } catch (e) {
        console.error(
          `--- PDF SERVICE ERROR: Failed to embed ${signatureName} signature. ---`
        );
        console.error(
          `Error message: ${e.message}. The signature will be skipped.`
        );
        // Allow PDF generation to continue without this signature.
      }
    };

    console.log("PDF SERVICE: Drawing text fields...");
    drawText(data.ourReference, 115, 526, boldFont);
    drawText(data.grnNo, 300, 527, boldFont);
    drawText(data.releaseDate, 300, 509, boldFont);
    drawText(data.warehouse, 300, 492, boldFont);
    drawText(data.cargoDetails.commodity, 80, 421, boldFont);
    drawText(data.cargoDetails.shape, 198, 421, boldFont);
    drawText(data.cargoDetails.brand, 300, 421, boldFont);
    drawText(data.containerAndSealNo, 300, 465, boldFont);

    let startY = 393;
    const rowHeight = 14;
    let totalBundles = 0;

    console.log("PDF SERVICE: Drawing table rows...");
    for (const lot of data.lots) {
      if (startY < 270) break;
      drawText(lot.lotNo, 48, startY);
      drawText(lot.bundles, 186, startY);
      drawText(lot.grossWeightMt, 228, startY);
      drawText(lot.netWeightMt, 266, startY);
      totalBundles += Number(lot.bundles || 0);
      startY -= rowHeight;
    }
    console.log("PDF SERVICE: Finished drawing table rows.");

    drawText(totalBundles.toString(), 186, 254, boldFont);
    drawText(data.driverName, 32, 180, boldFont);
    drawText(data.driverIdentityNo, 125, 180, boldFont);
    drawText(data.truckPlateNo, 217, 180, boldFont);
    drawText(data.warehouseStaff, 32, 112, boldFont);
    drawText(data.warehouseSupervisor, 217, 112, boldFont);
    console.log("PDF SERVICE: Finished drawing text fields.");

    console.log("PDF SERVICE: Embedding signatures...");
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
    console.log("PDF SERVICE: Finished embedding signatures.");

    console.log("PDF SERVICE: Saving PDF to bytes...");
    const pdfBytes = await pdfDoc.save();
    const grnDir = path.join(__dirname, "../grafton-backend/grn");
    const previewDir = path.join(grnDir, "preview");
    await fs.mkdir(previewDir, { recursive: true });

    const safeGrnNo = data.grnNo.replace(/[\/\\?%*:|"<>]/g, "_");
    const pdfFileName = `GRN_${safeGrnNo}.pdf`;
    const previewImageFileName = `GRN_${safeGrnNo}_preview`; // Base name for the image

    const outputPath = path.join(grnDir, pdfFileName);
    const previewImagePath = path.join(
      previewDir,
      `${previewImageFileName}.png`
    );

    console.log(`PDF SERVICE: Writing PDF file to: ${outputPath}`);
    await fs.writeFile(outputPath, pdfBytes);

    console.log("--- PDF SERVICE: PDF generation complete. ---");

    // --- NEW: Generate Preview Image ---
    console.log(`PDF SERVICE: Generating preview image for ${outputPath}`);
    let opts = {
      format: "png",
      out_dir: previewDir,
      out_prefix: previewImageFileName,
      page: 1, // Explicitly convert only the first page
      singleFile: true, // Prevent adding the page number suffix
    };

    await poppler.convert(outputPath, opts);

    // Rename the generated file if it has a '-1' suffix
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
      console.log(
        `PDF SERVICE: Renamed ${generatedImagePath} to ${previewImagePath}`
      );
    }

    console.log(`PDF SERVICE: Preview image generated at ${previewImagePath}`);
    // --- END NEW ---

    console.log("--- PDF SERVICE: PDF and Image generation complete. ---");
    // --- MODIFICATION: Return both PDF and image paths ---
    return { pdfBytes, outputPath, previewImagePath };
  } catch (error) {
    console.error("--- PDF SERVICE FATAL ERROR during PDF generation: ---");
    console.error(error);
    throw error;
  }
}

module.exports = { generateGrnPdf };
