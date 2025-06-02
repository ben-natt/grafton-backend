const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/users.router');
const inboundRoutes = require('./routes/inbound.router');
const outboundRoutes = require('./routes/outbound.router'); // Uncomment if outbound routes are needed
const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/users', userRoutes);
app.use('/inbounds', inboundRoutes);
app.use('/outbounds', outboundRoutes); // Uncomment if outbound routes are needed

module.exports = app;