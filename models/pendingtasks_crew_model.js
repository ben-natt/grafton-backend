const db = require("../database");
const { Op } = require("sequelize");

// Helper function to format date consistently to match the frontend's expectation.
const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  const day = d.getDate();
  // Using 'short' month format (e.g., 'Jul') to match Dart's 'MMM' format.
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

const getPendingTasks = async (page = 1, pageSize = 10, filters = {}) => {
  try {
    const { startDate, endDate, exWarehouseLot } = filters;
    const offset = (page - 1) * pageSize;

    // --- 1. Build Filter Conditions for Raw Query ---
    let whereClauses = [
      `l."status" = 'Received'`,
      `l."report" = false`,
      `l."isConfirm" = true`,
      // This join condition ensures we only get lots that haven't been weighed.
      `i."isWeighted" IS NOT TRUE`,
    ];
    const replacements = {};

    if (exWarehouseLot) {
      // Use ILIKE for case-insensitive partial matching.
      whereClauses.push(`l."exWarehouseLot" ILIKE :exWarehouseLot`);
      replacements.exWarehouseLot = `%${exWarehouseLot}%`;
    }
    if (startDate && endDate) {
      // Inclusive date range for the filter.
      // Explicitly set timezone to prevent off-by-one errors due to server/client differences.
      whereClauses.push(
        `(s."inboundDate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate AND :endDate`
      );
      replacements.startDate = startDate;
      replacements.endDate = endDate;
    }

    const whereString = whereClauses.join(" AND ");

    // --- 2. Get Total Count of Matching JobNos for Pagination ---
    const countQuery = `
      SELECT COUNT(DISTINCT l."jobNo")::int
      FROM public.lot l
      JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
      JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      WHERE ${whereString};
    `;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    if (totalCount === 0) {
      return { data: [], page, pageSize, totalPages, totalCount };
    }

    // --- 3. Get Paginated List of Distinct JobNos that Match Filters ---
    const jobNoQuery = `
      SELECT DISTINCT l."jobNo"
      FROM public.lot l
      JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
      JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      WHERE ${whereString}
      ORDER BY l."jobNo"
      LIMIT :limit OFFSET :offset;
    `;
    const jobNoResults = await db.sequelize.query(jobNoQuery, {
      replacements: { ...replacements, limit: pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });

    const paginatedJobNos = jobNoResults.map((j) => j.jobNo);

    if (paginatedJobNos.length === 0) {
      return { data: [], page, pageSize, totalPages, totalCount };
    }

    // --- 4. Fetch All Details for Only the JobNos on the Current Page ---
    const detailsQuery = `
      SELECT
          l."lotId", l."lotNo", l."jobNo", l.commodity, l."expectedBundleCount",
          l.brand, l."exWarehouseLot", l."exLmeWarehouse", l.shape, l.report,
          i."inboundId", i."netWeight",
          s."inboundDate",
          u.username
      FROM public.lot l
      JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
      JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      JOIN public.users u ON s."userId" = u.userid
      WHERE l."jobNo" IN (:paginatedJobNos)
        AND l."status" = 'Received'
        AND l."report" = false
        AND l."isConfirm" = true
        AND i."isWeighted" IS NOT TRUE
      ORDER BY s."inboundDate" ASC, l."jobNo" ASC, l."exWarehouseLot" ASC;
    `;

    const detailsForPage = await db.sequelize.query(detailsQuery, {
      replacements: { paginatedJobNos },
      type: db.sequelize.QueryTypes.SELECT,
    });

  // --- 5. Group the Flat Results into the Nested Structure for the Frontend ---
    const groupedByJobNo = detailsForPage.reduce((acc, lot) => {
      const jobNo = lot.jobNo;
      if (!acc[jobNo]) {
        acc[jobNo] = {
          jobNo: jobNo,
          userInfo: {
            username: lot.username || "N/A",
            inboundDate: formatDate(lot.inboundDate),
          },
          lotDetails: [],
          inboundId: lot.inboundId,
          // Initialize incomplete status - will be calculated on frontend
          isIncomplete: false,
          incompleteLotNos: [], // Initialize empty array
        };
      }

      acc[jobNo].lotDetails.push({
        lotId: lot.lotId,
        lotNo: lot.lotNo,
        jobNo: lot.jobNo,
        commodity: lot.commodity,
        expectedBundleCount: lot.expectedBundleCount,
        brand: lot.brand,
        exWarehouseLot: lot.exWarehouseLot,
        exLmeWarehouse: lot.exLmeWarehouse,
        shape: lot.shape,
        report: lot.report,
        inboundId: lot.inboundId,
        netWeight: lot.netWeight,
      });
      return acc;
    }, {});

    const finalData = Object.values(groupedByJobNo);
    return { data: finalData, page, pageSize, totalPages, totalCount };
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

// These functions are no longer used by the main screen but are kept for compatibility.
const getDetailsPendingTasksCrew = async (jobNo) => {
  try {
    const query = `
      SELECT 
        l."lotId", l."lotNo", l."jobNo", l."commodity", l."expectedBundleCount", 
        l."brand", l."exWarehouseLot", l."exLmeWarehouse", l."shape", l."report",
        i."inboundId", i."netWeight"
      FROM public.lot l
      JOIN public.inbounds i ON i."jobNo" = l."jobNo" AND i."lotNo" = l."lotNo"
      WHERE l."jobNo" = :jobNo
        AND l."status" = 'Received' AND l."report" = false AND l."isConfirm" = true
        AND i."isWeighted" IS NOT TRUE
      ORDER BY l."exWarehouseLot" ASC;
    `;
    return await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });
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
        TO_CHAR(MAX(s."inboundDate") AT TIME ZONE 'Asia/Singapore', 'DD TMMon YYYY') AS "inboundDate"
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
    console.error("Error in /pending-tasks-user-single-date route:", error);
    throw error;
  }
};

module.exports = {
  getPendingTasks,
  getDetailsPendingTasksCrew,
  pendingTasksUserIdSingleDateCrew,
};
