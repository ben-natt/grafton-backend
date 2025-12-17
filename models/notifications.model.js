const db = require("../database");

/**
 * Fetches discrepancy reports from the lot_reports table based on their status.
 * @param {string} status - The status of the reports to fetch ('pending', 'accepted', 'declined').
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of report objects.
 */
const getReportsByStatus = async (status = "pending") => {
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
    console.error(`[Model] Error fetching reports by status ${status}:`, error);
    throw error;
  }
};
/**
 * Fetches job discrepancy reports from the job_reports table.
 * @param {string} status - The status of the reports to fetch ('pending', 'accepted', 'declined').
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of job report objects.
 */
const getJobReportsByStatus = async (status = "pending") => {
  try {
    let statusFilterClause;
    const replacements = { status };

    if (status === "accepted") {
      statusFilterClause = `jr."reportStatus" IN ('accepted', 'resolved')`;
    } else {
      statusFilterClause = `jr."reportStatus" = :status`;
    }

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
const getDuplicateReportsByStatus = async (status = "pending") => {
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

// +++ START: NEW DELETE FUNCTIONS +++

/**
 * Deletes a discrepancy report by its ID.
 * It tries deleting from both job_reports and lot_reports tables.
 * @param {number} reportId - The ID of the report to delete.
 * @returns {Promise<boolean>} A promise that resolves to true if a report was deleted, otherwise false.
 */
const deleteDiscrepancyReportById = async (reportId) => {
  try {
    // First, attempt to delete from the job_reports table.
    const jobDeleteQuery = `DELETE FROM public.job_reports WHERE "jobReportId" = :reportId`;
    const [jobResults, jobMetadata] = await db.sequelize.query(jobDeleteQuery, {
      replacements: { reportId },
    });

    // sequelize.query with DELETE might not provide rowCount, so check the result differently or assume success
    if (jobMetadata && jobMetadata.rowCount > 0) {
      return true;
    }

    // If not found (or no rowCount), attempt to delete from the lot_reports table.
    const lotDeleteQuery = `DELETE FROM public.lot_reports WHERE "reportId" = :reportId`;
    const [lotResults, lotMetadata] = await db.sequelize.query(lotDeleteQuery, {
      replacements: { reportId },
    });

    if (lotMetadata && lotMetadata.rowCount > 0) {
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting discrepancy report:", error);
    throw error;
  }
};

/**
 * Deletes a duplicate report by its ID from the lot_duplicate table.
 * @param {number} duplicatedId - The ID of the duplicate report to delete.
 * @returns {Promise<boolean>} A promise that resolves to true if a report was deleted, otherwise false.
 */
const deleteDuplicateReportById = async (duplicatedId) => {
  try {
    const query = `DELETE FROM public.lot_duplicate WHERE "duplicatedId" = :duplicatedId`;
    const [results, metadata] = await db.sequelize.query(query, {
      replacements: { duplicatedId },
    });

    if (metadata && metadata.rowCount > 0) {
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting duplicate report:", error);
    throw error;
  }
};

const setLastReadTime = async (userId, timestamp) => {
  try {
    // --- CHANGED: Convert timestamp and NOW() to SGT ---
    // We use AT TIME ZONE 'Asia/Singapore' to ensure the stored value reflects SGT.
    const query = `
      INSERT INTO public.user_notification_status ("userId", "lastReadTime", "updatedAt")
      VALUES (
        :userId, 
        (:timestamp)::timestamptz AT TIME ZONE 'Asia/Singapore', 
        NOW() AT TIME ZONE 'Asia/Singapore'
      )
      ON CONFLICT ("userId") 
      DO UPDATE SET 
        "lastReadTime" = (:timestamp)::timestamptz AT TIME ZONE 'Asia/Singapore', 
        "updatedAt" = NOW() AT TIME ZONE 'Asia/Singapore';
    `;

    await db.sequelize.query(query, {
      replacements: { userId, timestamp },
    });
    return true;
  } catch (error) {
    console.error("[Model] !!! SQL ERROR in setLastReadTime:", error);
    throw error;
  }
};

const getLastReadTime = async (userId) => {
  try {
    const query = `
      SELECT "lastReadTime" 
      FROM public.user_notification_status 
      WHERE "userId" = :userId
    `;
    const result = await db.sequelize.query(query, {
      replacements: { userId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (result && result.length > 0) {
      return result[0].lastReadTime;
    }
    return null;
  } catch (error) {
    console.error("Error getting last read time:", error);
    throw error;
  }
};

module.exports = {
  getReportsByStatus,
  getReportsByLotId,
  getDuplicateReportsByStatus,
  getJobReportsByStatus,
  deleteDiscrepancyReportById,
  deleteDuplicateReportById,
  setLastReadTime,
  getLastReadTime,
};
