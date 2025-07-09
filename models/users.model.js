const db = require("../database");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");

// Create uploads directory if not exists
const uploadDir = path.join(__dirname, "../uploads/img/profile");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Fetch user by email
const getUserByEmail = async (email) => {
  try {
    const result = await db.sequelize.query(
      "SELECT * FROM users WHERE email = :email",
      {
        replacements: { email },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    return result[0]; // Return the first user found
  } catch (error) {
    console.error("Error fetching user by email:", error);
    throw error;
  }
};

// Fetch user by ID - This is crucial for the /profile routes
const getUserById = async (userId) => {
  try {
    const result = await db.sequelize.query(
      `SELECT
        u.userid,
        u.email,
        u.username,
        u.profileimageurl,
        u.roleid,
        r.rolename
       FROM users u
       JOIN roles r ON u.roleid = r.roleid
       WHERE u.userid = :userId`,
      {
        replacements: { userId },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    return result[0];
  } catch (error) {
    console.error("Error fetching user by ID:", error);
    throw error;
  }
};

// Fetch role by roleId - This function will now be less critical as we'll join roles in getUserById
const getRoleById = async (roleId) => {
  try {
    const result = await db.sequelize.query(
      'SELECT * FROM roles WHERE "roleid" = $1',
      {
        bind: [roleId],
        type: db.sequelize.QueryTypes.SELECT,
      }
    );
    return result[0]; // Return the single role found
  } catch (error) {
    console.error("Error fetching role by ID:", error);
    throw error;
  }
};

// Fetch all roles
const getAllRoles = async () => {
  try {
    const result = await db.sequelize.query("SELECT * FROM roles", {
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching all roles:", error);
    throw error;
  }
};

// Fetch all users
const getAllUsers = async () => {
  try {
    const result = await db.sequelize.query("SELECT * FROM users", {
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching all users:", error);
    throw error;
  }
};

// Register a new user
const createUser = async (email, password, roleid) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.sequelize.query(
      "INSERT INTO users (email, password, roleid) VALUES ($1, $2, $3) RETURNING *",
      {
        bind: [email, hashedPassword, roleid], // Use the passed roleid
        type: db.sequelize.QueryTypes.INSERT,
      }
    );
    return result[0]; // Return the newly created user
  } catch (error) {
    console.error("Error creating user:", error);
    throw error;
  }
};

// Update user profile
const updateUserProfile = async (userId, updates) => {
  try {
    let query = "UPDATE users SET ";
    const fields = []; // Array to hold the fields to update
    const replacements = { userId }; // Object to hold the replacements for the query

    Object.keys(updates).forEach((key) => {
      // Iterate over the updates object
      // Check if the key is a valid field in the users table
      if (key !== "userid") {
        // Exclude userid from updates
        fields.push(`${key} = :${key}`);
        replacements[key] = updates[key];
      }
    });

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    query +=
      fields.join(", ") +
      ", updatedat = CURRENT_TIMESTAMP WHERE userid = :userId RETURNING *"; // Use RETURNING * to get the updated row

    const [updatedRows] = await db.sequelize.query(query, {
      replacements, // Use the replacements object
      // Use the QueryTypes.UPDATE to indicate this is an update operation
      type: db.sequelize.QueryTypes.UPDATE, // Use QueryTypes.UPDATE to indicate this is an update operation
    });

    return updatedRows[0]; // Return the first updated row
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
};

module.exports = {
  getAllUsers,
  getUserByEmail,
  getRoleById,
  getAllRoles, // Export the new function
  getUserById,
  createUser,
  updateUserProfile,
};
