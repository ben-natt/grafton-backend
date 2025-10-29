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
      'SELECT * FROM "Users" WHERE email = :email',
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

// Fetch user by ID
const getUserById = async (userId) => {
  try {
    const result = await db.sequelize.query(

      `SELECT
        u.user_id,
        u.email,
        u.username,
        u.profile_image_url,
        u.user_role_id,
        r.role_name
       FROM "Users" u
       JOIN "userRole" r ON u.user_role_id = r.user_role_id
       WHERE u.user_id = :userId`,
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

// Fetch role by roleId
const getRoleById = async (roleId) => {
  try {
    const result = await db.sequelize.query(
      // UPDATED: Column name
      'SELECT * FROM "userRole" WHERE user_role_id = $1',
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
    const result = await db.sequelize.query('SELECT * FROM "userRole"', {
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
    const result = await db.sequelize.query('SELECT * FROM "Users"', {
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
      'INSERT INTO "Users" (email, password, user_role_id) VALUES ($1, $2, $3) RETURNING *',
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
    // UPDATED: Map keys from router to new snake_case DB columns
    const columnMap = {
      username: "username",
      password: "password",
      profileimageurl: "profile_image_url",
      roleid: "user_role_id",
      whatsapp_id: "whatsapp_id", // UPDATED: Key is now lowercase
    };

    let query = 'UPDATE "Users" SET ';
    const fields = [];
    const replacements = { userId };

    Object.keys(updates).forEach((key) => {
      if (columnMap[key]) {
        fields.push(`${columnMap[key]} = :${key}`);
        replacements[key] = updates[key];
      }
    });

    if (fields.length === 0) {
      throw new Error("No fields to update");
    }

    // UPDATED: Column names "updated_at" and "user_id"
    query +=
      fields.join(", ") +
      ", updated_at = CURRENT_TIMESTAMP WHERE user_id = :userId RETURNING *";

    const [updatedRows] = await db.sequelize.query(query, {
      replacements,
      type: db.sequelize.QueryTypes.UPDATE,
    });

    return updatedRows[0];
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
};

// Update user password by email
const updateUserPassword = async (email, newPassword) => {
  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.sequelize.query(
      'UPDATE "Users" SET password = :hashedPassword, updated_at = CURRENT_TIMESTAMP WHERE email = :email',
      {
        replacements: { hashedPassword, email },
        type: db.sequelize.QueryTypes.UPDATE,
      }
    );
  } catch (error) {
    console.error("Error updating user password:", error);
    throw error;
  }
};

module.exports = {
  getAllUsers,
  getUserByEmail,
  getRoleById,
  getAllRoles,
  getUserById,
  createUser,
  updateUserProfile,
  updateUserPassword,
};