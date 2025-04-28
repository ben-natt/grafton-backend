const { Pool } = require('pg');

const pool = new Pool({
  user: 'nattadmin',  
  host: '100.72.108.50',     
  database: 'wms_grafton',
  password:'Cavemen@1688' , 
  port: 5432,               
});

module.exports = pool;