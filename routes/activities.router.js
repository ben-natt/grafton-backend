const express = require("express");
const router = express.Router();
const activitiesModel = require("../models/activities.model");

router.get("/inbound-summary", async (req, res) => {
  try {
    const summary = await activitiesModel.getInboundSummary();
    res.json(summary);
  } catch (error) {
    console.error("Error fetching inbound summary:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/outbound-summary", async (req, res) => {
  try {
    const summary = await activitiesModel.getOutboundSummary();
    res.json(summary);
  } catch (error) {
    console.error("Error fetching outbound summary:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/inbound-records", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 25;

    // Extract filters from query, ensuring they are not undefined
    const filters = {
      commodity: req.query.commodity,
      shape: req.query.shape,
      jobNo: req.query.jobNo,
      brand: req.query.brand,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      // **FIX: Added all new filters**
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      quantity: req.query.quantity,
      inboundWarehouse: req.query.inboundWarehouse,
      exWarehouseLocation: req.query.exWarehouseLocation,
      exLmeWarehouse: req.query.exLmeWarehouse,
      search: req.query.search,
    };
    // Remove null/undefined/empty filters so we don't pass them to the model
    Object.keys(filters).forEach(
      (key) =>
        (filters[key] === undefined ||
          filters[key] === null ||
          filters[key] === "") &&
        delete filters[key]
    );

    const { totalCount, data } = await activitiesModel.getInboundRecord({
      page,
      pageSize,
      filters,
    });

    res.json({
      data,
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    });
  } catch (error) {
    console.error("Error fetching inbound records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/outbound-records", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const filters = {
      commodity: req.query.commodity,
      shape: req.query.shape,
      jobNo: req.query.jobNo,
      brand: req.query.brand,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      // **FIX: Added all new filters**
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      quantity: req.query.quantity,
      inboundWarehouse: req.query.inboundWarehouse,
      exWarehouseLocation: req.query.exWarehouseLocation,
      exLmeWarehouse: req.query.exLmeWarehouse,
      search: req.query.search,
    };
    Object.keys(filters).forEach(
      (key) =>
        (filters[key] === undefined ||
          filters[key] === null ||
          filters[key] === "") &&
        delete filters[key]
    );

    const { totalCount, data } = await activitiesModel.getOutboundRecord({
      page,
      pageSize,
      filters,
    });

    res.json({
      data,
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    });
  } catch (error) {
    console.error("Error fetching outbound records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/filter-options", async (req, res) => {
  try {
    const options = await activitiesModel.getFilterOptions();

    res.json(options);
  } catch (error) {
    console.error("Error fetching filter options:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/inbound-records/:inboundId", async (req, res) => {
  try {
    const inboundId = req.params.inboundId;
    const records = await activitiesModel.getInboundRecordByInboundId(
      inboundId
    );
    res.json(records);
  } catch (error) {
    console.error("Error fetching inbound records by inbound ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/outbound-records/:outboundId", async (req, res) => {
  try {
    const outboundId = req.params.outboundId;
    const records = await activitiesModel.getOutboundRecordByOutboundId(
      outboundId
    );
    res.json(records);
  } catch (error) {
    console.error("Error fetching outbound records by outbound ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// router.js
router.get("/scheduled-inbound", async (req, res) => {
  try {
    const filters = {
      commodity: req.query.commodity,
      shape: req.query.shape,
      jobNo: req.query.jobNo,
      brand: req.query.brand,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      quantity: req.query.quantity,
      inboundWarehouse: req.query.inboundWarehouse,
      exWarehouseLocation: req.query.exWarehouseLocation,
      exLmeWarehouse: req.query.exLmeWarehouse,
    };
    // Remove null/undefined/empty filters
    Object.keys(filters).forEach(
      (key) =>
        (filters[key] === undefined ||
          filters[key] === null ||
          filters[key] === "") &&
        delete filters[key]
    );

    // NEW: Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 25;

    const result = await activitiesModel.getAllScheduleInbound({
      filters,
      page,
      pageSize,
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching scheduled inbound records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// router.js

router.get("/scheduled-outbound", async (req, res) => {
  try {
    const filters = {
      commodity: req.query.commodity,
      shape: req.query.shape,
      jobNo: req.query.jobNo,
      brand: req.query.brand,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      quantity: req.query.quantity,
      inboundWarehouse: req.query.inboundWarehouse,
      exWarehouseLocation: req.query.exWarehouseLocation,
      exLmeWarehouse: req.query.exLmeWarehouse,
    };
    // Remove null/undefined/empty filters
    Object.keys(filters).forEach(
      (key) =>
        (filters[key] === undefined ||
          filters[key] === null ||
          filters[key] === "") &&
        delete filters[key]
    );

    // NEW: Pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 25;

    const scheduledOutbounds = await activitiesModel.getAllScheduleOutbound({
      filters,
      page,
      pageSize,
    });
    res.json(scheduledOutbounds);
  } catch (error) {
    console.error("Error fetching scheduled outbound records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/scheduled-inbound/:lotId", async (req, res) => {
  try {
    const lotId = req.params.lotId;
    const scheduledInbound =
      await activitiesModel.getScheduleInboundRecordByLotId(lotId);
    res.json(scheduledInbound);
  } catch (error) {
    console.error("Error fetching scheduled inbound record by lot ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/scheduled-outbound/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const scheduledOutbound =
      await activitiesModel.getScheduleOutboundRecordById(id);
    res.json(scheduledOutbound);
  } catch (error) {
    console.error("Error fetching scheduled outbound record by ID:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
