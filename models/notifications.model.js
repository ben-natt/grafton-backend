const db = require("../database");

// Get all reports for notifications (filtered by status)
const getReportsByStatus = async (status = 'pending') => {
  try {
    const query = `
      SELECT 
        lr."reportId",
        lr."lotId",
        lr."reportedBy",
        lr."reportedOn",
        lr."reportStatus",
        lr."resolvedBy",
        lr."resolvedOn",
        l."jobNo",
        l."lotNo",
        l."netWeight",
        l."grossWeight",
        l."actualWeight",
        l."exWarehouseLot",
        u.username as "reportedByUsername",
        ru.username as "resolvedByUsername"
      FROM lot_reports lr
      JOIN lot l ON lr."lotId" = l."lotId"
      JOIN users u ON lr."reportedBy" = u.userid::text
      LEFT JOIN users ru ON lr."resolvedBy" = ru.userid::text
      WHERE lr."reportStatus" = :status
      ORDER BY lr."reportedOn" DESC;
    `;
    
    const result = await db.sequelize.query(query, {
      replacements: { status },
      type: db.sequelize.QueryTypes.SELECT,
    });
    

    return result;
  } catch (error) {
    console.error("Error fetching reports by status:", error);
    throw error;
  }
};

// Get all reports for a specific lot
const getReportsByLotId = async (lotId) => {
  try {
    const query = `
      SELECT 
        lr.*,
        u.username as "reportedByUsername",
        ru.username as "resolvedByUsername"
      FROM lot_reports lr
      JOIN users u ON lr."reportedBy" = u.userid::text
      LEFT JOIN users ru ON lr."resolvedBy" = ru.userid::text
      WHERE lr."lotId" = :lotId
      ORDER BY lr."reportedOn" DESC;
    `;
    
    const result = await db.sequelize.query(query, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
  } catch (error) {
    console.error("Error fetching reports for lot:", error);
    throw error;
  }
};

module.exports = {
  getReportsByStatus,
  getReportsByLotId
};
