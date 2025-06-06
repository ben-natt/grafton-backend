const express = require('express');
const router = express.Router();
const outboundModel = require('../models/outbound.model'); 

// Route to get all inbound records
router.get('/', async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query;
        if (date) {
            // If date is provided, filter outbounds by date
            outbounds = await outboundModel.getOutboundsByDate(date);
        }else if(startDate && endDate) {
            outbounds = await outboundModel.getOutboundsByDateRange(startDate, endDate);}
         else {
            outbounds = await outboundModel.getAllOutbounds();
        }
        res.status(200).json(outbounds);
    } catch (error) {
        console.error('Error fetching outbounds records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/upcoming', async (req, res) => {
    try {
        const upcomingOutbound = await outboundModel.getUpcomingOutbounds();
        res.status(200).json(upcomingOutbound);
    } catch (error) {
        console.error('Error fetching upcoming outbound records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


router.get('/scheduled', async (req, res) => {
    const { date, startDate, endDate } = req.query;
    try {
        let scheduleOutbounds;
        if (date) {
            scheduleOutbounds = await outboundModel.getScheduleOutboundByDate(date);
        } else if (startDate && endDate) {
            scheduleOutbounds = await outboundModel.getScheduleOutboundByDateRange(startDate, endDate);
        } else {
            scheduleOutbounds = await outboundModel.getAllScheduleOutbounds();
        }
        res.status(200).json(scheduleOutbounds);
    } catch (error) {
        console.error('Error fetching schedule outbound records:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
module.exports = router;