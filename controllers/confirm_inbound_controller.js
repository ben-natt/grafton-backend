const confirmInboundTasksModel = require("../models/confirm_inbound_model");
const db = require("../database"); // Ensure db is imported

// Controller for updating lot status
const updateLotStatusController = async (req, res) => {
  const { lotId, status } = req.body;
  
  // Validate required fields
  if (!lotId || !status) {
    return res.status(400).json({ 
      error: "Missing required fields: lotId and status are required" 
    });
  }

  try {
    const result = await updateLotStatus(lotId, status);
    
    if (!result || result.length === 0) {
      return res.status(404).json({ 
        error: "Lot not found or no rows were updated" 
      });
    }

    res.status(200).json({
      message: "Lot status updated successfully",
      data: result[0]
    });
  } catch (error) {
    console.error("Error in updateLotStatusController:", error);
    res.status(500).json({ 
      error: "Failed to update lot status",
      details: error.message 
    });
  }
};

// Controller for updating lot status by jobNo and lotNo
const updateLotStatusByJobController = async (req, res) => {
  const { jobNo, lotNo, status } = req.body;
  
  // Validate required fields
  if (!jobNo || !lotNo || !status) {
    return res.status(400).json({ 
      error: "Missing required fields: jobNo, lotNo, and status are required" 
    });
  }

  try {
    const result = await updateLotStatusByJobAndLot(jobNo, lotNo, status);
    
    if (!result || result.length === 0) {
      return res.status(404).json({ 
        error: "Lot not found or no rows were updated" 
      });
    }

    res.status(200).json({
      message: "Lot status updated successfully",
      data: result[0]
    });
  } catch (error) {
    console.error("Error in updateLotStatusByJobController:", error);
    res.status(500).json({ 
      error: "Failed to update lot status",
      details: error.message 
    });
  }
};

// Controller for creating inbound record
const createInboundController = async (req, res) => {
  const inboundData = req.body;
  
  // Validate required fields
  const requiredFields = ['jobNo', 'lotNo', 'userId'];
  const missingFields = requiredFields.filter(field => !inboundData[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      error: `Missing required fields: ${missingFields.join(', ')}` 
    });
  }

  try {
    const result = await createInboundRecord(inboundData);
    
    res.status(201).json({
      message: "Inbound record created successfully",
      data: result[0]
    });
  } catch (error) {
    console.error("Error in createInboundController:", error);
    res.status(500).json({ 
      error: "Failed to create inbound record",
      details: error.message 
    });
  }
};

// Controller for processing multiple lots from frontend confirmation
const processMultipleInboundController = async (req, res) => {
  const { selectedLots } = req.body;
  
  // Validate request structure
  if (!selectedLots || !Array.isArray(selectedLots) || selectedLots.length === 0) {
    return res.status(400).json({ 
      error: "selectedLots array is required and cannot be empty" 
    });
  }

  // Start transaction
  const transaction = await db.sequelize.transaction();
  
  try {
    const processedLots = [];
    const errors = [];

    for (const lot of selectedLots) {
      try {
        // Extract data from the lot object
        const {
          jobNo,
          lotIndex, // This might be lotNo in your data structure
          expectedBundleCount,
          brand,
          commodity,
          exWarehouseLot,
          exLmeWarehouse,
          // Add any other fields you need from SelectedLotData
        } = lot;

        // Validate required fields for each lot
        if (!jobNo || !lotIndex) {
          errors.push({
            lot: `${jobNo}-${lotIndex}`,
            error: "Missing required fields: jobNo and lotIndex"
          });
          continue;
        }

        // Step 1: Update lot status
        const updateQuery = `
          UPDATE public.lot 
          SET "status" = 'Received', "updatedAt" = NOW()
          WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
          RETURNING *
        `;
        
        const lotUpdateResult = await db.sequelize.query(updateQuery, {
          replacements: { jobNo, lotNo: lotIndex },
          type: db.sequelize.QueryTypes.UPDATE,
          transaction
        });

        if (!lotUpdateResult[0] || lotUpdateResult[0].length === 0) {
          errors.push({
            lot: `${jobNo}-${lotIndex}`,
            error: "Lot not found or status update failed"
          });
          continue;
        }

        const updatedLot = lotUpdateResult[0][0];

        // Step 2: Create inbound record
        const insertQuery = `
          INSERT INTO public.inbounds (
            "jobNo", "lotNo", "noOfBundle", "barcodeNo", "commodityId", 
            "shapeId", "exLmeWarehouseId", "exWarehouseWarrant", "inboundWarehouseId",
            "grossWeight", "netWeight", "actualWeight", "isWeighted", "isRelabelled",
            "isRebundled", "noOfMetalStraps", "isRepackProvided", "repackDescription",
            "userId", "brandId", "inboundDate", "exWarehouseLot", 
            "scheduleInboundDate", "exWarehouseLocationId", "createdAt", "updatedAt"
          ) VALUES (
            :jobNo, :lotNo, :noOfBundle, :barcodeNo, :commodityId,
            :shapeId, :exLmeWarehouseId, :exWarehouseWarrant, :inboundWarehouseId,
            :grossWeight, :netWeight, :actualWeight, :isWeighted, :isRelabelled,
            :isRebundled, :noOfMetalStraps, :isRepackProvided, :repackDescription,
            :userId, :brandId, :inboundDate, :exWarehouseLot,
            :scheduleInboundDate, :exWarehouseLocationId, NOW(), NOW()
          )
          RETURNING *
        `;

        const inboundInsertResult = await db.sequelize.query(insertQuery, {
          replacements: {
            jobNo,
            lotNo: lotIndex,
            noOfBundle: expectedBundleCount || null,
            barcodeNo: null, // Set default or extract from lot data
            commodityId: null, // You might need to map commodity string to ID
            shapeId: null,
            exLmeWarehouseId: null, // You might need to map exLmeWarehouse to ID
            exWarehouseWarrant: null,
            inboundWarehouseId: null, // Set based on your warehouse logic
            grossWeight: updatedLot.grossWeight || null,
            netWeight: updatedLot.netWeight || null,
            actualWeight: updatedLot.actualWeight || null,
            isWeighted: false,
            isRelabelled: false,
            isRebundled: false,
            noOfMetalStraps: null,
            isRepackProvided: false,
            repackDescription: null,
            userId: 1, // You should get this from authentication context
            brandId: null, // You might need to map brand string to ID
            inboundDate: new Date().toISOString(),
            exWarehouseLot: exWarehouseLot || null,
            scheduleInboundDate: new Date().toISOString(),
            exWarehouseLocationId: null
          },
          type: db.sequelize.QueryTypes.INSERT,
          transaction
        });

        processedLots.push({
          jobNo,
          lotNo: lotIndex,
          updatedLot: updatedLot,
          createdInbound: inboundInsertResult[0][0]
        });

      } catch (lotError) {
        console.error(`Error processing lot ${lot.jobNo}-${lot.lotIndex}:`, lotError);
        errors.push({
          lot: `${lot.jobNo}-${lot.lotIndex}`,
          error: lotError.message
        });
      }
    }

    // Check if there were any errors
    if (errors.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        error: "Some lots failed to process",
        details: errors,
        successCount: processedLots.length,
        failureCount: errors.length
      });
    }

    // Commit transaction if all lots processed successfully
    await transaction.commit();

    res.status(200).json({
      message: `Successfully processed ${processedLots.length} lots`,
      data: {
        processedLots,
        totalProcessed: processedLots.length,
        summary: {
          totalLots: selectedLots.length,
          successfullyProcessed: processedLots.length,
          failed: errors.length
        }
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();
    console.error("Error in processMultipleInboundController:", error);
    res.status(500).json({ 
      error: "Failed to process inbound confirmation",
      details: error.message 
    });
  }
};

module.exports = {
  updateLotStatusController,
  updateLotStatusByJobController,
  createInboundController,
  processMultipleInboundController
};