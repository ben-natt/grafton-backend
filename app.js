const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/users.router');
const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/users', userRoutes);

module.exports = app;