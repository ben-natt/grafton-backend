    const express = require("express");
    const cors = require("cors");
    const path = require("path");
    const bodyParser = require("body-parser");
    const userRoutes = require("./routes/users.router");
    const driverRoutes = require("./routes/driver.router");
   


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
    app.use("/drivers", driverRoutes);
    app.use("/users", userRoutes);

    module.exports = app;
