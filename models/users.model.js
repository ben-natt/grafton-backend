const db = require('../database');
const bcrypt = require('bcrypt');

// Fetch user by email
const getUserByEmail = async (email) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching user by email:', error);
    throw error;
  }
}

// Fetch role by roleId
const getRoleById = async (roleId) => {
  try {
    const result = await db.query('SELECT * FROM roles WHERE "roleid" = $1', [roleId]);
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching role by ID:', error);
    throw error;
  }
}

const getAllUsers = async () => {
  try {
    const result = await db.query('SELECT * FROM users');
    return result.rows;
  } catch (error) {
    console.error('Error fetching all users:', error);  
    throw error; 
  }
}

const createUser = async (email, username, password, roleid) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10); 
    
    const result = await db.query(
      'INSERT INTO users (email, username, password, roleid) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, username, hashedPassword, roleid]
    );




    return result.rows[0];
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

module.exports = {
  getAllUsers,
  getUserByEmail,
  getRoleById,
  createUser,
};
