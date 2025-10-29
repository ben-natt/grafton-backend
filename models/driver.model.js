const db = require("../database"); 
const { format } = require('date-fns'); 

const getAllOrders = async () => {
    try {
        const query = `
            SELECT order_no FROM app.orders
        `;
        const results = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
        });
        return results;
    } catch (error) {
        console.error("Error fetching all orders:", error);
        throw error;
    }
};

module.exports = {
    getAllOrders
};

