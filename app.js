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
const activitiesRoutes = require("./routes/activities.router");

const pendingTasks = require("./routes/pending_tasks_router");
const confirmOutboundRoutes = require("./routes/confirm_outbound.router");
const confirmInboundRoutes = require("./routes/confirm_inbound_router");
const grnRouter = require("./routes/grn.router");

const actualWeightRoutes = require("./routes/actualWeight.router");
const repackRoutes = require("./routes/repack.router");
const pendingTasksCrew = require("./routes/pendingtasks_crew.router");
const notificationReport = require("./routes/notifications.router");



const { sequelize, DataTypes } = require("./database"); // Correctly import from database.js

const app = express();

// Middlewares
app.use(cors());
// Increase the limit for JSON payloads
app.use(express.json({ limit: "50mb" }));

// Increase the limit for URL-encoded payloads
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "./uploads")));

// This makes the 'grn' folder publicly accessible, which is necessary for serving the images.
app.use("/grn", express.static(path.join(__dirname, "./grn")));

// Routes
app.use("/users", userRoutes);
app.use("/inbounds", inboundRoutes);
app.use("/outbounds", outboundRoutes); // Uncomment if outbound routes are needed
app.use("/schedule", scheduleRoutes); // Adjust path if needed
app.use("/schedule-outbounds", scheduleOutboundRoutes); // Uncomment if outbound scheduling routes are needed
app.use("/stocks", stockRoutes);

app.use("/activities", activitiesRoutes);
app.use("/actualWeight", actualWeightRoutes);
app.use("/repack", repackRoutes);
app.use("/pending-crew", pendingTasksCrew);
app.use("/report", notificationReport);


app.use("/pending", pendingTasks);
app.use("/confirm-outbound", confirmOutboundRoutes);
app.use("/confirm-inbound", confirmInboundRoutes);
app.use("/grn", grnRouter);

module.exports = app;
