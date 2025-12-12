const db = require("../database");
const { Op } = require("sequelize");

const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

const getPendingTasksWithIncompleteStatus = async (
  page = 1,
  pageSize = 10,
  filters = {}
) => {
  try {
    const { startDate, endDate, exWarehouseLot } = filters;
    const offset = (page - 1) * pageSize;

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
      baseWhere.push(
        `REPLACE(REPLACE(l."exWarehouseLot", '-', ''), '/', '') ILIKE :exWarehouseLot`
      );
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

    // this quesry for 
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

    // --- FIX: Joined on lotNo instead of exWarehouseLot ---
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
    ];

    const detailsReplacements = { paginatedJobNos };

    if (exWarehouseLot) {
      const sanitizedSearchTerm = exWarehouseLot.replace(/[-/]/g, "");
      detailsWhere.push(
        `REPLACE(REPLACE(l."exWarehouseLot", '-', ''), '/', '') ILIKE :exWarehouseLot`
      );
      detailsReplacements.exWarehouseLot = `%${sanitizedSearchTerm}%`;
    }

    const detailsWhereString = detailsWhere.join(" AND ");

    // --- FIX: Joined on lotNo. Switched select from i.crewLotNo to l.lotNo to ensure data presence. ---
    const detailsQuery = `
      SELECT
          l."lotId", 
          i."crewLotNo" AS "lotNo", -- CHANGED: Select crewLotNo for display
          i."jobNo", l.commodity, l."expectedBundleCount",
          l.brand, l."exWarehouseLot", l."exLmeWarehouse", l.shape, l.report,
          l."inbounddate",
          i."inboundId", i."netWeight",
          u.username,
          COALESCE(bundle_stats.total_bundles, 0) as total_bundles,
          COALESCE(bundle_stats.incomplete_bundles, 0) as incomplete_bundles,
          COALESCE(bundle_stats.complete_bundles, 0) as complete_bundles,
          COALESCE(bundle_stats.any_data_bundles, 0) as any_data_bundles,
          CASE 
            WHEN COALESCE(bundle_stats.any_data_bundles, 0) > 0 
                 AND COALESCE(bundle_stats.incomplete_bundles, 0) > 0 
            THEN true 
            ELSE false 
          END as is_incomplete
      FROM public.lot l
      JOIN public.inbounds i ON l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
      LEFT JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      LEFT JOIN public.users u ON s."userId" = u.userid
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
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? "N/A" : parsed;
      }
      return "N/A";
    };

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
    console.error(
      "Error fetching pending tasks with incomplete status:",
      error
    );
    throw error;
  }
};

const getDetailsPendingTasksCrew = async (jobNo) => {
  try {
    // --- FIX: Joined on lotNo instead of exWarehouseLot ---
    const query = `
      SELECT 
        l."lotId", 
        i."crewLotNo" AS "lotNo", -- CHANGED: Select crewLotNo for display
        l."jobNo", l."commodity", l."expectedBundleCount", 
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
  getPendingTasksWithIncompleteStatus,
  getDetailsPendingTasksCrew,
  pendingTasksUserIdSingleDateCrew,
};
