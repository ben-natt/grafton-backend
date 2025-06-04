const app = require('./app');
require('dotenv').config(); // Load environment variables from .env file
const { sequelize } = require('./database'); // Import sequelize instance for syncing

const PORT = process.env.PORT || 3000;

// Database synchronization
// Use force: true ONLY FOR DEVELOPMENT to drop and re-create tables
// In production, use migrations (e.g., Sequelize CLI migrations)
sequelize.sync({ force: false }) // Set force to false for production/development stability
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Unable to sync database:', err);
    process.exit(1);
  });