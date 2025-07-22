const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { InboundBundle, Inbound, BeforeImage, AfterImage, Lot } = require('../models/repack.model');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/img/repacked/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const tempFilename = `${uuidv4()}${ext}`;
    console.log(`Saving temp file: ${tempFilename} (original: ${file.originalname})`);
    cb(null, tempFilename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Custom MIME type detection for PNG files
    const actualMimeType = ext === '.png' ? 'image/png' : file.mimetype;

    if (allowedMimeTypes.includes(actualMimeType) && 
        ['.jpg', '.jpeg', '.png'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .jpg, .jpeg, and .png files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// Common function to handle repack for both inbound and lot
const getChangedFields = (existingData, newData) => {
  const changes = {};
  const fieldsToCheck = [
    'isRelabelled',
    'isRebundled', 
    'isRepackProvided',
    'noOfMetalStrap',
    'repackDescription'
  ];

  fieldsToCheck.forEach(field => {
    if (existingData[field] !== newData[field]) {
      changes[field] = newData[field];
    }
  });

  return changes;
};

// Helper function to delete old image files
const deleteImageFile = (imagePath) => {
  try {
    const fullPath = path.join(__dirname, '..', imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted old image: ${imagePath}`);
    }
  } catch (error) {
    console.error(`Error deleting image ${imagePath}:`, error);
  }
};

// Common function to handle repack for both inbound and lot - OPTIMIZED VERSION
const handleRepack = async (req, res, isMobile = false) => {
  try {
    const {
      inboundId,
      lotId,
      noOfBundle,
      isRelabelled,
      isRebundled,
      isRepackProvided,
      noOfMetalStrap,
      repackDescription,
      existingBeforeImages,
      existingAfterImages  
    } = req.body;

    // Validate required fields
    if ((!inboundId && !lotId) || !noOfBundle) {
      return res.status(400).json({
        error: 'Missing required fields: either inboundId or lotId, and noOfBundle'
      });
    }

    let identifier, jobNo, lotNo, isLotRepack = false;
    let parentRecord;

    const isRelabelledBool = isRelabelled === 'true';
    const isRebundledBool = isRebundled === 'true';
    const isRepackProvidedBool = isRepackProvided === 'true';

    if (inboundId) {
      // Handle inbound repack
      parentRecord = await Inbound.findByPk(inboundId);
      if (!parentRecord) {
        return res.status(404).json({ error: 'Inbound record not found' });
      }
      identifier = inboundId;
      jobNo = parentRecord.jobNo;
      lotNo = parentRecord.lotNo;
    } else {
      // Handle lot repack
      parentRecord = await Lot.findByPk(lotId);
      if (!parentRecord) {
        return res.status(404).json({ error: 'Lot record not found' });
      }
      identifier = lotId;
      jobNo = parentRecord.jobNo;
      lotNo = parentRecord.lotNo;
      isLotRepack = true;
    }

    // Check if bundle already exists
    const whereClause = isLotRepack
      ? { lotId: parseInt(lotId), bundleNo: parseInt(noOfBundle) }
      : { inboundId: parseInt(inboundId), bundleNo: parseInt(noOfBundle) };

    let inboundBundle = await InboundBundle.findOne({ 
      where: whereClause,
      include: [
        {
          model: BeforeImage,
          as: 'beforeImages'
        },
        {
          model: AfterImage,
          as: 'afterImages'
        }
      ]
    });

    const newBundleData = {
      inboundId: isLotRepack ? null : parseInt(inboundId),
      lotId: isLotRepack ? parseInt(lotId) : null,
      bundleNo: parseInt(noOfBundle),
      isRelabelled: isRelabelledBool,
      isRebundled: isRebundledBool,
      isRepackProvided: isRepackProvidedBool,
      noOfMetalStrap: noOfMetalStrap ? parseInt(noOfMetalStrap) : null,
      repackDescription: repackDescription || null
    };

    if (inboundBundle) {
      // OPTIMIZATION: Only update if there are actual changes
      const existingBundleData = {
        isRelabelled: inboundBundle.isRelabelled,
        isRebundled: inboundBundle.isRebundled,
        isRepackProvided: inboundBundle.isRepackProvided,
        noOfMetalStrap: inboundBundle.noOfMetalStrap,
        repackDescription: inboundBundle.repackDescription
      };

      const changes = getChangedFields(existingBundleData, {
        isRelabelled: isRelabelledBool,
        isRebundled: isRebundledBool,
        isRepackProvided: isRepackProvidedBool,
        noOfMetalStrap: noOfMetalStrap ? parseInt(noOfMetalStrap) : null,
        repackDescription: repackDescription || null
      });

      // Only update if there are changes
      if (Object.keys(changes).length > 0) {
        changes.updatedAt = new Date();
        await inboundBundle.update(changes);
        console.log(`Updated bundle with changes:`, changes);
      } else {
        console.log('No changes detected in bundle data');
      }
    } else {
      // Create new bundle
      inboundBundle = await InboundBundle.create(newBundleData);
      console.log('Created new bundle');
    }

// Replace the image handling section in your handleRepack function with this improved version

// Handle image uploads only if isRepackProvided is true
if (isRepackProvidedBool) {
  // Parse existing images that should be kept
  let keepBeforeImages = [];
  let keepAfterImages = [];
  
  try {
    keepBeforeImages = existingBeforeImages ? JSON.parse(existingBeforeImages) : [];
    keepAfterImages = existingAfterImages ? JSON.parse(existingAfterImages) : [];
  } catch (error) {
    console.error('Error parsing existing images:', error);
    keepBeforeImages = [];
    keepAfterImages = [];
  }

  // Get current images from database
  const currentBeforeImages = inboundBundle.beforeImages || [];
  const currentAfterImages = inboundBundle.afterImages || [];

  // BEFORE IMAGES PROCESSING
  const beforeFiles = req.files?.beforeImage || [];
  
  // Delete before images that are NOT in the keepBeforeImages list
  for (const currentImage of currentBeforeImages) {
    const shouldKeep = keepBeforeImages.some(keepImg => 
      parseInt(keepImg.beforeImagesId) === parseInt(currentImage.beforeImagesId)
    );
    
    if (!shouldKeep) {
      // Delete from database
      await BeforeImage.destroy({
        where: { beforeImagesId: currentImage.beforeImagesId }
      });
      
      // Delete physical file
      deleteImageFile(currentImage.imageUrl);
      console.log(`Removed before image: ${currentImage.beforeImagesId}`);
    }
  }

  // Add new before images (only if there are new files uploaded)
  if (beforeFiles.length > 0) {
    for (const file of beforeFiles) {
      const uniqueName = `${jobNo}-${lotNo}-${noOfBundle}/before-${uuidv4()}${path.extname(file.originalname)}`;
      const newPath = path.join(__dirname, `../uploads/img/repacked/${uniqueName}`);

      // Ensure directory exists
      const dir = path.dirname(newPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.renameSync(file.path, newPath);

      await BeforeImage.create({
        inboundId: isLotRepack ? null : parseInt(inboundId),
        lotId: isLotRepack ? parseInt(lotId) : null,
        inboundBundleId: inboundBundle.inboundBundleId,
        imageUrl: `uploads/img/repacked/${uniqueName}`,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`Added new before image: ${uniqueName}`);
    }
  }

  // AFTER IMAGES PROCESSING
  const afterFiles = req.files?.afterImage || [];
  
  // Delete after images that are NOT in the keepAfterImages list
  for (const currentImage of currentAfterImages) {
    const shouldKeep = keepAfterImages.some(keepImg => 
      parseInt(keepImg.afterImagesId) === parseInt(currentImage.afterImagesId)
    );
    
    if (!shouldKeep) {
      // Delete from database
      await AfterImage.destroy({
        where: { afterImagesId: currentImage.afterImagesId }
      });
      
      // Delete physical file
      deleteImageFile(currentImage.imageUrl);
      console.log(`Removed after image: ${currentImage.afterImagesId}`);
    }
  }

  // Add new after images (only if there are new files uploaded)
  if (afterFiles.length > 0) {
    for (const file of afterFiles) {
      const uniqueName = `${jobNo}-${lotNo}-${noOfBundle}/after-${uuidv4()}${path.extname(file.originalname)}`;
      const newPath = path.join(__dirname, `../uploads/img/repacked/${uniqueName}`);

      // Ensure directory exists
      const dir = path.dirname(newPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.renameSync(file.path, newPath);

      await AfterImage.create({
        inboundId: isLotRepack ? null : parseInt(inboundId),
        lotId: isLotRepack ? parseInt(lotId) : null,
        inboundBundleId: inboundBundle.inboundBundleId,
        imageUrl: `uploads/img/repacked/${uniqueName}`,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`Added new after image: ${uniqueName}`);
    }
  }
} else {
  // If isRepackProvided is false, remove all existing images
  if (inboundBundle) {
    const existingBeforeImages = await BeforeImage.findAll({
      where: { inboundBundleId: inboundBundle.inboundBundleId }
    });
    
    const existingAfterImages = await AfterImage.findAll({
      where: { inboundBundleId: inboundBundle.inboundBundleId }
    });

    // Delete all before images
    for (const image of existingBeforeImages) {
      deleteImageFile(image.imageUrl);
    }
    await BeforeImage.destroy({
      where: { inboundBundleId: inboundBundle.inboundBundleId }
    });

    // Delete all after images
    for (const image of existingAfterImages) {
      deleteImageFile(image.imageUrl);
    }
    await AfterImage.destroy({
      where: { inboundBundleId: inboundBundle.inboundBundleId }
    });
    
    console.log('Removed all images as isRepackProvided is false');
  }
}
    // OPTIMIZATION: Only update parent record if needed
    const shouldUpdateParent = inboundBundle.isRepackProvided !== parentRecord.isRepackProvided ||
                              inboundBundle.isRelabelled !== parentRecord.isRelabelled ||
                              inboundBundle.isRebundled !== parentRecord.isRebundled;

    if (shouldUpdateParent) {
      const parentUpdateData = {
        isRelabelled: isRelabelledBool,
        isRebundled: isRebundledBool,
        isRepackProvided: isRepackProvidedBool,
        noOfMetalStraps: noOfMetalStrap ? parseInt(noOfMetalStrap) : null,
        repackDescription: repackDescription || null,
        updatedAt: new Date()
      };

      if (inboundId) {
        await Inbound.update(parentUpdateData, {
          where: { inboundId: parseInt(inboundId) }
        });
      } else if (lotId) {
        await Lot.update(parentUpdateData, {
          where: { lotId: parseInt(lotId) }
        });
      }
      
      console.log('Updated parent record');
    } else {
      console.log('No changes needed for parent record');
    }

    // Return the saved bundle with images
    const savedBundle = await InboundBundle.findByPk(inboundBundle.inboundBundleId, {
      include: [
        {
          model: BeforeImage,
          as: 'beforeImages'
        },
        {
          model: AfterImage,
          as: 'afterImages'
        }
      ]
    });

    res.status(200).json({
      message: 'Bundle repack saved successfully',
      data: savedBundle
    });

  } catch (error) {
    console.error('Error in bundle repack:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};

// POST /api/bundle-repack (Desktop)
router.post('/desktop/bundle-repack', upload.fields([
  { name: 'beforeImage', maxCount: 10 },
  { name: 'afterImage', maxCount: 10 }
]), async (req, res) => {
  await handleRepack(req, res, false);
});

// POST /api/bundle-repack (Mobile)
router.post('/mobile/bundle-repack', upload.fields([
  { name: 'beforeImage', maxCount: 10 },
  { name: 'afterImage', maxCount: 10 }
]), async (req, res) => {
  await handleRepack(req, res, true);
});

// GET /api/bundle-repack/:type/:id/:bundleNo
// In your GET /api/bundle-repack/:type/:id/:bundleNo route
router.get('/bundle-repack/:type/:id/:bundleNo', async (req, res) => {
  try {
    const { type, id, bundleNo } = req.params;

    if (!['inbound', 'lot'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be "inbound" or "lot"' });
    }

    const whereClause = {
      bundleNo: parseInt(bundleNo)
    };

    if (type === 'inbound') {
      whereClause.inboundId = parseInt(id);
    } else {
      whereClause.lotId = parseInt(id);
    }

    const bundle = await InboundBundle.findOne({
      where: whereClause,
      include: [
        {
          model: BeforeImage,
          as: 'beforeImages',
          attributes: ['beforeImagesId', 'imageUrl', 'createdAt']
        },
        {
          model: AfterImage,
          as: 'afterImages',
          attributes: ['afterImagesId', 'imageUrl', 'createdAt']
        },
        {
          model: Inbound,
          as: 'inbound',
          attributes: ['jobNo', 'lotNo'],
          required: type === 'inbound'
        },
        {
          model: Lot,
          as: 'lot',
          attributes: ['jobNo', 'lotNo'],
          required: type === 'lot'
        }
      ]
    });

    if (!bundle) {
      return res.status(200).json({
        message: 'No bundle found',
        data: null // Explicitly return null when no data exists
      });
    }

    // Prepare the response data
    const responseData = {
      inboundBundleId: bundle.inboundBundleId,
      inboundId: bundle.inboundId,
      lotId: bundle.lotId,
      bundleNo: bundle.bundleNo,
      isRelabelled: bundle.isRelabelled,
      isRebundled: bundle.isRebundled,
      isRepackProvided: bundle.isRepackProvided,
      noOfMetalStrap: bundle.noOfMetalStrap,
      repackDescription: bundle.repackDescription,
      beforeImages: bundle.beforeImages?.map(img => ({
        beforeImagesId: img.beforeImagesId,
        imageUrl: img.imageUrl,
        createdAt: img.createdAt
      })) || [],
      afterImages: bundle.afterImages?.map(img => ({
        afterImagesId: img.afterImagesId,
        imageUrl: img.imageUrl,
        createdAt: img.createdAt
      })) || [],
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt
    };

    res.status(200).json({
      message: 'Bundle found',
      data: responseData
    });

  } catch (error) {
    console.error('Error fetching bundle:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// FOR ACTUAL WEIGHT SCREEN BUT FOR REPACK
router.get('/check-repack/:type/:id/:bundleNo', async (req, res) => {
  try {
    const { type, id, bundleNo } = req.params;

    if (!['inbound', 'lot'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be "inbound" or "lot"' });
    }

    const whereClause = {
      bundleNo: parseInt(bundleNo)
    };

    if (type === 'inbound') {
      whereClause.inboundId = parseInt(id);
    } else {
      whereClause.lotId = parseInt(id);
    }

    const bundle = await InboundBundle.findOne({
      where: whereClause,
      attributes: [
        'isRelabelled',
        'isRebundled',
        'isRepackProvided',
        'noOfMetalStrap',
        'repackDescription'
      ]
    });

    const isRepacked = bundle ? 
      (bundle.isRelabelled || bundle.isRebundled || bundle.isRepackProvided ||
       (bundle.noOfMetalStrap && bundle.noOfMetalStrap > 0) ||
       (bundle.repackDescription && bundle.repackDescription.trim().length > 0)) 
      : false;

    res.status(200).json({
      isRepacked,
      bundleData: bundle
    });

  } catch (error) {
    console.error('Error checking repack status:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;