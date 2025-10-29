// database.js
require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_DATABASE , 
  process.env.DB_USERNAME ,
  process.env.DB_PASSWORD , 
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

const query = async (sql, params) => {
  try {
    const [results] = await sequelize.query(sql, {
      replacements: params,
      type: sequelize.QueryTypes.SELECT
    });
    return { rows: results };
  } catch (error) {
    throw error;
  }
};

module.exports = { sequelize, DataTypes, query }; 