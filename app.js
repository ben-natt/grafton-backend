const express = require("express");
const cors = require("cors");
const path = require("path");
const bodyParser = require("body-parser");
const userRoutes = require("./routes/users.router");
const inboundRoutes = require("./routes/inbound.router");
const scheduleRoutes = require("./routes/schedule_inbound_router"); // Adjust path if needed
const scheduleOutboundRoutes = require("./routes/schedule_outbound_router"); // Uncomment if outbound scheduling routes are needed
const outboundRoutes = require("./routes/outbound.router"); // Uncomment if outbound routes are needed
const stockRoutes = require("./routes/stock.router");
const pendingTasks = require("./routes/pending_tasks_router");
const confirmOutboundRoutes = require("./routes/confirm_outbound.router");
const { sequelize, DataTypes } = require("./database"); // Correctly import from database.js

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/users", userRoutes);
app.use("/inbounds", inboundRoutes);
app.use("/outbounds", outboundRoutes); // Uncomment if outbound routes are needed
app.use("/schedule", scheduleRoutes); // Adjust path if needed
app.use("/schedule-outbounds", scheduleOutboundRoutes); // Uncomment if outbound scheduling routes are needed
app.use("/stocks", stockRoutes);
app.use("/pending", pendingTasks);
app.use("/confirm-outbound", confirmOutboundRoutes);
module.exports = app;
