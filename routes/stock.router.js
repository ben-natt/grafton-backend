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



module.exports = router;
