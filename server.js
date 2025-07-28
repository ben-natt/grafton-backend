const app = require("./app");
require("dotenv").config(); // Load environment variables from .env file
const { sequelize } = require("./database"); // Import sequelize instance for syncing

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
// Database synchronization
// Use force: true ONLY FOR DEVELOPMENT to drop and re-create tables
// In production, use migrations (e.g., Sequelize CLI migrations)
sequelize
  .sync({ force: false }) // Set force to false for production/development stability
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Server is running on http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Unable to sync database:", err);
    process.exit(1);
  });
