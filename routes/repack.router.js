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
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];
    
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Map extensions to correct MIME types
    const mimeTypeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg'
    };
    
    // Use extension-based MIME type if available, otherwise use detected type
    const actualMimeType = mimeTypeMap[ext] || file.mimetype;
    
    console.log('File details:', {
      originalname: file.originalname,
      detectedMimeType: file.mimetype,
      extension: ext,
      actualMimeType: actualMimeType
    });
    
    // Check both extension and MIME type
    if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(actualMimeType)) {
      cb(null, true);
    } else {
      const errorMsg = `Invalid file type. File: ${file.originalname}, Extension: ${ext}, MIME: ${file.mimetype}`;
      console.error(errorMsg);
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
    'repackDescription',
        'incompleteBundle',
    'noOfPieces'
  ];

  fieldsToCheck.forEach(field => {
    if (existingData[field] !== newData[field]) {
      changes[field] = newData[field];
    }
  });

  return changes;
};


const getIdsFromJobAndLot = async (jobNo, lotNo) => {
  const [inbound, lot] = await Promise.all([
    Inbound.findOne({
      where: { jobNo, lotNo },
      attributes: ['inboundId']
    }),
    Lot.findOne({
      where: { jobNo, lotNo },
      attributes: ['lotId']
    })
  ]);
  
  return { 
    inboundId: inbound ? inbound.inboundId : null,
    lotId: lot ? lot.lotId : null
  };
};

// Helper function to find related ID (inboundId if lotId is provided, or lotId if inboundId is provided)
const findRelatedId = async (providedId, isLotId) => {
  if (isLotId) {
    // If lotId is provided, find corresponding inboundId
    const lot = await Lot.findByPk(providedId);
    if (!lot) return null;
    
    const inbound = await Inbound.findOne({
      where: {
        jobNo: lot.jobNo,
        lotNo: lot.lotNo
      }
    });
    return inbound ? inbound.inboundId : null;
  } else {
    // If inboundId is provided, find corresponding lotId
    const inbound = await Inbound.findByPk(providedId);
    if (!inbound) return null;
    
    const lot = await Lot.findOne({
      where: {
        jobNo: inbound.jobNo,
        lotNo: inbound.lotNo
      }
    });
    return lot ? lot.lotId : null;
  }
};

// Common function to handle repack for both inbound and lot
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
      existingAfterImages  
    } = req.body;

    // ===== DEBUG LOGS FOR INCOMPLETE BUNDLE =====
    // console.log('=== INCOMPLETE BUNDLE DEBUG START ===');
    // console.log('Raw req.body incompleteBundle:', req.body.incompleteBundle);
    // console.log('Raw req.body noOfPieces:', req.body.noOfPieces);
    // console.log('Type of incompleteBundle:', typeof req.body.incompleteBundle);
    // console.log('Type of noOfPieces:', typeof req.body.noOfPieces);
    // console.log('=== INCOMPLETE BUNDLE DEBUG END ===');

    // Validate required fields
    if ((inboundId === undefined && lotId === undefined && (!jobNo || !lotNo)) || !noOfBundle) {
      return res.status(400).json({
        error: 'Missing required fields: either inboundId or lotId or (jobNo+lotNo), and noOfBundle'
      });
    }

    let resolvedInboundId = inboundId;
    let resolvedLotId = lotId;
    let isLotRepack = false;
    let parentRecord;

   // Resolve IDs if jobNo and lotNo are provided
    if (jobNo && lotNo) {
      const ids = await getIdsFromJobAndLot(jobNo, lotNo);
      resolvedInboundId = ids.inboundId;
      resolvedLotId = ids.lotId;
    } else {
      // NEW: Find the related ID if only one is provided
      if (resolvedInboundId && !resolvedLotId) {
        resolvedLotId = await findRelatedId(parseInt(resolvedInboundId), false);
      } else if (resolvedLotId && !resolvedInboundId) {
        resolvedInboundId = await findRelatedId(parseInt(resolvedLotId), true);
      }
    }

    const isRelabelledBool = isRelabelled === 'true';
    const isRebundledBool = isRebundled === 'true';
    const isRepackProvidedBool = isRepackProvided === 'true';

    // ===== FIXED: Handle incompleteBundle and noOfPieces properly =====
    const incompleteBundleBool = incompleteBundle === 'true';
    const noOfPiecesInt = incompleteBundleBool && noOfPieces ? parseInt(noOfPieces) : null;

    // console.log('=== PROCESSED VALUES DEBUG ===');
    // console.log('incompleteBundleBool:', incompleteBundleBool);
    // console.log('noOfPiecesInt:', noOfPiecesInt);
    // console.log('=== PROCESSED VALUES DEBUG END ===');

    // Determine which ID to use and get parent record
    if (resolvedInboundId && resolvedInboundId !== 'null') {
      parentRecord = await Inbound.findByPk(parseInt(resolvedInboundId));
      if (!parentRecord) {
        return res.status(404).json({ error: 'Inbound record not found' });
      }
      isLotRepack = false;
    } else if (resolvedLotId && resolvedLotId !== 'null') {
      parentRecord = await Lot.findByPk(parseInt(resolvedLotId));
      if (!parentRecord) {
        return res.status(404).json({ error: 'Lot record not found' });
      }
      isLotRepack = true;
    } else {
      return res.status(400).json({ error: 'Invalid ID provided' });
    }

    // ===== REMOVED DUPLICATE CODE BLOCK =====
    // The duplicate if/else block for inboundId/lotId was removed

    // Check if bundle already exists
const whereClause = {
  bundleNo: parseInt(noOfBundle),
  [Op.or]: [
    { inboundId: resolvedInboundId ? parseInt(resolvedInboundId) : null },
    { lotId: resolvedLotId ? parseInt(resolvedLotId) : null }
  ]
};

    if (isLotRepack) {
      whereClause.lotId = resolvedLotId ? parseInt(resolvedLotId) : null;
    } else {
      whereClause.inboundId = resolvedInboundId ? parseInt(resolvedInboundId) : null;
    }

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

    // FIXED: noOfMetalStrap should only be set if isRebundled is true
    const metalStrapValue = isRebundledBool && noOfMetalStrap ? parseInt(noOfMetalStrap) : null;

    const newBundleData = {
      inboundId: resolvedInboundId ? parseInt(resolvedInboundId) : null,  // Set both IDs
      lotId: resolvedLotId ? parseInt(resolvedLotId) : null,
      bundleNo: parseInt(noOfBundle),
      isRelabelled: isRelabelledBool,
      isRebundled: isRebundledBool,
      isRepackProvided: isRepackProvidedBool,
      noOfMetalStrap: metalStrapValue,
      repackDescription: repackDescription || null,
      incompleteBundle: incompleteBundleBool,
      noOfPieces: noOfPiecesInt
    };

    // console.log('=== NEW BUNDLE DATA DEBUG ===');
    // console.log('newBundleData:', JSON.stringify(newBundleData, null, 2));
    // console.log('=== NEW BUNDLE DATA DEBUG END ===');

    if (inboundBundle) {
      // console.log('=== EXISTING BUNDLE FOUND ===');
      // console.log('Existing bundle ID:', inboundBundle.inboundBundleId);
      // console.log('Existing incompleteBundle:', inboundBundle.incompleteBundle);
      // console.log('Existing noOfPieces:', inboundBundle.noOfPieces);

      // OPTIMIZATION: Only update if there are actual changes
      const existingBundleData = {
        isRelabelled: inboundBundle.isRelabelled,
        isRebundled: inboundBundle.isRebundled,
        isRepackProvided: inboundBundle.isRepackProvided,
        noOfMetalStrap: inboundBundle.noOfMetalStrap,
        repackDescription: inboundBundle.repackDescription,
        incompleteBundle: inboundBundle.incompleteBundle,
        noOfPieces: inboundBundle.noOfPieces,
      };

      // console.log('=== EXISTING BUNDLE DATA ===');
      // console.log('existingBundleData:', JSON.stringify(existingBundleData, null, 2));

      const changes = getChangedFields(existingBundleData, {
        isRelabelled: isRelabelledBool,
        isRebundled: isRebundledBool,
        isRepackProvided: isRepackProvidedBool,
        noOfMetalStrap: metalStrapValue,
        repackDescription: repackDescription || null,
        incompleteBundle: incompleteBundleBool,
        noOfPieces: noOfPiecesInt
      });

      // console.log('=== DETECTED CHANGES ===');
      // console.log('changes:', JSON.stringify(changes, null, 2));
      // console.log('Number of changes:', Object.keys(changes).length);

      // Only update if there are changes
      if (Object.keys(changes).length > 0) {
        changes.updatedAt = new Date();
        
        // console.log('=== UPDATING BUNDLE ===');
        // console.log('Bundle ID:', inboundBundle.inboundBundleId);
        // console.log('Changes to apply:', JSON.stringify(changes, null, 2));
        
        await inboundBundle.update(changes);
        
        // console.log('=== BUNDLE UPDATED SUCCESSFULLY ===');
        
        // Reload the bundle to verify changes
        await inboundBundle.reload();
        // console.log('=== RELOADED BUNDLE DATA ===');
        // console.log('Updated incompleteBundle:', inboundBundle.incompleteBundle);
        // console.log('Updated noOfPieces:', inboundBundle.noOfPieces);
        
      } else {
        console.log('No changes detected in bundle data');
      }
    } else {
      // console.log('=== CREATING NEW BUNDLE ===');
      console.log('New bundle data:', JSON.stringify(newBundleData, null, 2));
      
      // Create new bundle
      inboundBundle = await InboundBundle.create(newBundleData);
      
      // console.log('=== NEW BUNDLE CREATED ===');
      // console.log('Created bundle ID:', inboundBundle.inboundBundleId);
      // console.log('Created incompleteBundle:', inboundBundle.incompleteBundle);
      // console.log('Created noOfPieces:', inboundBundle.noOfPieces);
    }

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
        // Get jobNo and lotNo from parent record
        const parentJobNo = parentRecord.jobNo;
        const parentLotNo = parentRecord.lotNo;
        
        for (const file of beforeFiles) {
          const uniqueName = `${parentJobNo}-${parentLotNo}-${noOfBundle}/before-${uuidv4()}${path.extname(file.originalname)}`;
          const newPath = path.join(__dirname, `../uploads/img/repacked/${uniqueName}`);

          // Ensure directory exists
          const dir = path.dirname(newPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.renameSync(file.path, newPath);

          await BeforeImage.create({
            inboundId: isLotRepack ? null : parseInt(resolvedInboundId),
            lotId: isLotRepack ? parseInt(resolvedLotId) : null,
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
        // Get jobNo and lotNo from parent record
        const parentJobNo = parentRecord.jobNo;
        const parentLotNo = parentRecord.lotNo;
        
        for (const file of afterFiles) {
          const uniqueName = `${parentJobNo}-${parentLotNo}-${noOfBundle}/after-${uuidv4()}${path.extname(file.originalname)}`;
          const newPath = path.join(__dirname, `../uploads/img/repacked/${uniqueName}`);

          // Ensure directory exists
          const dir = path.dirname(newPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }

          fs.renameSync(file.path, newPath);

          await AfterImage.create({
            inboundId: isLotRepack ? null : parseInt(resolvedInboundId),
            lotId: isLotRepack ? parseInt(resolvedLotId) : null,
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

    // NEW LOGIC: Get aggregate values from ALL bundles for this parent record
    const aggregateWhereClause = isLotRepack 
      ? { lotId: parseInt(resolvedLotId) }
      : { inboundId: parseInt(resolvedInboundId) };

const allBundles = await InboundBundle.findAll({
  where: aggregateWhereClause,
  attributes: [
    'isRelabelled', 
    'isRebundled', 
    'isRepackProvided', 
    'noOfMetalStrap', 
    'repackDescription',
    'incompleteBundle',
    'noOfPieces'
  ]
});

// Calculate aggregate values
const aggregateIsRelabelled = allBundles.some(bundle => bundle.isRelabelled === true);
const aggregateIsRebundled = allBundles.some(bundle => bundle.isRebundled === true);
const aggregateIsRepackProvided = allBundles.some(bundle => bundle.isRepackProvided === true);
const aggregateIncompleteBundle = allBundles.some(bundle => bundle.incompleteBundle === true);

// For numeric fields, get the maximum value
const aggregateNoOfMetalStrap = allBundles.reduce((max, bundle) => 
  Math.max(max, bundle.noOfMetalStrap || 0), 0) || null;
const aggregateNoOfPieces = allBundles.reduce((max, bundle) => 
  Math.max(max, bundle.noOfPieces || 0), 0) || null;

// For descriptions, concatenate unique values
const aggregateRepackDescription = [...new Set(
  allBundles
    .filter(b => b.repackDescription)
    .map(b => b.repackDescription)
)].join('; ') || null;


    // testing
    // console.log('Aggregate values calculated:', {
    //   aggregateIsRelabelled,
    //   aggregateIsRebundled,
    //   aggregateIsRepackProvided,
    //   aggregateNoOfMetalStrap,
    //   aggregateRepackDescription
    // });

    // OPTIMIZATION: Only update parent record if the aggregate values are different
    const shouldUpdateParent = 
  aggregateIsRelabelled !== parentRecord.isRelabelled ||
  aggregateIsRebundled !== parentRecord.isRebundled ||
  aggregateIsRepackProvided !== parentRecord.isRepackProvided ||
  aggregateNoOfMetalStrap !== (parentRecord.noOfMetalStraps || 0) ||
  aggregateRepackDescription !== (parentRecord.repackDescription || null) ||
  aggregateIncompleteBundle !== (parentRecord.incompleteBundle || false) ||
  aggregateNoOfPieces !== (parentRecord.noOfPieces || null);

// After finding parentRecord, add this check:
if (!parentRecord) {
  return res.status(404).json({ 
    error: 'Parent record not found',
    details: isLotRepack ? 
      `Lot with ID ${resolvedLotId} not found` : 
      `Inbound with ID ${resolvedInboundId} not found`
  });
}

// testing
// console.log('=== PARENT UPDATE CHECK ===');
// console.log('shouldUpdateParent:', shouldUpdateParent);

if (shouldUpdateParent) {
  const parentUpdateData = {
    isRelabelled: aggregateIsRelabelled,
    isRebundled: aggregateIsRebundled,
    isRepackProvided: aggregateIsRepackProvided,
    noOfMetalStraps: aggregateNoOfMetalStrap,
    repackDescription: aggregateRepackDescription,
    incompleteBundle: aggregateIncompleteBundle,
    noOfPieces: aggregateNoOfPieces,
    updatedAt: new Date()
  };

  console.log('Updating parent with:', JSON.stringify(parentUpdateData, null, 2));

// Update both tables if both IDs are available
  const updatePromises = [];
  
  if (resolvedInboundId && resolvedInboundId !== 'null') {
    console.log('Updating Inbound table for ID:', resolvedInboundId);
    updatePromises.push(
      Inbound.update(parentUpdateData, {
        where: { inboundId: parseInt(resolvedInboundId) }
      })
    );
  }
  
  if (resolvedLotId && resolvedLotId !== 'null') {
    console.log('Updating Lot table for ID:', resolvedLotId);
    updatePromises.push(
      Lot.update(parentUpdateData, {
        where: { lotId: parseInt(resolvedLotId) }
      })
    );
  }
  
  // Execute all updates
  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
    console.log('Successfully updated parent records');
  } else {
    console.log('No valid IDs found for parent update');
  }
  
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

    // testing
    // console.log('=== FINAL SAVED BUNDLE ===');
    // console.log('Final bundle incompleteBundle:', savedBundle.incompleteBundle);
    // console.log('Final bundle noOfPieces:', savedBundle.noOfPieces);
    // console.log('=== FINAL SAVED BUNDLE END ===');

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
      incompleteBundle: bundle.incompleteBundle || false,
      noOfPieces: bundle.noOfPieces || null,
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
        'repackDescription',
        'incompleteBundle',
        'noOfPieces'
      ]
    });

    const isRepacked = bundle ? 
      (bundle.isRelabelled || bundle.isRebundled || bundle.isRepackProvided ||
       (bundle.noOfMetalStrap && bundle.noOfMetalStrap > 0) ||
       (bundle.repackDescription && bundle.repackDescription.trim().length > 0) ||
       bundle.incompleteBundle ||
       (bundle.noOfPieces && bundle.noOfPieces > 0)) 
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