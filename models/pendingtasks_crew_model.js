
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

const getPendingTasksWithIncompleteStatus = async (page = 1, pageSize = 10, filters = {}) => {
  try {
    const { startDate, endDate, exWarehouseLot } = filters;
    const offset = (page - 1) * pageSize;

    // Build base filter conditions for finding relevant jobs
    // 1. Status must be 'Received'
    // 2. Report is false
    // 3. Must be Confirmed by Supervisor (l."isConfirm" = true)
    // 4. Must satisfy incomplete weighting conditions OR have incomplete bundles
    // 5. Must NOT be selected for outbound (prevents red dot when Office schedules it)
    const baseWhere = [
      `l."status" = 'Received'`,
      `l."report" = false`,
      `l."isConfirm" = true`,
      `(
        i."isWeighted" IS NOT TRUE
        OR
        EXISTS (
          SELECT 1
          FROM public.inboundbundles ib
          WHERE ib."inboundId" = i."inboundId"
          AND (ib.weight IS NULL OR ib.weight <= 0 OR ib."meltNo" IS NULL OR ib."meltNo" = '' OR ib."stickerWeight" IS NULL OR ib."stickerWeight" <= 0)
        )
      )`,
      `NOT EXISTS (
        SELECT 1
        FROM public.selectedinbounds si
        WHERE si."jobNo" = l."jobNo" 
        AND si."lotNo" = l."lotNo"
      )`,
    ];
    
    const replacements = {};

    if (exWarehouseLot) {
      const sanitizedSearchTerm = exWarehouseLot.replace(/[-/]/g, "");
      baseWhere.push(`REPLACE(REPLACE(l."exWarehouseLot", '-', ''), '/', '') ILIKE :exWarehouseLot`);
      replacements.exWarehouseLot = `%${sanitizedSearchTerm}%`;
    }

    const baseWhereString = baseWhere.join(" AND ");

    const dateOverlapWhere =
      startDate && endDate
        ? `WHERE jr.max_date >= :startDate::date AND jr.min_date <= :endDate::date`
        : "";

    if (startDate && endDate) {
      replacements.startDate = startDate;
      replacements.endDate = endDate;
    }

    // Count query to find total number of matching jobs
    const countQuery = `
      WITH jr AS (
        SELECT
          l."jobNo",
          MIN((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS min_date,
          MAX((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS max_date
        FROM public.lot l
        JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."exWarehouseLot" = i."exWarehouseLot"
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

    // Get paginated job numbers
    const jobNoQuery = `
      WITH jr AS (
        SELECT
          l."jobNo",
          MIN((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS min_date,
          MAX((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS max_date
        FROM public.lot l
        JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."exWarehouseLot" = i."exWarehouseLot"
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
    
    // Build a separate WHERE clause for the details query to filter lots precisely.
    // Ensure the same strict conditions apply to the detailed fetching.
    const detailsWhere = [
      `l."jobNo" IN (:paginatedJobNos)`,
      `l."status" = 'Received'`,
      `l."report" = false`,
      `l."isConfirm" = true`,
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
      `NOT EXISTS (
        SELECT 1
        FROM public.selectedinbounds si
        WHERE si."jobNo" = l."jobNo" 
        AND si."lotNo" = l."lotNo"
      )`
    ];
    
    const detailsReplacements = { paginatedJobNos };

    if (exWarehouseLot) {
      const sanitizedSearchTerm = exWarehouseLot.replace(/[-/]/g, "");
      detailsWhere.push(`REPLACE(REPLACE(l."exWarehouseLot", '-', ''), '/', '') ILIKE :exWarehouseLot`);
      detailsReplacements.exWarehouseLot = `%${sanitizedSearchTerm}%`;
    }
    
    const detailsWhereString = detailsWhere.join(" AND ");

    // Fetch details for the paginated jobs
    const detailsQuery = `
      SELECT
          l."lotId", i."crewLotNo" AS "lotNo", i."jobNo", l.commodity, l."expectedBundleCount",
          l.brand, l."exWarehouseLot", l."exLmeWarehouse", l.shape, l.report,
          l."inbounddate",
          i."inboundId", i."netWeight",
          u.username,
          -- Bundle statistics
          COALESCE(bundle_stats.total_bundles, 0) as total_bundles,
          COALESCE(bundle_stats.incomplete_bundles, 0) as incomplete_bundles,
          COALESCE(bundle_stats.complete_bundles, 0) as complete_bundles,
          COALESCE(bundle_stats.any_data_bundles, 0) as any_data_bundles,
          -- Incomplete status
          CASE 
            WHEN COALESCE(bundle_stats.any_data_bundles, 0) > 0 
                 AND COALESCE(bundle_stats.incomplete_bundles, 0) > 0 
            THEN true 
            ELSE false 
          END as is_incomplete
      FROM public.lot l
      JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."exWarehouseLot" = i."exWarehouseLot"
      JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      JOIN public.users u ON s."userId" = u.userid
      LEFT JOIN (
        SELECT 
          ib."inboundId",
          COUNT(*)::int AS total_bundles,
          COUNT(*) FILTER (
            WHERE (ib.weight IS NULL OR ib.weight <= 0)
              OR (ib."meltNo" IS NULL OR TRIM(ib."meltNo") = '')
              OR (ib."stickerWeight" IS NULL OR ib."stickerWeight" <= 0)
          )::int AS incomplete_bundles,
          COUNT(*) FILTER (
            WHERE (ib.weight IS NOT NULL AND ib.weight > 0)
              AND (ib."meltNo" IS NOT NULL AND TRIM(ib."meltNo") <> '')
              AND (ib."stickerWeight" IS NOT NULL AND ib."stickerWeight" > 0)
          )::int AS complete_bundles,
          COUNT(*) FILTER (
            WHERE (ib.weight IS NOT NULL AND ib.weight > 0)
              OR (ib."meltNo" IS NOT NULL AND TRIM(ib."meltNo") <> '')
              OR (ib."stickerWeight" IS NOT NULL AND ib."stickerWeight" > 0)
          )::int AS any_data_bundles
        FROM public.inboundbundles ib
        GROUP BY ib."inboundId"
      ) bundle_stats ON bundle_stats."inboundId" = i."inboundId"
      WHERE ${detailsWhereString} 
      ORDER BY l."exWarehouseLot";
    `;

    const detailsForPage = await db.sequelize.query(detailsQuery, {
      replacements: detailsReplacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    const safeParseLotNo = (value) => {
      if (value === null || value === undefined) return "N/A";
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? "N/A" : parsed;
      }
      return "N/A";
    };

    // Group results
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
          isIncomplete: false,
          incompleteLotNos: [],
          inboundDates: [],
        };
      }

      if (lot.inbounddate) {
        acc[jobNo].inboundDates.push(new Date(lot.inbounddate));
      }

      if (lot.is_incomplete) {
        acc[jobNo].isIncomplete = true;
        if (!acc[jobNo].incompleteLotNos.includes(lot.lotNo)) {
          acc[jobNo].incompleteLotNos.push(lot.lotNo);
        }
      }

      acc[jobNo].lotDetails.push({
        lotId: lot.lotId,
        lotNo: safeParseLotNo(lot.lotNo),
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
        bundleStats: {
          totalBundles: lot.total_bundles,
          incompleteBundles: lot.incomplete_bundles,
          completeBundles: lot.complete_bundles,
          anyDataBundles: lot.any_data_bundles,
        },
        isIncomplete: lot.is_incomplete,
      });
      
      return acc;
    }, {});

    Object.values(groupedByJobNo).forEach((group) => {
      if (group.inboundDates.length > 0) {
        const minDate = new Date(
          Math.min(...group.inboundDates.map((d) => d.getTime()))
        );
        const maxDate = new Date(
          Math.max(...group.inboundDates.map((d) => d.getTime()))
        );

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
    console.error("Error fetching pending tasks with incomplete status:", error);
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
      JOIN public.inbounds i ON i."jobNo" = l."jobNo" AND i."exWarehouseLot" = l."exWarehouseLot"
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

const getCrewPendingStatus = async (userId) => {
  try {
    // FIX:
    // We explicitly cast both sides of the comparison to ensure a raw UTC comparison.
    // CASE WHEN MAX(l."updatedAt") > COALESCE(user_read_time, 1970)
    
    // Note: If lastReadTime is stored without a timezone, we cast it to UTC ('YYYY-MM-DD HH:MM:SS+00')
    // to match updatedAt which is usually timestamptz.
    
    const query = `
      WITH pending_updates AS (
        SELECT MAX(l."updatedAt") as "latestUpdate"
        FROM public.lot l
        JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."exWarehouseLot" = i."exWarehouseLot"
        WHERE 
          l."status" = 'Received'
          AND l."report" = false
          AND l."isConfirm" = true
          AND (
            i."isWeighted" IS NOT TRUE
            OR EXISTS (
              SELECT 1 FROM public.inboundbundles ib
              WHERE ib."inboundId" = i."inboundId"
              AND (ib.weight IS NULL OR ib.weight <= 0 OR ib."meltNo" IS NULL OR ib."meltNo" = '')
            )
          )
      )
      SELECT
        CASE 
          WHEN MAX("latestUpdate") > COALESCE(
            (SELECT "lastReadTime" FROM public.user_pending_task_status WHERE "userId" = :userId),
            '1970-01-01'::timestamp
          ) THEN true 
          ELSE false 
        END as "hasPending",
        MAX("latestUpdate") as "lastUpdated",
        (SELECT "lastReadTime" FROM public.user_pending_task_status WHERE "userId" = :userId) as "lastReadTime"
      FROM pending_updates;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { userId },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });

    if (!result) {
      return { hasPending: false, lastUpdated: null, lastReadTime: null };
    }

    // Force return as a Date object or null to avoid string parsing issues on client
    return {
      hasPending: result.hasPending === true || result.hasPending === 1,
      lastUpdated: result.lastUpdated ? new Date(result.lastUpdated) : null,
      lastReadTime: result.lastReadTime ? new Date(result.lastReadTime) : null 
    };

  } catch (error) {
    console.error("Error checking crew pending status:", error);
    throw error;
  }
};

const updateCrewReadStatus = async (userId, explicitDate) => {
  try {
    const replacements = { userId };
    
    // Ensure we insert a clean ISO timestamp if provided
    if (explicitDate) {
      replacements.explicitDate = explicitDate; // e.g., '2025-12-11T01:39:24.314Z'
    }

    const query = `
      INSERT INTO public.user_pending_task_status ("userId", "lastReadTime")
      VALUES (:userId, ${explicitDate ? ':explicitDate::timestamptz' : 'NOW()'})
      ON CONFLICT ("userId") 
      DO UPDATE SET 
        "lastReadTime" = ${explicitDate ? ':explicitDate::timestamptz' : 'NOW()'};
    `;

    await db.sequelize.query(query, {
      replacements,
      type: db.sequelize.QueryTypes.INSERT,
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating crew read status:", error);
    throw error;
  }
};

module.exports = {
  getPendingTasksWithIncompleteStatus,
  getDetailsPendingTasksCrew,
  pendingTasksUserIdSingleDateCrew,
  getCrewPendingStatus,
  updateCrewReadStatus,
};