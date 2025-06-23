const express = require('express');
const router = express.Router();
const stockModel = require('../models/stock.model');

router.get('/', async (req, res) => {
    try {
        const stocks = await stockModel.getAllStock();
        res.json(stocks);
    } catch (error) {
        console.error('Error fetching stock records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/inventory', async (req, res) => {
    try {
        const inventory = await stockModel.getInventory();
        res.json(inventory);
    } catch (error) {
        console.error('Error fetching inventory records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/lots', async (req, res) => {
    try {
        const filters = req.query; // Pass all query params to the model
        console.log('Fetching lots with filters:', filters);
        const lots = await stockModel.getLotDetails(filters); 
        res.json(lots);
    } catch (error) {
        console.error('Error fetching lots by metal and shape', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/filter-options', async (req, res) => {
    try {
        const options = await stockModel.getFilterOptions();

        res.json(options);
    } catch (error)
    {   
        console.error('Error fetching filter options:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/lot-summary', async (req, res) => {
  try {
    // FIX: Change from req.body to req.query for GET request
    const { jobNo, lotNo } = req.query; 

    if (!jobNo || !lotNo) {
      return res.status(400).json({ error: 'Missing jobNo or lotNo query parameters' });
    }

    const result = await stockModel.getLotSummary(jobNo, lotNo);
    
    // If no result found, return a 404
    if (!result) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching lot summary records:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// --- NEW ROUTE for Scheduling Outbounds ---
router.post('/schedule-outbound', async (req, res) => {
    try {
        // The request body will contain the form data and the list of selected lots
        const scheduleData = req.body;
        const result = await stockModel.createScheduleOutbound(scheduleData);
        res.status(201).json(result);
    } catch (error) {
        console.error('Error in /schedule-outbound route:', error.message);
        res.status(500).json({ success: false, message: 'Failed to create schedule.', error: error.message });
    }
});

router.put('/update/:inboundId', async (req, res) => {
    const inboundId = req.params.inboundId;
    const updateData = req.body;
    if (!inboundId) {
        return res.status(400).json({ error: 'Missing inboundId in URL' });
    }
    if (!updateData || Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No data to update' });
    }
    try {
        const updatedRecord = await stockModel.EditInformation(inboundId, updateData);
        if (!updatedRecord || updatedRecord.length === 0) {
            return res.status(404).json({ error: 'Record not found or nothing updated.' });
        }
        res.json({ success: true, data: updatedRecord });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update record', details: error.message });
    }
});

module.exports = router;
