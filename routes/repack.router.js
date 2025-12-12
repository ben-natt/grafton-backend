const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  InboundBundle,
  Inbound,
  BeforeImage,
  AfterImage,
  Lot,
  BundlePieces,
  sequelize,
} = require("../models/repack.model");
const { Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/img/repacked/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const tempFilename = `${uuidv4()}${ext}`;
    cb(null, tempFilename);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/heic",
    ];
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".heic"];

    const ext = path.extname(file.originalname).toLowerCase();

    // Map extensions to correct MIME types
    const mimeTypeMap = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".heic": "image/heic",
    };

    // Use extension-based MIME type if available, otherwise use detected type
    const actualMimeType = mimeTypeMap[ext] || file.mimetype;

    // Check both extension and MIME type
    if (
      allowedExtensions.includes(ext) &&
      allowedMimeTypes.includes(actualMimeType)
    ) {
      cb(null, true);
    } else {
      const errorMsg = `Invalid file type. File: ${file.originalname}, Extension: ${ext}, MIME: ${file.mimetype}`;
      console.error(errorMsg);
      cb(new Error("Only jpg, jpeg, png, and heic files are allowed!"), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// Common function to handle repack for both inbound and lot
const getChangedFields = (existingData, newData) => {
  const changes = {};
  const fieldsToCheck = [
    "isRelabelled",
    "isRebundled",
    "isRepackProvided",
    "noOfMetalStrap",
    "repackDescription",
    "incompleteBundle",
    "noOfPieces",
  ];

  fieldsToCheck.forEach((field) => {
    if (existingData[field] !== newData[field]) {
      changes[field] = newData[field];
    }
  });

  return changes;
};

// Helper function to get IDs from jobNo and lotNo
const getIdsFromJobAndLot = async (jobNo, lotNo) => {
  const [inbound, lot] = await Promise.all([
    Inbound.findOne({
      where: { jobNo, lotNo },
      attributes: ["inboundId"],
    }),
    Lot.findOne({
      where: { jobNo, lotNo },
      attributes: ["lotId"],
    }),
  ]);

  return {
    inboundId: inbound ? inbound.inboundId : null,
    lotId: lot ? lot.lotId : null,
  };
};

// Helper function to find related ID (inboundId if lotId is provided, or lotId if inboundId is provided)
const findRelatedId = async (providedId, isLotId) => {
  if (isLotId) {
    const lot = await Lot.findByPk(providedId);
    if (!lot) return null;

    const inbound = await Inbound.findOne({
      where: {
        jobNo: lot.jobNo,
        lotNo: lot.lotNo,
      },
    });
    return inbound ? inbound.inboundId : null;
  } else {
    const inbound = await Inbound.findByPk(providedId);
    if (!inbound) return null;

    const lot = await Lot.findOne({
      where: {
        jobNo: inbound.jobNo,
        lotNo: inbound.lotNo,
      },
    });
    return lot ? lot.lotId : null;
  }
};

const handleRepack = async (req, res, isMobile = false) => {
  try {
    let {
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
      existingBeforeImages,
      existingAfterImages,
      pieceEntries,
    } = req.body;

    // Validate required fields
    if ((!inboundId && !lotId && (!jobNo || !lotNo)) || !noOfBundle) {
      return res.status(400).json({
        error:
          "Missing required fields: either inboundId or lotId or (jobNo+lotNo), and noOfBundle",
      });
    }

    let resolvedInboundId = inboundId;
    let resolvedLotId = lotId;
    let isLotRepack = false;
    let parentRecord;

    // Resolve IDs if jobNo and lotNo are provided
    if (jobNo && lotNo && (!inboundId || !lotId)) {
      const ids = await getIdsFromJobAndLot(jobNo, lotNo);
      resolvedInboundId = ids.inboundId;
      resolvedLotId = ids.lotId;
    } else {
      // Find the related ID if only one is provided (but don't fail if not found)
      if (resolvedInboundId && !resolvedLotId) {
        resolvedLotId = await findRelatedId(parseInt(resolvedInboundId), false);
        // Don't fail if lotId is not found - some inbound records might not have lots
      } else if (resolvedLotId && !resolvedInboundId) {
        resolvedInboundId = await findRelatedId(parseInt(resolvedLotId), true);
        // Don't fail if inboundId is not found - some lot records might not have inbound
      }
    }

    // Convert string booleans to actual booleans
    const isRelabelledBool = isRelabelled === "true";
    const isRebundledBool = isRebundled === "true";
    const isRepackProvidedBool = isRepackProvided === "true";
    const incompleteBundleBool = incompleteBundle === "true";
    const noOfPiecesInt =
      incompleteBundleBool && noOfPieces ? parseInt(noOfPieces) : null;

    // Determine parent record and repack type
    // Priority: if inboundId exists, use it; otherwise use lotId
    if (resolvedInboundId && resolvedInboundId !== "null") {
      parentRecord = await Inbound.findByPk(parseInt(resolvedInboundId));
      if (parentRecord) {
        isLotRepack = false;
      } else if (resolvedLotId && resolvedLotId !== "null") {
        // If inbound record doesn't exist, try lot record
        parentRecord = await Lot.findByPk(parseInt(resolvedLotId));
        if (parentRecord) {
          isLotRepack = true;
          resolvedInboundId = null; // Set to null since inbound doesn't exist
        }
      }
    } else if (resolvedLotId && resolvedLotId !== "null") {
      parentRecord = await Lot.findByPk(parseInt(resolvedLotId));
      if (parentRecord) {
        isLotRepack = true;
      }
    }

    if (!parentRecord) {
      return res
        .status(404)
        .json({ error: "Neither Inbound nor Lot record found" });
    }

    // Build the where clause for finding/creating bundle
    const whereClause = {
      bundleNo: parseInt(noOfBundle),
    };

    // Add the appropriate ID to the where clause
    if (isLotRepack) {
      whereClause.lotId = parseInt(resolvedLotId);
      if (resolvedInboundId && resolvedInboundId !== "null") {
        whereClause.inboundId = parseInt(resolvedInboundId);
      } else {
        whereClause.inboundId = null;
      }
    } else {
      whereClause.inboundId = parseInt(resolvedInboundId);
      if (resolvedLotId && resolvedLotId !== "null") {
        whereClause.lotId = parseInt(resolvedLotId);
      } else {
        whereClause.lotId = null;
      }
    }

    let inboundBundle = await InboundBundle.findOne({
      where: whereClause,
      include: [
        { model: BeforeImage, as: "beforeImages" },
        { model: AfterImage, as: "afterImages" },
        { model: BundlePieces, as: "pieceEntries" },
      ],
    });

    const metalStrapValue =
      isRebundledBool && noOfMetalStrap ? parseInt(noOfMetalStrap) : null;

    const newBundleData = {
      inboundId:
        resolvedInboundId && resolvedInboundId !== "null"
          ? parseInt(resolvedInboundId)
          : null,
      lotId:
        resolvedLotId && resolvedLotId !== "null"
          ? parseInt(resolvedLotId)
          : null,
      bundleNo: parseInt(noOfBundle),
      isRelabelled: isRelabelledBool,
      isRebundled: isRebundledBool,
      isRepackProvided: isRepackProvidedBool,
      noOfMetalStrap: metalStrapValue,
      repackDescription: repackDescription || null,
      incompleteBundle: incompleteBundleBool,
      noOfPieces: noOfPiecesInt,
    };

    if (inboundBundle) {
      const existingBundleData = {
        isRelabelled: inboundBundle.isRelabelled,
        isRebundled: inboundBundle.isRebundled,
        isRepackProvided: inboundBundle.isRepackProvided,
        noOfMetalStrap: inboundBundle.noOfMetalStrap,
        repackDescription: inboundBundle.repackDescription,
        incompleteBundle: inboundBundle.incompleteBundle,
        noOfPieces: inboundBundle.noOfPieces,
      };

      const changes = getChangedFields(existingBundleData, {
        isRelabelled: isRelabelledBool,
        isRebundled: isRebundledBool,
        isRepackProvided: isRepackProvidedBool,
        noOfMetalStrap: metalStrapValue,
        repackDescription: repackDescription || null,
        incompleteBundle: incompleteBundleBool,
        noOfPieces: noOfPiecesInt,
      });

      if (Object.keys(changes).length > 0) {
        changes.updatedAt = new Date();
        await inboundBundle.update(changes);
        await inboundBundle.reload();
      }
    } else {
      inboundBundle = await InboundBundle.create(newBundleData);
    }

    const bundleId = inboundBundle.inboundBundleId;
    let incomingPieces = [];
    try {
      // Parse the JSON string of pieces
      incomingPieces = JSON.parse(pieceEntries || "[]");
    } catch (e) {
      console.error("Error parsing pieceEntries:", e);
    }

    await BundlePieces.destroy({
      where: { bundleid: bundleId },
    });

    // 2. Create new pieces
    if (Array.isArray(incomingPieces) && incomingPieces.length > 0) {
      const pieceRecords = incomingPieces
        .filter((p) => p.type && p.type.trim() !== "" && p.quantity) // Ensure data is valid
        .map((p) => ({
          bundleid: bundleId,
          piecetype: p.type.trim(),
          quantity: parseInt(p.quantity),
        }));

      if (pieceRecords.length > 0) {
        // Create new records
        await BundlePieces.bulkCreate(pieceRecords);
      }
    }

    // Handle image uploads if isRepackProvided is true
    if (isRepackProvidedBool) {
      let keepBeforeImages = [];
      let keepAfterImages = [];

      try {
        keepBeforeImages = existingBeforeImages
          ? JSON.parse(existingBeforeImages)
          : [];
        keepAfterImages = existingAfterImages
          ? JSON.parse(existingAfterImages)
          : [];
      } catch (error) {
        console.error("Error parsing existing images:", error);
      }

      // Process before images
      const beforeFiles = req.files?.beforeImage || [];
      const currentBeforeImages = inboundBundle.beforeImages || [];

      for (const currentImage of currentBeforeImages) {
        const shouldKeep = keepBeforeImages.some(
          (keepImg) =>
            parseInt(keepImg.beforeImagesId) ===
            parseInt(currentImage.beforeImagesId)
        );

        if (!shouldKeep) {
          await BeforeImage.destroy({
            where: { beforeImagesId: currentImage.beforeImagesId },
          });
          deleteImageFile(currentImage.imageUrl);
        }
      }

      if (beforeFiles.length > 0) {
        const parentJobNo = parentRecord.jobNo;
        const parentLotNo = parentRecord.lotNo;

        for (const file of beforeFiles) {
          const uniqueName = `${parentJobNo}-${parentLotNo}-${noOfBundle}/before-${uuidv4()}${path.extname(
            file.originalname
          )}`;
          const newPath = path.join(
            __dirname, 
            `../uploads/img/repacked/${uniqueName}`
          );

          fs.mkdirSync(path.dirname(newPath), { recursive: true });
          fs.renameSync(file.path, newPath);

          await BeforeImage.create({
            inboundId:
              resolvedInboundId && resolvedInboundId !== "null"
                ? parseInt(resolvedInboundId)
                : null,
            lotId:
              resolvedLotId && resolvedLotId !== "null"
                ? parseInt(resolvedLotId)
                : null,
            inboundBundleId: inboundBundle.inboundBundleId,
            imageUrl: `uploads/img/repacked/${uniqueName}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // Process after images
      const afterFiles = req.files?.afterImage || [];
      const currentAfterImages = inboundBundle.afterImages || [];

      for (const currentImage of currentAfterImages) {
        const shouldKeep = keepAfterImages.some(
          (keepImg) =>
            parseInt(keepImg.afterImagesId) ===
            parseInt(currentImage.afterImagesId)
        );

        if (!shouldKeep) {
          await AfterImage.destroy({
            where: { afterImagesId: currentImage.afterImagesId },
          });
          deleteImageFile(currentImage.imageUrl);
        }
      }

      if (afterFiles.length > 0) {
        const parentJobNo = parentRecord.jobNo;
        const parentLotNo = parentRecord.lotNo;

        for (const file of afterFiles) {
          const uniqueName = `${parentJobNo}-${parentLotNo}-${noOfBundle}/after-${uuidv4()}${path.extname(
            file.originalname
          )}`;
          const newPath = path.join(
            __dirname,
            `../uploads/img/repacked/${uniqueName}`
          );

          fs.mkdirSync(path.dirname(newPath), { recursive: true });
          fs.renameSync(file.path, newPath);

          await AfterImage.create({
            inboundId:
              resolvedInboundId && resolvedInboundId !== "null"
                ? parseInt(resolvedInboundId)
                : null,
            lotId:
              resolvedLotId && resolvedLotId !== "null"
                ? parseInt(resolvedLotId)
                : null,
            inboundBundleId: inboundBundle.inboundBundleId,
            imageUrl: `uploads/img/repacked/${uniqueName}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
    } else {
      // Remove all images if isRepackProvided is false
      if (inboundBundle) {
        const [existingBeforeImages, existingAfterImages] = await Promise.all([
          BeforeImage.findAll({
            where: { inboundBundleId: inboundBundle.inboundBundleId },
          }),
          AfterImage.findAll({
            where: { inboundBundleId: inboundBundle.inboundBundleId },
          }),
        ]);

        await Promise.all([
          BeforeImage.destroy({
            where: { inboundBundleId: inboundBundle.inboundBundleId },
          }),
          AfterImage.destroy({
            where: { inboundBundleId: inboundBundle.inboundBundleId },
          }),
        ]);

        [...existingBeforeImages, ...existingAfterImages].forEach((img) =>
          deleteImageFile(img.imageUrl)
        );
      }
    }

    // Update parent records with aggregate values
    const updatePromises = [];

    if (resolvedInboundId && resolvedInboundId !== "null") {
      const allInboundBundles = await InboundBundle.findAll({
        where: { inboundId: parseInt(resolvedInboundId) },
        attributes: [
          "isRelabelled",
          "isRebundled",
          "isRepackProvided",
          "noOfMetalStrap",
          "repackDescription",
          "incompleteBundle",
          "noOfPieces",
        ],
      });

      const inboundAggregateValues = {
        isRelabelled: allInboundBundles.some((b) => b.isRelabelled),
        isRebundled: allInboundBundles.some((b) => b.isRebundled),
        isRepackProvided: allInboundBundles.some((b) => b.isRepackProvided),
        noOfMetalStraps:
          allInboundBundles.reduce(
            (max, b) => Math.max(max, b.noOfMetalStrap || 0),
            0
          ) || null,
        repackDescription:
          [
            ...new Set(
              allInboundBundles
                .filter((b) => b.repackDescription)
                .map((b) => b.repackDescription)
            ),
          ].join("; ") || null,
        incompleteBundle: allInboundBundles.some((b) => b.incompleteBundle),
        noOfPieces:
          allInboundBundles.reduce(
            (max, b) => Math.max(max, b.noOfPieces || 0),
            0
          ) || null,
      };

      updatePromises.push(
        Inbound.update(inboundAggregateValues, {
          where: { inboundId: parseInt(resolvedInboundId) },
        })
      );
    }

    if (resolvedLotId && resolvedLotId !== "null") {
      const allLotBundles = await InboundBundle.findAll({
        where: { lotId: parseInt(resolvedLotId) },
        attributes: [
          "isRelabelled",
          "isRebundled",
          "isRepackProvided",
          "noOfMetalStrap",
          "repackDescription",
          "incompleteBundle",
          "noOfPieces",
        ],
      });

      const lotAggregateValues = {
        isRelabelled: allLotBundles.some((b) => b.isRelabelled),
        isRebundled: allLotBundles.some((b) => b.isRebundled),
        isRepackProvided: allLotBundles.some((b) => b.isRepackProvided),
        noOfMetalStraps:
          allLotBundles.reduce(
            (max, b) => Math.max(max, b.noOfMetalStrap || 0),
            0
          ) || null,
        repackDescription:
          [
            ...new Set(
              allLotBundles
                .filter((b) => b.repackDescription)
                .map((b) => b.repackDescription)
            ),
          ].join("; ") || null,
        incompleteBundle: allLotBundles.some((b) => b.incompleteBundle),
        noOfPieces:
          allLotBundles.reduce(
            (max, b) => Math.max(max, b.noOfPieces || 0),
            0
          ) || null,
      };

      updatePromises.push(
        Lot.update(lotAggregateValues, {
          where: { lotId: parseInt(resolvedLotId) },
        })
      );
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // Return the saved bundle
    const savedBundle = await InboundBundle.findByPk(
      inboundBundle.inboundBundleId,
      {
        include: [
          { model: BeforeImage, as: "beforeImages" },
          { model: AfterImage, as: "afterImages" },
          { model: BundlePieces, as: "pieceEntries" },
        ],
      }
    );

    res.status(200).json({
      message: "Bundle repack saved successfully",
      data: savedBundle,
    });
  } catch (error) {
    console.error("Error in bundle repack:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
};

// Helper function to delete old image files
const deleteImageFile = (imagePath) => {
  try {
    const fullPath = path.join(__dirname, "..", imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (error) {
    console.error(`Error deleting image ${imagePath}:`, error);
  }
};

// POST /api/bundle-repack (Desktop)
router.post(
  "/desktop/bundle-repack",
  upload.fields([
    { name: "beforeImage", maxCount: 10 },
    { name: "afterImage", maxCount: 10 },
  ]),
  async (req, res) => {
    await handleRepack(req, res, false);
  }
);

// POST /api/bundle-repack (Mobile)
router.post(
  "/mobile/bundle-repack",
  upload.fields([
    { name: "beforeImage", maxCount: 10 },
    { name: "afterImage", maxCount: 10 },
  ]),
  async (req, res) => {
    await handleRepack(req, res, true);
  }
);

router.get("/bundle-repack/:type/:id/:bundleNo", async (req, res) => {
  try {
    const { type, id, bundleNo } = req.params;
    const { jobNo, lotNo } = req.query;

    if (!["inbound", "lot"].includes(type)) {
      return res
        .status(400)
        .json({ error: 'Invalid type. Must be "inbound" or "lot"' });
    }

    let whereClause = { bundleNo: parseInt(bundleNo) };
    let includeClause = [
      { model: BeforeImage, as: "beforeImages" },
      { model: AfterImage, as: "afterImages" },
      { model: BundlePieces, as: "pieceEntries" }, // Include piece entries
    ];

    // Handle ID resolution
    if (id !== "null" && id !== "undefined" && !isNaN(parseInt(id))) {
      // Direct ID provided
      if (type === "inbound") {
        whereClause.inboundId = parseInt(id);
        // Try to find related lotId
        const inbound = await Inbound.findByPk(parseInt(id));
        if (inbound && inbound.jobNo && inbound.lotNo) {
          const lot = await Lot.findOne({
            where: { jobNo: inbound.jobNo, lotNo: inbound.lotNo },
          });
          if (lot) {
            whereClause = {
              bundleNo: parseInt(bundleNo),
              [Op.or]: [{ inboundId: parseInt(id) }, { lotId: lot.lotId }],
            };
          }
        }
      } else {
        whereClause.lotId = parseInt(id);
        // Try to find related inboundId
        const lot = await Lot.findByPk(parseInt(id));
        if (lot && lot.jobNo && lot.lotNo) {
          const inbound = await Inbound.findOne({
            where: { jobNo: lot.jobNo, lotNo: lot.lotNo },
          });
          if (inbound) {
            whereClause = {
              bundleNo: parseInt(bundleNo),
              [Op.or]: [
                { lotId: parseInt(id) },
                { inboundId: inbound.inboundId },
              ],
            };
          }
        }
      }
    } else if (jobNo && lotNo) {
      // Use jobNo and lotNo to find records
      const [inbound, lot] = await Promise.all([
        Inbound.findOne({ where: { jobNo, lotNo } }),
        Lot.findOne({ where: { jobNo, lotNo } }),
      ]);

      if (inbound && lot) {
        // Both exist
        whereClause = {
          bundleNo: parseInt(bundleNo),
          [Op.or]: [{ inboundId: inbound.inboundId }, { lotId: lot.lotId }],
        };
      } else if (inbound) {
        // Only inbound exists
        whereClause.inboundId = inbound.inboundId;
      } else if (lot) {
        // Only lot exists
        whereClause.lotId = lot.lotId;
      } else {
        // Neither exists
        return res.status(200).json({
          message: "No bundle found",
          data: null,
        });
      }
    } else {
      return res.status(400).json({ error: "Invalid parameters provided" });
    }

    const bundle = await InboundBundle.findOne({
      where: whereClause,
      include: includeClause,
    });

    if (!bundle) {
      return res.status(200).json({
        message: "No bundle found",
        data: null,
      });
    }

    res.status(200).json({
      message: "Bundle found",
      data: {
        inboundBundleId: bundle.inboundBundleId,
        inboundId: bundle.inboundId,
        lotId: bundle.lotId,
        bundleNo: bundle.bundleNo,
        isRelabelled: bundle.isRelabelled,
        isRebundled: bundle.isRebundled,
        isRepackProvided: bundle.isRepackProvided,
        noOfMetalStrap: bundle.noOfMetalStrap,
        repackDescription: bundle.repackDescription,
        incompleteBundle: bundle.incompleteBundle || false,
        noOfPieces: bundle.noOfPieces || null,
        beforeImages:
          bundle.beforeImages?.map((img) => ({
            beforeImagesId: img.beforeImagesId,
            imageUrl: img.imageUrl,
            createdAt: img.createdAt,
          })) || [],
        afterImages:
          bundle.afterImages?.map((img) => ({
            afterImagesId: img.afterImagesId,
            imageUrl: img.imageUrl,
            createdAt: img.createdAt,
          })) || [],
        pieceEntries:
          bundle.pieceEntries?.map((p) => ({
            pieceid: p.pieceid,
            piecetype: p.piecetype,
            quantity: p.quantity,
          })) || [],
      },
    });
  } catch (error) {
    console.error("Error fetching bundle:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

// Also update the check-repack route
router.get("/check-repack/:type/:id/:bundleNo", async (req, res) => {
  try {
    const { type, id, bundleNo } = req.params;
    const { jobNo, lotNo } = req.query;

    if (!["inbound", "lot"].includes(type)) {
      return res
        .status(400)
        .json({ error: 'Invalid type. Must be "inbound" or "lot"' });
    }

    let whereClause = { bundleNo: parseInt(bundleNo) };

    // Handle ID resolution - similar to above
    if (id !== "null" && id !== "undefined" && !isNaN(parseInt(id))) {
      if (type === "inbound") {
        whereClause.inboundId = parseInt(id);
        // Try to find related lotId
        const inbound = await Inbound.findByPk(parseInt(id));
        if (inbound && inbound.jobNo && inbound.lotNo) {
          const lot = await Lot.findOne({
            where: { jobNo: inbound.jobNo, lotNo: inbound.lotNo },
          });
          if (lot) {
            whereClause = {
              bundleNo: parseInt(bundleNo),
              [Op.or]: [{ inboundId: parseInt(id) }, { lotId: lot.lotId }],
            };
          }
        }
      } else {
        whereClause.lotId = parseInt(id);
        // Try to find related inboundId
        const lot = await Lot.findByPk(parseInt(id));
        if (lot && lot.jobNo && lot.lotNo) {
          const inbound = await Inbound.findOne({
            where: { jobNo: lot.jobNo, lotNo: lot.lotNo },
          });
          if (inbound) {
            whereClause = {
              bundleNo: parseInt(bundleNo),
              [Op.or]: [
                { lotId: parseInt(id) },
                { inboundId: inbound.inboundId },
              ],
            };
          }
        }
      }
    } else if (jobNo && lotNo) {
      const [inbound, lot] = await Promise.all([
        Inbound.findOne({ where: { jobNo, lotNo } }),
        Lot.findOne({ where: { jobNo, lotNo } }),
      ]);

      if (inbound && lot) {
        whereClause = {
          bundleNo: parseInt(bundleNo),
          [Op.or]: [{ inboundId: inbound.inboundId }, { lotId: lot.lotId }],
        };
      } else if (inbound) {
        whereClause.inboundId = inbound.inboundId;
      } else if (lot) {
        whereClause.lotId = lot.lotId;
      } else {
        return res.status(200).json({
          isRepacked: false,
          bundleData: null,
        });
      }
    }

    const bundle = await InboundBundle.findOne({
      where: whereClause,
      attributes: [
        "isRelabelled",
        "isRebundled",
        "isRepackProvided",
        "noOfMetalStrap",
        "repackDescription",
        "incompleteBundle",
        "noOfPieces",
      ],
    });

    const isRepacked = bundle
      ? bundle.isRelabelled ||
        bundle.isRebundled ||
        bundle.isRepackProvided ||
        bundle.noOfMetalStrap > 0 ||
        bundle.repackDescription ||
        bundle.incompleteBundle ||
        bundle.noOfPieces > 0
      : false;

    res.status(200).json({
      isRepacked,
      bundleData: bundle,
    });
  } catch (error) {
    console.error("Error checking repack status:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

router.get("/piecetypes", async (req, res) => {
  try {
    const customTypes = await BundlePieces.findAll({
      attributes: [
        // Use sequelize.fn to get distinct values
        [sequelize.fn("DISTINCT", sequelize.col("piecetype")), "piecetype"],
      ],
      where: {
        piecetype: {
          [Op.ne]: null, // Not null
          [Op.ne]: "", // Not empty string
        },
      },
      order: [["piecetype", "ASC"]],
    });

    // Map the array of objects to an array of strings
    const typeNames = customTypes.map((t) => t.piecetype);

    res.status(200).json({
      success: true,
      data: typeNames,
    });
  } catch (error) {
    console.error("Error fetching piece types:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});

module.exports = router;
