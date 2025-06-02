const express = require('express');
const router = express.Router();
const inboundModel = require('../models/inbound.model');

// Route to get all inbound records
router.get('/', async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query;
        let inbounds;
        
        if (date) {
            inbounds = await inboundModel.getInboundByDate(date);
        } else if (startDate && endDate) {
            inbounds = await inboundModel.getInboundByDateRange(startDate, endDate);
        } else {
            inbounds = await inboundModel.getAllInbound();
        }
        
        res.status(200).json(inbounds);
    } catch (error) {
        console.error('Error fetching inbound records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/upcoming', async (req, res) => {
    try {
        const upcomingInbound = await inboundModel.getUpcomingInbound();
        res.status(200).json(upcomingInbound);
    } catch (error) {
        console.error('Error fetching upcoming inbound records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/inventory', async (req, res) => {
    try {
        const inventory = await inboundModel.getInventory();
        res.status(200).json(inventory);
    } catch (error) {
        console.error('Error fetching inventory records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
})
module.exports = router;