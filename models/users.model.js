const db = require('../database');
const bcrypt = require('bcrypt');

// Fetch user by email
const getUserByEmail = async (email) => {
  try {
    const result = await db.sequelize.query(
      'SELECT * FROM users WHERE email = :email',
      {
        replacements: { email },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    return result[0]; // Return the first user found
  } catch (error) {
    console.error('Error fetching user by email:', error);
    throw error;
  }
};

// Fetch role by roleId
const getRoleById = async (roleId) => {
  try {
    const result = await db.sequelize.query(
      'SELECT * FROM roles WHERE "roleid" = $1',
      {
        bind: [roleId],
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    return result;
  } catch (error) {
    console.error('Error fetching role by ID:', error);
    throw error;
  }
};

// Fetch all users
const getAllUsers = async () => {
  try {
    const result = await db.sequelize.query(
      'SELECT * FROM users',
      {
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    return result;
  } catch (error) {
    console.error('Error fetching all users:', error);
    throw error;
  }
};

// Register a new user
const createUser = async (email, password, roleid) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.sequelize.query(
      'INSERT INTO users (email, password, roleid) VALUES ($1, $2, $3) RETURNING *',
      {
        bind: [email, hashedPassword, 1],
        type: db.sequelize.QueryTypes.INSERT,
      }
    );
    return result[0]; // Return the newly created user
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

module.exports = {
  getAllUsers,
  getUserByEmail,
  getRoleById,
  createUser,
};
