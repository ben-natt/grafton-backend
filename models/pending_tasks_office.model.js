// [File: pending_tasks_office.model.js]
const db = require("../database");

// ----- INBOUND ROUTES -------
const findInboundTasksOffice = async (
  filters = {},
  page = 1,
  pageSize = 10
) => {
  try {
    const offset = (page - 1) * pageSize;
    const replacements = {};
    
    // --- 1. Build WHERE Clauses ---
    
    // Base filters for LOTS
    let lotWhere = `l.status = 'Pending'`;
    // Base filters for REPORTS (via Schedule)
    let reportWhere = `jr."reportStatus" = 'pending'`;

    // A. Search
    if (filters.search) {
      const searchTerm = filters.search.trim();
      const searchPattern = `%${searchTerm}%`;
      replacements.search = searchPattern;

      // Lot Search
      lotWhere += ` AND (
        l."jobNo" ILIKE :search
        OR l."lotNo"::text ILIKE :search
        OR l."exWarehouseLot" ILIKE :search
        OR l.commodity ILIKE :search
        OR l.brand ILIKE :search
        OR l.shape ILIKE :search
      )`;

      // Report Search (Matches JobNo)
      reportWhere += ` AND jr."jobNo" ILIKE :search`;
    }

    // B. Common Filters (Date, User)
    if (filters.startDate && filters.endDate) {
      // For Lots
      lotWhere += ` AND (l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate AND :endDate`;
      // For Reports (Join Schedule)
      reportWhere += ` AND (s."inboundDate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate AND :endDate`;
      
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }

    if (filters.scheduledBy) {
      lotWhere += ` AND u.username = :scheduledBy`;
      reportWhere += ` AND u.username = :scheduledBy`;
      replacements.scheduledBy = filters.scheduledBy;
    }

    // C. Lot Specific Filters
    // If these exist, we generally ONLY want to match lots, because reports don't have brands/shapes yet.
    // However, if the user explicitly filters for "Lot Discrepancy" or "Job Discrepancy", we handle that in logic.
    const hasLotSpecificFilters = 
      filters.lotNo || filters.commodity || filters.brand || 
      filters.shape || filters.quantity;

    if (filters.lotNo) {
      const [jobNo, lotNo] = filters.lotNo.split(" - ");
      if (jobNo && lotNo) {
        lotWhere += ` AND l."jobNo" = :exactJobNo AND l."lotNo"::text = :exactLotNo`;
        replacements.exactJobNo = jobNo;
        replacements.exactLotNo = lotNo;
      }
    }
    if (filters.commodity) {
      lotWhere += ` AND l.commodity = :commodity`;
      replacements.commodity = filters.commodity;
    }
    if (filters.brand) {
      lotWhere += ` AND l.brand = :brand`;
      replacements.brand = filters.brand;
    }
    if (filters.shape) {
      lotWhere += ` AND l.shape = :shape`;
      replacements.shape = filters.shape;
    }
    if (filters.quantity) {
      lotWhere += ` AND l."expectedBundleCount" = :quantity`;
      replacements.quantity = parseInt(filters.quantity, 10);
    }
    
    // D. Type Filter (Discrepancies)
    if (filters.type) {
      if (filters.type === "Job Discrepancy") {
        // Only show jobs present in job_reports
        lotWhere += ` AND EXISTS (SELECT 1 FROM public.job_reports jr WHERE jr."jobNo" = l."jobNo" AND jr."reportStatus" = 'pending')`;
        // reportWhere already filters for pending reports, so it stays valid
      } else if (filters.type === "Lot Discrepancy") {
        lotWhere += ` AND l.report = true`;
        // Hide job-only reports if looking for lot discrepancies
        reportWhere += ` AND 1=0`; 
      } else if (filters.type === "Normal") {
         lotWhere += ` AND l.report = false AND NOT EXISTS (SELECT 1 FROM public.job_reports jr WHERE jr."jobNo" = l."jobNo" AND jr."reportStatus" = 'pending')`;
         reportWhere += ` AND 1=0`;
      }
    }

    // --- 2. Construct Combined JobNo Query ---
    // If we have lot-specific filters (e.g. "Brand: X"), we usually ignore empty jobs.
    // Otherwise, we UNION lots and reports.

    let combinedSql = "";

    if (hasLotSpecificFilters) {
       combinedSql = `
        SELECT l."jobNo"
        FROM public.lot l
        LEFT JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
        LEFT JOIN public.users u ON s."userId" = u."userid"
        WHERE ${lotWhere}
        GROUP BY l."jobNo"
       `;
    } else {
       // Union Lots + Pending Job Reports
       combinedSql = `
        SELECT "jobNo" FROM (
            SELECT l."jobNo", MIN(l."inbounddate") as "sortDate"
            FROM public.lot l
            LEFT JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
            LEFT JOIN public.users u ON s."userId" = u."userid"
            WHERE ${lotWhere}
            GROUP BY l."jobNo"

            UNION

            SELECT jr."jobNo", MIN(s."inboundDate") as "sortDate"
            FROM public.job_reports jr
            LEFT JOIN public.scheduleinbounds s ON s."jobNo" = jr."jobNo"
            LEFT JOIN public.users u ON s."userId" = u."userid"
            WHERE ${reportWhere}
            GROUP BY jr."jobNo"
        ) as combined
       `;
    }

    // Count Total
    const countQuery = `SELECT COUNT(DISTINCT "jobNo")::int as count FROM (${combinedSql}) as c`;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult?.count || 0;

    if (totalCount === 0) {
      return { totalCount: 0, data: {} };
    }

    // Fetch Page Job Nos
    // We sort by date (using Schedule inboundDate or Lot inboundDate)
    const jobNoQuery = `
      SELECT "jobNo" FROM (
          SELECT l."jobNo", MIN(l."inbounddate") as "minDate"
          FROM public.lot l
          LEFT JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
          LEFT JOIN public.users u ON s."userId" = u."userid"
          WHERE ${lotWhere}
          GROUP BY l."jobNo"

          UNION

          SELECT jr."jobNo", MIN(s."inboundDate") as "minDate"
          FROM public.job_reports jr
          LEFT JOIN public.scheduleinbounds s ON s."jobNo" = jr."jobNo"
          LEFT JOIN public.users u ON s."userId" = u."userid"
          WHERE ${reportWhere} ${hasLotSpecificFilters ? 'AND 1=0' : ''} 
          GROUP BY jr."jobNo"
      ) as final_jobs
      GROUP BY "jobNo"
      ORDER BY MIN("minDate") ASC
      LIMIT :pageSize OFFSET :offset
    `;

    const jobNosResult = await db.sequelize.query(jobNoQuery, {
      replacements: { ...replacements, pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });
    const jobNos = jobNosResult.map((j) => j.jobNo);

    if (jobNos.length === 0) return { totalCount, data: {} };

    // --- 3. Fetch Details for these Jobs ---

    // A. Base Schedule Info (Used for jobs with 0 lots)
    const schedulesQuery = `
      SELECT 
        s."jobNo", 
        TO_CHAR(s."inboundDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "date",
        COALESCE(u.username, 'N/A') AS "scheduledBy"
      FROM public.scheduleinbounds s
      LEFT JOIN public.users u ON s."userId" = u.userid
      WHERE s."jobNo" IN (:jobNos)
    `;

    // B. Lots Info
    const tasksQuery = `
      SELECT DISTINCT ON (l."lotId")
        l."jobNo",
        l."lotId",
        l."lotNo"::text AS "lotNo",
        l."exWarehouseLot" AS "exWLot",
        l.commodity AS "metal",
        l.brand,
        l.shape,
        l."expectedBundleCount" AS quantity,
        l.report AS "hasWarning",
        l."reportDuplicate" AS "showCopyIcon",
        TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "date",
        COALESCE(u.username, 'N/A') AS "scheduledBy"
      FROM public.lot l
      LEFT JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      LEFT JOIN public.users u ON s."userId" = u."userid"
      WHERE l."jobNo" IN (:jobNos) AND l.status = 'Pending'
      ORDER BY l."lotId", l."inbounddate" ASC, l."lotNo"::integer ASC
    `;

    // C. Reports Info
    const reportsQuery = `
      SELECT
        jr."jobNo",
        jr."discrepancyType",
        jr."reportStatus",
        u.username as "supervisorUsername"
      FROM public.job_reports jr
      JOIN public.users u ON jr."reportedById" = u.userid
      WHERE jr."jobNo" IN (:jobNos) AND jr."reportStatus" IN ('pending', 'accepted')
    `;

    const [schedulesResult, tasksResult, reportsResult] = await Promise.all([
      db.sequelize.query(schedulesQuery, {
        replacements: { jobNos },
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(tasksQuery, {
        replacements: { ...replacements, jobNos },
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(reportsQuery, {
        replacements: { jobNos },
        type: db.sequelize.QueryTypes.SELECT,
      }),
    ]);

    // --- 4. Construct Response Map ---
    const tasksMap = {};

    // Step A: Initialize Map with Base Schedule Info (Handles 0 lots case)
    for (const sch of schedulesResult) {
       tasksMap[sch.jobNo] = {
         jobNo: sch.jobNo,
         date: sch.date, // Fallback date if lots are missing
         scheduledBy: sch.scheduledBy, // Fallback user if lots are missing
         lots: [],
         reportInfo: null,
       };
    }
    // Fallback for jobs not in schedule table (unlikely, but safe)
    for (const j of jobNos) {
      if (!tasksMap[j]) tasksMap[j] = { jobNo: j, lots: [], reportInfo: null };
    }

    // Step B: Add Lots
    for (const task of tasksResult) {
      if (tasksMap[task.jobNo]) {
        tasksMap[task.jobNo].lots.push({
          ...task,
          canEdit: false,
          isEditing: false,
        });
        // Prefer lot-specific date/user if available
        tasksMap[task.jobNo].date = task.date; 
        tasksMap[task.jobNo].scheduledBy = task.scheduledBy;
      }
    }

    // Step C: Add Reports
    for (const report of reportsResult) {
      if (tasksMap[report.jobNo]) {
        tasksMap[report.jobNo].reportInfo = {
          hasReport: true,
          type: report.discrepancyType,
          supervisor: report.supervisorUsername,
          isAccepted: report.reportStatus === 'accepted'
        };
      }
    }

    return { totalCount, data: tasksMap };
  } catch (error) {
    console.error("Error fetching filtered inbound tasks:", error);
    throw error;
  }
};

// ----- OUTBOUND ROUTES -------
const findOutboundTasksOffice = async (
  filters = {},
  page = 1,
  pageSize = 10
) => {
  try {
    const offset = (page - 1) * pageSize;
    let whereClauses = `si."isOutbounded" = false`;
    const replacements = {};

    // --- 1. NEW SEARCH LOGIC ---
    if (filters.search) {
      const searchTerm = filters.search.trim();
      const searchPattern = `%${searchTerm}%`;
      replacements.search = searchPattern;

      if (searchTerm.includes("-")) {
        const parts = searchTerm.split("-");
        whereClauses += ` AND (
           (i."jobNo"::text ILIKE :searchJobPart AND i."lotNo"::text ILIKE :searchLotPart)
           OR so."outboundJobNo" ILIKE :search
           OR i."exWarehouseLot" ILIKE :search
        )`;
        replacements.searchJobPart = `%${parts[0]}%`;
        replacements.searchLotPart = `%${parts[1]}%`;
      } else {
        whereClauses += ` AND (
          i."jobNo"::text ILIKE :search
          OR so."outboundJobNo" ILIKE :search
          OR i."lotNo"::text ILIKE :search
          OR i."exWarehouseLot" ILIKE :search
          OR i."noOfBundle"::text ILIKE :search
          OR c."commodityName" ILIKE :search
          OR b."brandName" ILIKE :search
          OR sh."shapeName" ILIKE :search
        )`;
      }
    }

    // --- EXISTING FILTERS ---
    if (filters.startDate && filters.endDate) {
      whereClauses += ` AND (si."releaseDate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate AND :endDate`;
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }
    if (filters.lotNo) {
      const [jobNo, lotNo] = filters.lotNo.split(" - ");
      if (jobNo && lotNo) {
        whereClauses += ` AND i."jobNo"::text = :exactJobNo AND i."lotNo"::text = :exactLotNo`;
        replacements.exactJobNo = jobNo;
        replacements.exactLotNo = lotNo;
      }
    }
    if (filters.commodity) {
      whereClauses += ` AND c."commodityName" = :commodity`;
      replacements.commodity = filters.commodity;
    }
    if (filters.brand) {
      whereClauses += ` AND b."brandName" = :brand`;
      replacements.brand = filters.brand;
    }
    if (filters.shape) {
      whereClauses += ` AND sh."shapeName" = :shape`;
      replacements.shape = filters.shape;
    }
    if (filters.quantity) {
      whereClauses += ` AND i."noOfBundle" = :quantity`;
      replacements.quantity = parseInt(filters.quantity, 10);
    }
    if (filters.scheduledBy) {
      whereClauses += ` AND u.username = :scheduledBy`;
      replacements.scheduledBy = filters.scheduledBy;
    }
    if (filters.type) {
      whereClauses += ` AND so."outboundType" = :outboundType`;
      replacements.outboundType = filters.type.toLowerCase();
    }

    const baseQuery = `
      FROM public.scheduleoutbounds so
      JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
      JOIN public.inbounds i ON si."inboundId" = i."inboundId"
      JOIN public.users u ON so."userId" = u."userid"
      LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
      LEFT JOIN public.shapes sh ON i."shapeId" = sh."shapeId"
      LEFT JOIN public.brands b ON i."brandId" = b."brandId"
    `;

    const countQuery = `SELECT COUNT(DISTINCT so."scheduleOutboundId")::int ${baseQuery} WHERE ${whereClauses}`;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;

    const scheduleIdQuery = `
      SELECT so."scheduleOutboundId"
      ${baseQuery}
      WHERE ${whereClauses}
      GROUP BY so."scheduleOutboundId"
      ORDER BY MIN(si."releaseDate") ASC
      LIMIT :pageSize OFFSET :offset
    `;
    const scheduleIdsResult = await db.sequelize.query(scheduleIdQuery, {
      replacements: { ...replacements, pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });
    const scheduleIds = scheduleIdsResult.map((s) => s.scheduleOutboundId);

    if (scheduleIds.length === 0) {
      return { totalCount, data: {} };
    }

    const tasksQuery = `
      SELECT
        so."outboundJobNo",
        si."selectedInboundId",
        i."jobNo",
        si."lotNo"::text AS "lotNo",
        sh."shapeName" AS shape,
        i."noOfBundle" AS "expectedBundleCount",
        b."brandName" AS brand,
        c."commodityName" AS commodity,
        i."exWarehouseLot" AS "exWLot",
        u.username AS "scheduledBy",
        TO_CHAR(si."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "releaseDate",
        TO_CHAR(si."releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "releaseEndDate",
        TO_CHAR(si."exportDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "exportDate",
        TO_CHAR(si."deliveryDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "deliveryDate",
        so."outboundType"
      ${baseQuery}
      WHERE so."scheduleOutboundId" IN (:scheduleIds) AND ${whereClauses}
      ORDER BY si."releaseDate" ASC, i."lotNo"::integer ASC
    `;
    const tasksResult = await db.sequelize.query(tasksQuery, {
      replacements: { ...replacements, scheduleIds },
      type: db.sequelize.QueryTypes.SELECT,
    });

    const tasksMap = {};
    for (const task of tasksResult) {
      // Ensure outbound job No is used as grouping key, fallback to ID if needed
      const scheduleKey =
        task.outboundJobNo || `SCH-${task.scheduleOutboundId}`;
      if (!tasksMap[scheduleKey]) {
        tasksMap[scheduleKey] = [];
      }
      let releaseDateRange = task.releaseDate || "";
      if (
        task.releaseDate &&
        task.releaseEndDate &&
        task.releaseDate !== task.releaseEndDate
      ) {
        releaseDateRange = `${task.releaseDate} - ${task.releaseEndDate}`;
      }
      tasksMap[scheduleKey].push({
        selectedInboundId: task.selectedInboundId.toString(),
        jobNo: task.jobNo.toString(),
        date: releaseDateRange,
        dateRange: releaseDateRange,
        lotId: task.selectedInboundId.toString(),
        lotNo: task.lotNo.toString(),
        exWLot: task.exWLot || "N/A",
        commodity: task.commodity,
        brand: task.brand,
        shape: task.shape,
        expectedBundleCount: task.expectedBundleCount,
        scheduledBy: task.scheduledBy,
        releaseDate: task.releaseDate,
        releaseEndDate: task.releaseEndDate,
        exportDate: task.exportDate,
        deliveryDate: task.deliveryDate,
        outboundType: task.outboundType,
      });
    }

    return { totalCount, data: tasksMap };
  } catch (error) {
    console.error("Error fetching filtered outbound tasks:", error);
    throw error;
  }
};

const getLotOutboundDates = async (jobNo, lotNo) => {
  try {
    const query = `
      SELECT 
        TO_CHAR("releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YYYY') AS "releaseDate",
        TO_CHAR("releaseEndDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YYYY') AS "releaseEndDate",
        TO_CHAR("exportDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YYYY') AS "exportDate",
        TO_CHAR("deliveryDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YYYY') AS "deliveryDate"
      FROM public.selectedinbounds
      WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
      ORDER BY "updatedAt" DESC
      LIMIT 1;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo, lotNo },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result[0] || null;
  } catch (error) {
    console.error("Error fetching lot outbound dates:", error);
    throw error;
  }
};

const convertDateFormat = (dateString) => {
  if (!dateString) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
    const [day, month, year] = dateString.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
};

const updateLotOutboundDates = async (
  jobNo,
  lotNo,
  releaseDate,
  releaseEndDate,
  exportDate,
  deliveryDate
) => {
  try {
    const convertedReleaseDate = convertDateFormat(releaseDate);
    const convertedReleaseEndDate = convertDateFormat(releaseEndDate);
    const convertedExportDate = convertDateFormat(exportDate);
    const convertedDeliveryDate = convertDateFormat(deliveryDate);

    const query = `
      UPDATE public.selectedinbounds
      SET 
        "releaseDate" = :releaseDate,
        "releaseEndDate" = :releaseEndDate,
        "exportDate" = :exportDate,
        "deliveryDate" = :deliveryDate,
        "updatedAt" = NOW()
      WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
      RETURNING *;
    `;
    const result = await db.sequelize.query(query, {
      replacements: {
        jobNo,
        lotNo,
        releaseDate: convertedReleaseDate,
        releaseEndDate: convertedReleaseEndDate,
        exportDate: convertedExportDate,
        deliveryDate: convertedDeliveryDate,
      },
      type: db.sequelize.QueryTypes.UPDATE,
    });
    return result[0];
  } catch (error) {
    console.error("Error updating lot outbound dates:", error);
    throw error;
  }
};

const getOfficeFilterOptions = async (isOutbound) => {
  try {
    let queries;
    if (isOutbound) {
      queries = {
        lotNos: `SELECT DISTINCT CONCAT(i."jobNo", ' - ', i."lotNo") as val FROM public.selectedinbounds si JOIN public.inbounds i ON si."inboundId" = i."inboundId" WHERE si."isOutbounded" = false AND i."jobNo" IS NOT NULL AND i."lotNo" IS NOT NULL ORDER BY val`,
        commodities: `SELECT DISTINCT c."commodityName" as val FROM public.selectedinbounds si JOIN public.inbounds i ON si."inboundId" = i."inboundId" JOIN public.commodities c ON i."commodityId" = c."commodityId" WHERE si."isOutbounded" = false AND c."commodityName" IS NOT NULL ORDER BY val`,
        brands: `SELECT DISTINCT b."brandName" as val FROM public.selectedinbounds si JOIN public.inbounds i ON si."inboundId" = i."inboundId" JOIN public.brands b ON i."brandId" = b."brandId" WHERE si."isOutbounded" = false AND b."brandName" IS NOT NULL ORDER BY val`,
        shapes: `SELECT DISTINCT s."shapeName" as val FROM public.selectedinbounds si JOIN public.inbounds i ON si."inboundId" = i."inboundId" JOIN public.shapes s ON i."shapeId" = s."shapeId" WHERE si."isOutbounded" = false AND s."shapeName" IS NOT NULL ORDER BY val`,
        quantities: `SELECT i."noOfBundle"::text as val FROM public.selectedinbounds si JOIN public.inbounds i ON si."inboundId" = i."inboundId" WHERE si."isOutbounded" = false AND i."noOfBundle" IS NOT NULL GROUP BY i."noOfBundle" ORDER BY i."noOfBundle"`,
        scheduledBys: `SELECT DISTINCT u.username as val FROM public.scheduleoutbounds so JOIN public.users u ON so."userId" = u."userid" JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId" WHERE si."isOutbounded" = false AND u.username IS NOT NULL ORDER BY val`,
      };
    } else {
      queries = {
        lotNos: `SELECT DISTINCT CONCAT(l."jobNo", ' - ', l."lotNo") as val FROM public.lot l WHERE l.status = 'Pending' AND l."jobNo" IS NOT NULL AND l."lotNo" IS NOT NULL ORDER BY val`,
        commodities: `SELECT DISTINCT l.commodity as val FROM public.lot l WHERE l.status = 'Pending' AND l.commodity IS NOT NULL ORDER BY val`,
        brands: `SELECT DISTINCT l.brand as val FROM public.lot l WHERE l.status = 'Pending' AND l.brand IS NOT NULL ORDER BY val`,
        shapes: `SELECT DISTINCT l.shape as val FROM public.lot l WHERE l.status = 'Pending' AND l.shape IS NOT NULL ORDER BY val`,
        quantities: `SELECT l."expectedBundleCount"::text as val FROM public.lot l WHERE l.status = 'Pending' AND l."expectedBundleCount" IS NOT NULL GROUP BY l."expectedBundleCount" ORDER BY l."expectedBundleCount"`,
        scheduledBys: `SELECT DISTINCT u.username as val FROM public.scheduleinbounds s JOIN public.users u ON s."userId" = u."userid" JOIN public.lot l ON s."jobNo" = l."jobNo" WHERE l.status = 'Pending' AND u.username IS NOT NULL ORDER BY val`,
      };
    }
    const results = {};
    for (const key in queries) {
      const result = await db.sequelize.query(queries[key], {
        type: db.sequelize.QueryTypes.SELECT,
      });
      results[key] = result.map((row) => row.val);
    }
    return results;
  } catch (error) {
    console.error("Error fetching filter options:", error);
    throw error;
  }
};

// --- FIX START: Use standard NOW() instead of Timezone Shift ---
const updateReportStatus = async ({ lotId, reportStatus, resolvedBy }) => {
  try {
    const query = `
      WITH updated_lot AS (
        UPDATE public.lot
        SET "report" = false
        WHERE "lotId" = :lotId
        RETURNING *
      )
      UPDATE public.lot_reports
      SET "reportStatus" = :reportStatus,
          "resolvedBy" = :resolvedBy,
          "resolvedOn" = NOW(),
          "updatedAt" = NOW() 
      WHERE "lotId" = :lotId
        AND "reportStatus" = 'pending'
      RETURNING *;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { lotId, reportStatus, resolvedBy },
      type: db.sequelize.QueryTypes.UPDATE,
    });
    return result[0];
  } catch (error) {
    console.error("Error updating report resolution:", error);
    throw error;
  }
};

const updateDuplicateStatus = async ({ lotId, reportStatus, resolvedBy }) => {
  try {
    const query = `
      WITH updated_lot AS (
        UPDATE public.lot
        SET "reportDuplicate" = false,
            "isDuplicated" = CASE 
                WHEN :reportStatus = 'accepted' THEN true 
                ELSE false 
            END
        WHERE "lotId" = :lotId
        RETURNING *
      )
      UPDATE public.lot_duplicate
      SET "reportStatus" = :reportStatus,
          "resolvedById" = :resolvedBy,
          "resolvedOn" = NOW(),
          "isResolved" = true,
          "updatedAt" = NOW()
      WHERE "lotId" = :lotId
        AND "reportStatus" = 'pending'
      RETURNING *;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { lotId, reportStatus, resolvedBy },
      type: db.sequelize.QueryTypes.UPDATE,
    });
    return result[0];
  } catch (error) {
    console.error("Error updating duplicate status:", error);
    throw error;
  }
};
// --- FIX END ---

const getReportSupervisorUsername = async (lotId) => {
  try {
    const query = `
      SELECT u.username
      FROM public.lot_reports r
      JOIN public.users u ON CAST(r."reportedBy" AS INTEGER) = u."userid"
      WHERE r."lotId" = :lotId
      ORDER BY r."reportedOn" DESC
      LIMIT 1;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result[0];
  } catch (error) {
    console.error("Error fetching report supervisor username:", error);
    throw error;
  }
};

const getDuplicateReportUsername = async (lotId) => {
  try {
    const query = `
      SELECT u.username
      FROM public.lot_duplicate ld
      JOIN public.users u ON ld."reportedById" = u.userid
      WHERE ld."lotId" = :lotId
      ORDER BY ld."reportedOn" DESC
      LIMIT 1;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result[0];
  } catch (error) {
    console.error("Error fetching duplicate report username:", error);
    throw error;
  }
};

const pendingTasksUpdateQuantity = async (lotId, expectedBundleCount) => {
  try {
    const query = `
      UPDATE public.lot
      SET "expectedBundleCount" = :expectedBundleCount
      WHERE "lotId" = :lotId
      RETURNING *;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { lotId, expectedBundleCount },
      type: db.sequelize.QueryTypes.UPDATE,
    });
    return result[0];
  } catch (error) {
    console.error("Error updating quantity:", error);
    throw error;
  }
};

const getJobReportInfo = async (jobNo) => {
  try {
    const query = `
      SELECT 
        jr."discrepancyType",
        u.username
      FROM public.job_reports jr
      JOIN public.users u ON jr."reportedById" = u.userid
      WHERE jr."jobNo" = :jobNo AND jr.status = 'pending'
      LIMIT 1;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    return result;
  } catch (error) {
    console.error("Error fetching job report info:", error);
    throw error;
  }
};

const updateJobReportStatus = async (
  { jobNo, status, resolvedBy },
  existingTransaction = null
) => {
  const logic = async (t) => {
    let finalStatus = status;
    if (status === "accepted") {
      const getReportTypeQuery = `
            SELECT "discrepancyType" FROM public.job_reports
            WHERE "jobNo" = :jobNo AND "reportStatus" = 'pending'
            LIMIT 1;
        `;
      const reportTypeResult = await db.sequelize.query(getReportTypeQuery, {
        replacements: { jobNo },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
        transaction: t,
      });
      if (reportTypeResult && reportTypeResult.discrepancyType === "lack") {
        finalStatus = "resolved";
      }
    }
    const updateReportQuery = `
      UPDATE public.job_reports
      SET "reportStatus" = :finalStatus, "resolvedById" = :resolvedBy, "resolvedOn" = NOW()
      WHERE "jobNo" = :jobNo AND "reportStatus" IN ('pending', 'accepted')
      RETURNING "discrepancyType", "reportStatus";
    `;
    const reportResult = await db.sequelize.query(updateReportQuery, {
      replacements: { jobNo, finalStatus, resolvedBy },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
      transaction: t,
    });
    if (!reportResult) {
      throw new Error(
        "No pending or accepted report found for this job to update."
      );
    }
    const resetLotFlagsQuery = `
      UPDATE public.lot
      SET report = false
      WHERE "jobNo" = :jobNo AND status = 'Pending';
    `;
    await db.sequelize.query(resetLotFlagsQuery, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction: t,
    });
    return reportResult;
  };
  if (existingTransaction) {
    return logic(existingTransaction);
  } else {
    return db.sequelize.transaction(logic);
  }
};

const addLackingLotToJob = async ({ jobNo, lotDetails }) => {
  return db.sequelize.transaction(async (t) => {
    const scheduleQuery = `SELECT "scheduleInboundId", "inboundDate" FROM public.scheduleinbounds WHERE "jobNo" = :jobNo LIMIT 1;`;
    const schedule = await db.sequelize.query(scheduleQuery, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
      transaction: t,
    });
    if (!schedule)
      throw new Error(
        `Cannot supplement job: No existing schedule found for Job No: ${jobNo}`
      );
    const maxLotNoQuery = `SELECT MAX("lotNo") as "maxLot" FROM public.lot WHERE "jobNo" = :jobNo;`;
    const maxLotResult = await db.sequelize.query(maxLotNoQuery, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
      transaction: t,
    });
    const newLotNo = (maxLotResult.maxLot || 0) + 1;
    const { exWarehouseLot, expectedBundleCount, brand, commodity, shape } =
      lotDetails;
    const insertLotQuery = `
      INSERT INTO public.lot (
        "jobNo", "lotNo", "scheduleInboundId", "inboundDate", status, report, 
        "exWarehouseLot", "expectedBundleCount", brand, commodity, shape,
        "createdAt", "updatedAt"
      ) VALUES (
        :jobNo, :newLotNo, :scheduleInboundId, :inboundDate, 'Pending', false,
        :exWarehouseLot, :expectedBundleCount, :brand, :commodity, :shape,
        NOW(), NOW()
      ) RETURNING *;
    `;
    const newLot = await db.sequelize.query(insertLotQuery, {
      replacements: {
        jobNo,
        newLotNo,
        scheduleInboundId: schedule.scheduleInboundId,
        inboundDate: schedule.inboundDate,
        exWarehouseLot: exWarehouseLot || null,
        expectedBundleCount: expectedBundleCount || 0,
        brand: brand || null,
        commodity: commodity || null,
        shape: shape || null,
      },
      type: db.sequelize.QueryTypes.INSERT,
      transaction: t,
    });
    return newLot[0][0];
  });
};

const deleteLotInTransaction = async (lotId, transaction) => {
  try {
    const query = `
            UPDATE public.lot
            SET status = 'Deleted'
            WHERE "lotId" = :lotId
            RETURNING "jobNo", "lotNo";
        `;
    const result = await db.sequelize.query(query, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.UPDATE,
      transaction,
    });
    return result[0][0];
  } catch (error) {
    console.error("Error deleting lot in transaction:", error);
    throw error;
  }
};

const deleteLot = async (lotId) => {
  try {
    const query = `
            UPDATE public.lot
            SET status = 'Deleted'
            WHERE "lotId" = :lotId
            RETURNING *;
        `;
    const result = await db.sequelize.query(query, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.UPDATE,
    });
    return result[0][0];
  } catch (error) {
    console.error("Error deleting lot:", error);
    throw error;
  }
};

const finalizeJobReport = async ({ jobNo, deletedLotIds, resolvedBy }) => {
  return db.sequelize.transaction(async (t) => {
    for (const lotId of deletedLotIds) {
      const deletedLotInfo = await deleteLotInTransaction(lotId, t);
      if (deletedLotInfo) {
        await logActivity(
          {
            activityType: "lot_deleted",
            userId: resolvedBy,
            relatedJobNo: deletedLotInfo.jobNo,
            relatedLotId: lotId,
            details: {
              lotNo: deletedLotInfo.lotNo,
              reason: "Finalized extra lot report",
            },
          },
          t
        );
      }
    }
    const resetReportFlagQuery = `
      UPDATE public.lot
      SET report = false
      WHERE "jobNo" = :jobNo AND status = 'Pending';
    `;
    await db.sequelize.query(resetReportFlagQuery, {
      replacements: { jobNo },
      transaction: t,
    });
    await updateJobReportStatus({ jobNo, status: "resolved", resolvedBy }, t);
    await logActivity(
      {
        activityType: "report_finalized",
        userId: resolvedBy,
        relatedJobNo: jobNo,
        details: { resolution: "Extra lots deleted and report closed" },
      },
      t
    );
  });
};

const logActivity = async (
  {
    activityType,
    userId,
    details = {},
    relatedJobNo = null,
    relatedLotId = null,
  },
  transaction
) => {
  try {
    const query = `
      INSERT INTO public.activity_logs ("activityType", "userId", "details", "relatedJobNo", "relatedLotId")
      VALUES (:activityType, :userId, :details::jsonb, :relatedJobNo, :relatedLotId);
    `;
    await db.sequelize.query(query, {
      replacements: {
        activityType,
        userId,
        details: JSON.stringify(details),
        relatedJobNo,
        relatedLotId,
      },
      type: db.sequelize.QueryTypes.INSERT,
      transaction,
    });
  } catch (error) {
    console.error("Error logging activity:", error);
    throw error;
  }
};

const addMissingLot = async ({ jobNo, lotDetails, resolvedBy }) => {
  return db.sequelize.transaction(async (t) => {
    const newLot = await addLackingLotToJob({ jobNo, lotDetails }, t);
    await updateJobReportStatus({ jobNo, status: "resolved", resolvedBy }, t);
    await logActivity(
      {
        activityType: "lot_added",
        userId: resolvedBy,
        relatedJobNo: jobNo,
        relatedLotId: newLot.lotId,
        details: { ...lotDetails, reason: "Resolved lacking lot report" },
      },
      t
    );
    return newLot;
  });
};

const getOfficePendingStatus = async (userId) => {
  try {
    // LOGIC UPDATE:
    // Fetches MAX(updatedAt) from 'scheduleinbounds' and 'scheduleoutbounds'
    // instead of 'lot' and 'selectedinbounds', matching Supervisor logic.

    const query = `
      WITH pending_schedules AS (
        -- 1. Inbound Schedules with Pending Lots
        -- We join lot to ensure we only check schedules that actually have pending work
        SELECT MAX(s."updatedAt") as "latestUpdate"
        FROM public.scheduleinbounds s
        JOIN public.lot l ON s."jobNo" = l."jobNo"
        WHERE l.status = 'Pending'
           OR l.report = true 
           OR l."reportDuplicate" = true
           OR l."isDuplicated" = true

        UNION ALL

        -- 2. Outbound Schedules with non-outbounded items
        SELECT MAX(so."updatedAt") as "latestUpdate"
        FROM public.scheduleoutbounds so
        JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
        WHERE si."isOutbounded" = false
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
      FROM pending_schedules;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { userId },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });

    if (!result) {
      return { hasPending: false, lastUpdated: null, lastReadTime: null };
    }

    return {
      hasPending: result.hasPending === true || result.hasPending === 1,
      lastUpdated: result.lastUpdated ? new Date(result.lastUpdated) : null,
      lastReadTime: result.lastReadTime ? new Date(result.lastReadTime) : null,
    };
  } catch (error) {
    console.error("Error checking office status:", error);
    return { hasPending: false, lastUpdated: null, lastReadTime: null };
  }
};

const getLotInboundDate = async (jobNo, lotNo, exWarehouseLot) => {
  try {
    const query = `
      SELECT 
        TO_CHAR("inbounddate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YYYY') AS "inboundDate"
      FROM public.lot
      WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo AND "exWarehouseLot" = :exWarehouseLot
      ORDER BY "updatedAt" DESC
      LIMIT 1;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo, lotNo, exWarehouseLot },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result[0] || null;
  } catch (error) {
    console.error("Error fetching lot inbound date:", error);
    throw error;
  }
};

const updateLotInboundDate = async (
  jobNo,
  lotNo,
  exWarehouseLot,
  inboundDate
) => {
  try {
    const query = `
      UPDATE public.lot
      SET "inbounddate" = :inboundDate, "updatedAt" = NOW()
      WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo AND "exWarehouseLot" = :exWarehouseLot
      RETURNING *;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo, lotNo, exWarehouseLot, inboundDate },
      type: db.sequelize.QueryTypes.UPDATE,
    });
    return result[0];
  } catch (error) {
    console.error("Error updating lot inbound date:", error);
    throw error;
  }
};

module.exports = {
  findInboundTasksOffice,
  findOutboundTasksOffice,
  updateReportStatus,
  updateDuplicateStatus,
  pendingTasksUpdateQuantity,
  getReportSupervisorUsername,
  getDuplicateReportUsername,
  updateLotInboundDate,
  getLotInboundDate,
  getOfficeFilterOptions,
  updateLotOutboundDates,
  getLotOutboundDates,
  getJobReportInfo,
  updateJobReportStatus,
  logActivity,
  finalizeJobReport,
  addMissingLot,
  addLackingLotToJob,
  deleteLot,
  getOfficePendingStatus,
};