const express = require('express');
const router = express.Router();
const pendingTasksModel = require('../models/pending_tasks_model'); 

router.get('/tasks-jobNo', async (req, res) => {
    try {
        const result = await pendingTasksModel.findJobNoPendingTasks();
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending tasks.' });
    }
});


router.post('/tasks-inbound', async (req, res) => {
    const { jobNo } = req.body;
    try {
        const result = await pendingTasksModel.getDetailsPendingTasks(jobNo);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending tasks.' });
    }
});


router.post('/tasks-user', async (req, res) => {
    const { jobNo } = req.body;
    try {
        const result = await pendingTasksModel.pendingTasksUserId(jobNo);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching stock records:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router; 
