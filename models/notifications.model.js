const db = require("../database");

/**
 * Fetches discrepancy reports from the lot_reports table based on their status.
 * @param {string} status - The status of the reports to fetch ('pending', 'accepted', 'declined').
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of report objects.
 */
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

/**
 * Fetches duplicate lot reports from the lot_duplicate table based on their status.
 * @param {string} status - The status of the reports to fetch ('pending', 'accepted', 'declined').
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of duplicate report objects.
 */
const getDuplicateReportsByStatus = async (status = 'pending') => {
  try {
    const query = `
      SELECT 
        ld."duplicatedId",
        ld."lotId",
        ld."reportedById",
        ld."reportedOn",
        ld."reportStatus",
        ld."resolvedById",
        ld."resolvedOn",
        l."jobNo",
        l."lotNo",
        u.username as "reportedByUsername",
        ru.username as "resolvedByUsername"
      FROM lot_duplicate ld
      JOIN lot l ON ld."lotId" = l."lotId"
      JOIN users u ON ld."reportedById" = u.userid
      LEFT JOIN users ru ON ld."resolvedById" = ru.userid
      WHERE ld."reportStatus" = :status
      ORDER BY ld."reportedOn" DESC;
    `;
    
    const result = await db.sequelize.query(query, {
      replacements: { status },
      type: db.sequelize.QueryTypes.SELECT,
    });
    
    return result;
  } catch (error) {
    console.error("Error fetching duplicate reports by status:", error);
    throw error;
  }
};


/**
 * Fetches all discrepancy reports for a specific lot ID.
 * @param {number} lotId - The ID of the lot.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of report objects.
 */
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
  getReportsByLotId,
  getDuplicateReportsByStatus,
};
