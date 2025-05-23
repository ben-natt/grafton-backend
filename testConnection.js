const { Client } = require('pg');
require('dotenv').config(); // if using .env file

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

client.connect()
  .then(() => {
    console.log('Connected to PostgreSQL successfully!');
    return client.end();
  })
  .catch(err => {
    console.error(' Connection error:',err);
  });
