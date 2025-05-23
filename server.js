const app = require('./app');
require('dotenv').config();
const port = 3000;

console.log(process.env.NODEMAIL_USER, process.env.NODEMAIL_PASSWORD);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});