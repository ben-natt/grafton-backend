const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { InboundBundle, Inbound, BeforeImage, AfterImage } = require('../models/repack.model');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid'); // Make sure you import this at the top
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
    console.log('Received file:', file.originalname, 'Mimetype:', file.mimetype);
    
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // Limit file size to 5MB
  }
});

// POST /api/bundle-repack
router.post('/desktop/bundle-repack', upload.fields([
  { name: 'beforeImage', maxCount: 10 },
  { name: 'afterImage', maxCount: 10 }
]), async (req, res) => {
  try {
    const {
      inboundId,
      noOfBundle,
      isRelabelled,
      isRebundled,
      isRepackProvided,
      noOfMetalStrap,
    } = req.body;

    // Validate required fields
    if (!inboundId || !noOfBundle) {
      return res.status(400).json({
        error: 'Missing required fields: inboundId, noOfBundle,'
      });
    }

    // Get inbound record for jobNo and lotNo
    const inbound = await Inbound.findByPk(inboundId);
    if (!inbound) {
      return res.status(404).json({ error: 'Inbound record not found' });
    }

    const { jobNo, lotNo } = inbound;

    // Check if bundle already exists
    let inboundBundle = await InboundBundle.findOne({
      where: {
        inboundId: parseInt(inboundId),
        bundleNo: parseInt(noOfBundle)
      }
    });

    const bundleData = {
      inboundId: parseInt(inboundId),
      bundleNo: parseInt(noOfBundle),
      isRelabelled: isRelabelled === 'true',
      isRebundled: isRebundled === 'true',
      isRepackProvided: isRepackProvided === 'true',
      noOfMetalStrap: noOfMetalStrap ? parseInt(noOfMetalStrap) : null,
    };

    if (inboundBundle) {
      // Update existing bundle
      await inboundBundle.update(bundleData);
    } else {
      // Create new bundle
      inboundBundle = await InboundBundle.create(bundleData);
    }

    // Handle image uploads only if isRepackProvided is true
    if (isRepackProvided === 'true') {
      const beforeFiles = req.files?.beforeImage || [];
      const afterFiles = req.files?.afterImage || [];

      // Process before images
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
          inboundId: parseInt(inboundId),
          inboundBundleId: inboundBundle.inboundBundleId,
          imageUrl: `uploads/img/repacked/${uniqueName}`,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // Process after images
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
          inboundId: parseInt(inboundId),
          inboundBundleId: inboundBundle.inboundBundleId,
          imageUrl: `uploads/img/repacked/${uniqueName}`,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
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
});

// POST /api/bundle-repack
router.post('/mobile/bundle-repack', upload.fields([
  { name: 'beforeImage', maxCount: 10 },
  { name: 'afterImage', maxCount: 10 }
]), async (req, res) => {
  try {
    const {
      inboundId,
      noOfBundle,
      isRelabelled,
      isRebundled,
      isRepackProvided,
      noOfMetalStrap,
      repackDescription
    } = req.body;

    // Validate required fields
    if (!inboundId || !noOfBundle) {
      return res.status(400).json({
        error: 'Missing required fields: inboundId, noOfBundle,'
      });
    }

    // Get inbound record for jobNo and lotNo
    const inbound = await Inbound.findByPk(inboundId);
    if (!inbound) {
      return res.status(404).json({ error: 'Inbound record not found' });
    }
    const { jobNo, lotNo } = inbound;

    // Check if bundle already exists
    let inboundBundle = await InboundBundle.findOne({
      where: {
        inboundId: parseInt(inboundId),
        bundleNo: parseInt(noOfBundle)
      }
    });


    const bundleData = {
      inboundId: parseInt(inboundId),
      bundleNo: parseInt(noOfBundle),
      isRelabelled: isRelabelled === 'true',
      isRebundled: isRebundled === 'true',
      isRepackProvided: isRepackProvided === 'true',
      noOfMetalStrap: noOfMetalStrap ? parseInt(noOfMetalStrap) : null,
      repackDescription: repackDescription || null
    };

    if (inboundBundle) {
      // Update existing bundle
      await inboundBundle.update(bundleData);
    } else {
      // Create new bundle
      inboundBundle = await InboundBundle.create(bundleData);
    }

    // Handle image uploads only if isRepackProvided is true
    if (isRepackProvided === 'true') {
      const beforeFiles = req.files?.beforeImage || [];
      const afterFiles = req.files?.afterImage || [];

      // Process before images
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
          inboundId: parseInt(inboundId),
          inboundBundleId: inboundBundle.inboundBundleId,
          imageUrl: `uploads/img/repacked/${uniqueName}`,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // Process after images
      for (const file of afterFiles) {
        const uniqueName = `${jobNo}-${lotNo}-${noOfBundle}-after-${uuidv4()}${path.extname(file.originalname)}`;
        const newPath = path.join(__dirname, `../uploads/img/repacked/${uniqueName}`);

        // Ensure directory exists
        const dir = path.dirname(newPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.renameSync(file.path, newPath);

        await AfterImage.create({
          inboundId: parseInt(inboundId),
          inboundBundleId: inboundBundle.inboundBundleId,
          imageUrl: `uploads/img/repacked/${uniqueName}`,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
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
});

// GET /api/bundle-repack/:inboundId/:bundleNo
router.get('/bundle-repack/:inboundId/:bundleNo', async (req, res) => {
  try {
    const { inboundId, bundleNo } = req.params;

    const bundle = await InboundBundle.findOne({
      where: {
        inboundId: parseInt(inboundId),
        bundleNo: parseInt(bundleNo)
      },
      include: [
        {
          model: BeforeImage,
          as: 'beforeImages'
        },
        {
          model: AfterImage,
          as: 'afterImages'
        },
        {
          model: Inbound,
          as: 'inbound',
          attributes: ['jobNo', 'lotNo']
        }
      ]
    });

    if (!bundle) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    res.status(200).json({
      message: 'Bundle found',
      data: bundle
    });

  } catch (error) {
    console.error('Error fetching bundle:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;