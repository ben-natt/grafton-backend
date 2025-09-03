const db = require("../database");
const { Op } = require("sequelize");

// Helper function to format date consistently to match the frontend's expectation.
const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0"); // Ensures two-digit day
  const month = d.toLocaleString("en-US", { month: "short" }); // Use 'short' for 'Sep'
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

const getPendingTasks = async (page = 1, pageSize = 10, filters = {}) => {
  try {
    const { startDate, endDate, exWarehouseLot } = filters;
    const offset = (page - 1) * pageSize;

    // --- 1. Build Base Filter Conditions ---
    const baseWhere = [
      `l."status" = 'Received'`,
      `l."report" = false`,
      `l."isConfirm" = true`,
      // NEW LOGIC: A task is pending if it has never been weighed OR if it has been weighed
      // but still has bundles with missing weight or melt numbers.
      `(
        i."isWeighted" IS NOT TRUE
        OR
        EXISTS (
          SELECT 1
          FROM public.inboundbundles ib
          WHERE ib."inboundId" = i."inboundId"
          AND (ib.weight IS NULL OR ib.weight <= 0 OR ib."meltNo" IS NULL OR ib."meltNo" = '')
        )
      )`,
      // NEW: Exclude lots that are already scheduled for outbound
      `NOT EXISTS (
        SELECT 1
        FROM public.selectedinbounds si
        WHERE si."jobNo" = l."jobNo" 
        AND si."lotNo" = l."lotNo"
      )`,
    ];
    const replacements = {};

    if (exWarehouseLot) {
      // Use ILIKE for case-insensitive partial matching.
      baseWhere.push(`l."exWarehouseLot" ILIKE :exWarehouseLot`);
      replacements.exWarehouseLot = `%${exWarehouseLot}%`;
    }

    const baseWhereString = baseWhere.join(" AND ");

    // --- 2. Compute min/max inbound dates PER JOB (in SG date) in a CTE, then filter/paginate on that ---
    const dateOverlapWhere =
      startDate && endDate
        ? `WHERE jr.max_date >= :startDate::date AND jr.min_date <= :endDate::date`
        : "";

    if (startDate && endDate) {
      replacements.startDate = startDate;
      replacements.endDate = endDate;
    }

    // --- 3. Get Total Count of Matching JobNos for Pagination ---
    const countQuery = `
      WITH jr AS (
        SELECT
          l."jobNo",
          MIN((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS min_date,
          MAX((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS max_date
        FROM public.lot l
        JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
        WHERE ${baseWhereString}
        GROUP BY l."jobNo"
      )
      SELECT COUNT(*)::int AS count
      FROM jr
      ${dateOverlapWhere};
    `;

    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });

    const totalCount = countResult?.count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    if (totalCount === 0) {
      return { data: [], page, pageSize, totalPages, totalCount };
    }

    // --- 4. Get Paginated List of Distinct JobNos that Match Filters ---
    const jobNoQuery = `
      WITH jr AS (
        SELECT
          l."jobNo",
          MIN((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS min_date,
          MAX((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS max_date
        FROM public.lot l
        JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
        WHERE ${baseWhereString}
        GROUP BY l."jobNo"
      )
      SELECT jr."jobNo"
      FROM jr
      ${dateOverlapWhere}
      ORDER BY jr."jobNo"
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

    // --- 5. Fetch All Details for Only the JobNos on the Current Page ---
    const detailsQuery = `
      SELECT
          l."lotId", l."lotNo", l."jobNo", l.commodity, l."expectedBundleCount",
          l.brand, l."exWarehouseLot", l."exLmeWarehouse", l.shape, l.report,
          l."inbounddate",
          i."inboundId", i."netWeight",
          u.username
      FROM public.lot l
      JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
      JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      JOIN public.users u ON s."userId" = u.userid
      WHERE l."jobNo" IN (:paginatedJobNos)
        AND l."status" = 'Received'
        AND l."report" = false
        AND l."isConfirm" = true
        -- Ensure the details query uses the same pending logic
        AND (
          i."isWeighted" IS NOT TRUE
          OR
          EXISTS (
            SELECT 1
            FROM public.inboundbundles ib
            WHERE ib."inboundId" = i."inboundId"
            AND (ib.weight IS NULL OR ib.weight <= 0 OR ib."meltNo" IS NULL OR ib."meltNo" = '')
          )
        )
      ORDER BY l."inbounddate" ASC, l."jobNo" ASC, l."exWarehouseLot" ASC;
    `;

    const detailsForPage = await db.sequelize.query(detailsQuery, {
      replacements: { paginatedJobNos },
      type: db.sequelize.QueryTypes.SELECT,
    });

    // --- 6. Group the Flat Results into the Nested Structure for the Frontend ---
    const groupedByJobNo = detailsForPage.reduce((acc, lot) => {
      const jobNo = lot.jobNo;
      if (!acc[jobNo]) {
        acc[jobNo] = {
          jobNo: jobNo,
          userInfo: {
            username: lot.username || "N/A",
            inboundDate: null,
          },
          lotDetails: [],
          inboundId: lot.inboundId,
          // Initialize incomplete status - will be calculated on frontend
          isIncomplete: false,
          incompleteLotNos: [], // Initialize empty array
          inboundDates: [],
        };
      }

      if (lot.inbounddate)
        acc[jobNo].inboundDates.push(new Date(lot.inbounddate));

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

    // --- 7. Compute display date (single vs range) for each job ---
    Object.values(groupedByJobNo).forEach((group) => {
      if (group.inboundDates.length > 0) {
        const minDate = new Date(
          Math.min(...group.inboundDates.map((d) => d.getTime()))
        );
        const maxDate = new Date(
          Math.max(...group.inboundDates.map((d) => d.getTime()))
        );

        // Check if dates are the same (compare date strings to avoid time differences)
        const minDateString = minDate.toDateString();
        const maxDateString = maxDate.toDateString();

        group.userInfo.inboundDate =
          minDateString === maxDateString
            ? formatDate(minDate)
            : `${formatDate(minDate)} - ${formatDate(maxDate)}`;
      } else {
        group.userInfo.inboundDate = "N/A";
      }
      delete group.inboundDates;
    });

    const finalData = Object.values(groupedByJobNo);
    return { data: finalData, page, pageSize, totalPages, totalCount };
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

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
