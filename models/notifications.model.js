const db = require("../database");

/**
 * Fetches discrepancy reports from the lot_reports table based on their status.
 * @param {string} status - The status of the reports to fetch ('pending', 'accepted', 'declined').
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of report objects.
 */
const getReportsByStatus = async (status = 'pending') => {
  try {
    // +++ CONSOLE LOG +++
    console.log(`[Model] Fetching LOT reports with status: ${status}`);
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
    
    // +++ CONSOLE LOG +++
    console.log(`[Model] Found ${result.length} LOT reports.`);
    return result;
  } catch (error) {
    console.error("Error fetching reports by status:", error);
    throw error;
  }
};

/**
 * +++ UPDATED FUNCTION +++
 * Fetches job discrepancy reports from the job_reports table.
 * @param {string} status - The status of the reports to fetch ('pending', 'accepted', 'declined').
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of job report objects.
 */
const getJobReportsByStatus = async (status = 'pending') => {
  try {
    console.log(`[Model] Fetching JOB reports with status: ${status}`);

    // --- START: FIX ---
    // This logic ensures that when the "Approved" tab requests data,
    // we fetch reports that are either 'accepted' or 'resolved'.
    let statusFilterClause;
    const replacements = { status };

    if (status === 'accepted') {
      statusFilterClause = `jr."reportStatus" IN ('accepted', 'resolved')`;
    } else {
      // For 'pending' and 'declined', the logic remains the same.
      statusFilterClause = `jr."reportStatus" = :status`;
    }
    // --- END: FIX ---
    
    const query = `
      SELECT 
        jr."jobReportId" as "reportId",
        l."lotId", -- Include a lotId for frontend compatibility
        jr."jobNo",
        jr."discrepancyType",
        jr."reportedById" as "reportedBy",
        jr."reportedOn",
        jr."reportStatus",
        jr."resolvedById" as "resolvedBy",
        jr."resolvedOn",
        u.username as "reportedByUsername",
        ru.username as "resolvedByUsername",
        CASE 
          WHEN jr."discrepancyType" = 'lack' THEN 'Missing In WMS'
          WHEN jr."discrepancyType" = 'extra' THEN 'Extra Jobs In WMS'
          ELSE jr."discrepancyType"::text
        END as "lotNo" -- Re-use lotNo field for description
      FROM public.job_reports jr
      JOIN public.users u ON jr."reportedById" = u.userid
      LEFT JOIN (
        SELECT DISTINCT ON ("jobNo") "jobNo", "lotId"
        FROM public.lot
        ORDER BY "jobNo", "lotId"
      ) l ON jr."jobNo" = l."jobNo"
      LEFT JOIN public.users ru ON jr."resolvedById" = ru.userid
      WHERE ${statusFilterClause} -- Use the dynamic status filter here
      ORDER BY jr."reportedOn" DESC;
    `;
    
    const result = await db.sequelize.query(query, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
    });
    
    console.log(`[Model] Found ${result.length} JOB reports.`);
    return result;
  } catch (error) {
    console.error("Error fetching job reports by status:", error);
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
  getJobReportsByStatus, // <-- Make sure to export the new function
};