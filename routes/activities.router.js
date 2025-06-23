const express = require('express');
const router = express.Router();
const activitiesModel = require('../models/activities.model');

router.get('/inbound-summary', async (req, res) => {
    try {
        const summary = await activitiesModel.getInboundSummary();
        res.json(summary);
    } catch (error) {
        console.error('Error fetching inbound summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/outbound-summary', async (req, res) => {
    try {
        const summary = await activitiesModel.getOutboundSummary();
        res.json(summary);
    } catch (error) {
        console.error('Error fetching outbound summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/inbound-records', async (req, res) => {
    try {
        const records = await activitiesModel.getInboundRecord();
        res.json(records);
    } catch (error) {
        console.error('Error fetching inbound records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/outbound-records', async (req, res) => {
    try {
        const records = await activitiesModel.getOutboundRecord();
        res.json(records);
    } catch (error) {
        console.error('Error fetching outbound records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/filter-options', async (req, res) => {
    try {
        const options = await activitiesModel.getFilterOptions();

        res.json(options);
    } catch (error) {
        console.error('Error fetching filter options:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/inbound-records/:inboundId', async (req, res) => {
    try {
        const inboundId = req.params.inboundId;
        const records = await activitiesModel.getInboundRecordByInboundId(inboundId);
        res.json(records);
    } catch (error) {
        console.error('Error fetching inbound records by inbound ID:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/outbound-records/:outboundId', async (req, res) => {
    try {
        const outboundId = req.params.outboundId;
        const records = await activitiesModel.getOutboundRecordByOutboundId(outboundId);
        res.json(records);
    } catch (error) {
        console.error('Error fetching outbound records by outbound ID:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;