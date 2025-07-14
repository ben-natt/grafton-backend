const db = require("../database");

const findJobNoPendingTasksCrew = async (page = 1, pageSize = 10) => {
  try {
    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(DISTINCT l."jobNo")::int
      FROM public.lot l
      JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      WHERE l."status" = 'Received' AND l."report" = 'False' AND l."isConfirm" = 'True'
    `;
    const countResult = await db.sequelize.query(countQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;

    const dataQuery = `
      SELECT *
      FROM (
        SELECT DISTINCT ON (l."jobNo") l."jobNo", s."inboundDate"
        FROM public.lot l
        JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      WHERE l."status" = 'Received' AND l."report" = 'False' AND l."isConfirm" = 'True'
        ORDER BY l."jobNo", s."inboundDate" ASC
      ) AS distinct_jobs
      ORDER BY distinct_jobs."inboundDate" ASC
      LIMIT :limit OFFSET :offset;
    `;
    const data = await db.sequelize.query(dataQuery, {
      replacements: { limit: pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return { totalCount, data };
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

const getDetailsPendingTasksCrew = async (jobNo) => {
  try {
    const query = `
      SELECT 
        l."lotId", 
        l."lotNo",
        l."jobNo", 
        l."commodity", 
        l."expectedBundleCount", 
        l."brand",
        l."exWarehouseLot", 
        l."exLmeWarehouse", 
        l."shape", 
        l."report",
        i."inboundId",
        i."netWeight"
      FROM public.lot l
      JOIN public.inbounds i
        ON i."jobNo" = l."jobNo" AND i."lotNo" = l."lotNo"
      WHERE l."jobNo" = :jobNo
        AND l."status" = 'Received'
        AND l."report" = false
        AND l."isConfirm" = true
        AND i."isWeighted" = false
      ORDER BY l."exWarehouseLot" ASC;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (result.length > 0) {
      console.log("Query result:", result);
    } else {
      console.log("No pending tasks found for jobNo:", jobNo);
    }

    return result;
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};


const pendingTasksUserIdSingleDateCrew = async (jobNo) => {
  try {
    const query = `
      SELECT 
        u."username", 
        TO_CHAR(MAX(l."updatedAt") AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "inboundDate"
      FROM public.lot l
      JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      JOIN public.users u ON s."userId" = u."userid"
      WHERE l."jobNo" = :jobNo AND l."status" = 'Received' AND l."report" = false AND l."isConfirm" = true
      GROUP BY u."username"
    `;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("Error in /pending-tasks route:", error);
    throw error;
  }
};




module.exports = {
  findJobNoPendingTasksCrew,
  getDetailsPendingTasksCrew,
  pendingTasksUserIdSingleDateCrew 
};
