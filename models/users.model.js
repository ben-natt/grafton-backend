const db = require('../database');
const bcrypt = require('bcrypt');

// Fetch user by email
const getUserByEmail = async (email) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    console.log('User fetched by email:', result.rows[0]);
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
// Fetch all users
const getAllUsers = async () => {
  try {
    const result = await db.query('SELECT * FROM users');
    return result.rows;
  } catch (error) {
    console.error('Error fetching all users:', error);  
    throw error; 
  }
}

// Register a new user
const createUser = async (email, password, roleid) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10); 
    
    const result = await db.query(
      'INSERT INTO users (email, password, roleid) VALUES ($1, $2, $3) RETURNING *',
      [email, hashedPassword,1]
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
