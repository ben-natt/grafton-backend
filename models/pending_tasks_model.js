const db = require("../database");

// ------------------------ Supervisor Flow ----------------------

// Helper function to format date consistently
const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

// --- INBOUND (New unified function from previous request) ---
const getPendingInboundTasks = async (
  page = 1,
  pageSize = 10,
  filters = {}
) => {
  try {
    const { startDate, endDate, exWarehouseLot } = filters;
    const offset = (page - 1) * pageSize;

    // base filters for "visible + pending" lots
    const baseWhere = [
      `l.status = 'Pending'`,
      `l.report = False`,
      `(l."reportDuplicate" = False OR l."isDuplicated" = True)`,
    ];
    const replacements = {};

    if (exWarehouseLot) {
      baseWhere.push(`l."exWarehouseLot" ILIKE :exWarehouseLot`);
      replacements.exWarehouseLot = `%${exWarehouseLot}%`;
    }

    const baseWhereString = baseWhere.join(" AND ");

    // compute min/max inbound dates PER JOB (in SG date) in a CTE, then filter/paginate on that.
    const dateOverlapWhere =
      startDate && endDate
        ? `WHERE jr.max_date >= :startDate::date AND jr.min_date <= :endDate::date`
        : "";

    if (startDate && endDate) {
      replacements.startDate = startDate;
      replacements.endDate = endDate;
    }

    // count jobs
    const countQuery = `
      WITH jr AS (
        SELECT
          l."jobNo",
          MIN((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS min_date,
          MAX((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS max_date
        FROM public.lot l
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

    // paginated jobNos (from aggregated ranges)
    const jobNoQuery = `
      WITH jr AS (
        SELECT
          l."jobNo",
          MIN((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS min_date,
          MAX((l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date) AS max_date
        FROM public.lot l
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

    // fetch lot details for those jobs (keep your existing visibility filters)
    const detailsQuery = `
      SELECT
        l."lotId", l."lotNo", l."jobNo", l.commodity, l."expectedBundleCount",
        l.brand, l."exWarehouseLot", l."exLmeWarehouse", l.shape, l.report,
        l."isDuplicated", l."inbounddate",
        u.username
      FROM public.lot l
      JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      JOIN public.users u ON s."userId" = u.userid
      WHERE l."jobNo" IN (:paginatedJobNos)
        AND l.status = 'Pending'
        AND l.report = False
        AND (l."reportDuplicate" = False OR l."isDuplicated" = True)
      ORDER BY l."inbounddate" ASC, l."jobNo" ASC, l."exWarehouseLot" ASC;
    `;

    const detailsForPage = await db.sequelize.query(detailsQuery, {
      replacements: { paginatedJobNos },
      type: db.sequelize.QueryTypes.SELECT,
    });

    // group and compute display date (single vs range) 
    const groupedByJobNo = detailsForPage.reduce((acc, lot) => {
      const jobNo = lot.jobNo;
      if (!acc[jobNo]) {
        acc[jobNo] = {
          jobNo,
          userInfo: { username: lot.username || "N/A", inboundDate: null },
          lotDetails: [],
          inboundDates: [],
        };
      }
      if (lot.inbounddate) acc[jobNo].inboundDates.push(new Date(lot.inbounddate));
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
        isDuplicated: lot.isDuplicated,
      });
      return acc;
    }, {});


Object.values(groupedByJobNo).forEach((group) => {
  if (group.inboundDates.length > 0) {
    const minDate = new Date(Math.min(...group.inboundDates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...group.inboundDates.map((d) => d.getTime())));
    
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
    console.error("Error fetching pending inbound tasks:", error);
    throw error;
  }
};

// --- OUTBOUND (New unified function) ---
const getPendingOutboundTasks = async (
  page = 1,
  pageSize = 10,
  filters = {}
) => {
  try {
    const { startDate, endDate, jobNo } = filters;
    const offset = (page - 1) * pageSize;

    let baseWhere = [`si."isOutbounded" = false`];
    const replacements = {};

    if (jobNo) {
      baseWhere.push(
        `(i."jobNo" iLIKE :jobNo OR CONCAT('SINO', LPAD(so."scheduleOutboundId"::TEXT, 3, '0')) iLIKE :jobNo)`
      );
      replacements.jobNo = `%${jobNo}%`;
    }

    const baseWhereString = baseWhere.join(" AND ");

    // Use CTE approach similar to inbound logic
    const dateOverlapWhere = startDate && endDate 
      ? `WHERE sr.max_release_date >= :startDate::date AND sr.min_release_date <= :endDate::date`
      : "";

    if (startDate && endDate) {
      replacements.startDate = startDate;
      replacements.endDate = endDate;
    }

    // Count query using CTE for date ranges
    const countQuery = `
      WITH schedule_ranges AS (
        SELECT
          so."scheduleOutboundId",
          MIN(si."releaseDate") AS min_release_date,
          MAX(COALESCE(si."releaseEndDate", si."releaseDate")) AS max_release_date
        FROM public.scheduleoutbounds so
        JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
        JOIN public.inbounds i ON si."inboundId" = i."inboundId"
        WHERE ${baseWhereString}
        GROUP BY so."scheduleOutboundId"
      )
      SELECT COUNT(*)::int AS count
      FROM schedule_ranges sr
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

    // Get paginated schedule IDs using CTE
    const scheduleIdQuery = `
      WITH schedule_ranges AS (
        SELECT
          so."scheduleOutboundId",
          MIN(si."releaseDate") AS min_release_date,
          MAX(COALESCE(si."releaseEndDate", si."releaseDate")) AS max_release_date
        FROM public.scheduleoutbounds so
        JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
        JOIN public.inbounds i ON si."inboundId" = i."inboundId"
        WHERE ${baseWhereString}
        GROUP BY so."scheduleOutboundId"
      )
      SELECT sr."scheduleOutboundId"
      FROM schedule_ranges sr
      ${dateOverlapWhere}
      ORDER BY sr.min_release_date ASC, sr."scheduleOutboundId" ASC
      LIMIT :limit OFFSET :offset;
    `;

    const scheduleIdResults = await db.sequelize.query(scheduleIdQuery, {
      replacements: { ...replacements, limit: pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });

    const paginatedScheduleIds = scheduleIdResults.map(
      (s) => s.scheduleOutboundId
    );

    if (paginatedScheduleIds.length === 0) {
      return { data: [], page, pageSize, totalPages, totalCount };
    }

    // Fetch details for the paginated schedule IDs
    const detailsQuery = `
      SELECT
        so."scheduleOutboundId",
        si."selectedInboundId",
        CONCAT('SINO', LPAD(so."scheduleOutboundId"::TEXT, 3, '0')) AS "outboundJobNo",
        si."releaseDate",
        si."releaseEndDate",
        so."stuffingDate", 
        so."containerNo", 
        so."sealNo",
        u.username,
        i."jobNo", 
        i."lotNo", 
        i."noOfBundle" as "expectedBundleCount",
        i."exWarehouseLot", 
        w."exLmeWarehouseName" as "exLmeWarehouse",
        b."brandName" as brand, 
        c."commodityName" as commodity, 
        s."shapeName" as shape
      FROM public.scheduleoutbounds so
      JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
      JOIN public.inbounds i ON si."inboundId" = i."inboundId"
      JOIN public.users u ON so."userId" = u."userid"
      LEFT JOIN public.brands b ON i."brandId" = b."brandId"
      LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
      LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
      LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId"
      WHERE so."scheduleOutboundId" IN (:paginatedScheduleIds) 
        AND si."isOutbounded" = false
      ORDER BY si."releaseDate" ASC, i."jobNo" ASC, i."lotNo" ASC;
    `;

    const detailsForPage = await db.sequelize.query(detailsQuery, {
      replacements: { paginatedScheduleIds },
      type: db.sequelize.QueryTypes.SELECT,
    });

    // Group by schedule ID and calculate date ranges
    const groupedByScheduleId = detailsForPage.reduce((acc, item) => {
      const scheduleId = item.scheduleOutboundId;
      if (!acc[scheduleId]) {
        acc[scheduleId] = {
          scheduleInfo: {
            scheduleOutboundId: scheduleId,
            outboundJobNo: item.outboundJobNo,
          },
          userInfo: {
            username: item.username,
            stuffingDate: item.stuffingDate ? formatDate(item.stuffingDate) : null,
            containerNo: item.containerNo,
            sealNo: item.sealNo,
          },
          lotDetails: [],
          releaseDates: [],
        };
      }

      // Collect all release dates for this schedule to calculate range later
      if (item.releaseDate) acc[scheduleId].releaseDates.push(new Date(item.releaseDate));
      if (item.releaseEndDate) acc[scheduleId].releaseDates.push(new Date(item.releaseEndDate));

      acc[scheduleId].lotDetails.push({
        selectedInboundId: item.selectedInboundId,
        jobNo: item.jobNo,
        lotNo: item.lotNo,
        expectedBundleCount: item.expectedBundleCount,
        exWarehouseLot: item.exWarehouseLot,
        exLmeWarehouse: item.exLmeWarehouse,
        brand: item.brand,
        commodity: item.commodity,
        shape: item.shape,
      });
      return acc;
    }, {});

    // Calculate date ranges for each schedule (similar to inbound logic)
Object.values(groupedByScheduleId).forEach((group) => {
  if (group.releaseDates.length > 0) {
    const minDate = new Date(Math.min(...group.releaseDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...group.releaseDates.map(d => d.getTime())));
    
    // Check if dates are the same (compare date strings to avoid time differences)
    const minDateString = minDate.toDateString();
    const maxDateString = maxDate.toDateString();
    
    group.userInfo.releaseDate = formatDate(minDate);
    group.userInfo.releaseEndDate = 
      minDateString === maxDateString 
        ? null 
        : formatDate(maxDate);
  } else {
    group.userInfo.releaseDate = null;
    group.userInfo.releaseEndDate = null;
  }
  delete group.releaseDates;
});

    const finalData = Object.values(groupedByScheduleId);
    return { data: finalData, page, pageSize, totalPages, totalCount };
  } catch (error) {
    console.error("Error fetching pending outbound tasks:", error);
    throw error;
  }
};
// --- Legacy functions below for compatibility ---
const findJobNoPendingTasks = async (page = 1, pageSize = 10) => {
  try {
    const offset = (page - 1) * pageSize;
    const countQuery = `SELECT COUNT(DISTINCT l."jobNo")::int FROM public.lot l JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo" WHERE l."status" = 'Pending' AND l."report" = 'False'`;
    const countResult = await db.sequelize.query(countQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;
    const dataQuery = `SELECT * FROM (SELECT DISTINCT ON (l."jobNo") l."jobNo", s."inboundDate" FROM public.lot l JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo" WHERE l."status" = 'Pending' AND l."report" = 'False' ORDER BY l."jobNo", s."inboundDate" ASC) AS distinct_jobs ORDER BY distinct_jobs."inboundDate" ASC LIMIT :limit OFFSET :offset;`;
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
const getDetailsPendingTasks = async (jobNo) => {
  try {
    const query = `SELECT "lotId", "lotNo","jobNo", "commodity", "expectedBundleCount", "brand", "exWarehouseLot", "exLmeWarehouse", "shape", "report" FROM public.lot WHERE "jobNo" = :jobNo AND "status" = 'Pending' AND "report" = 'False' ORDER BY "exWarehouseLot" ASC;`;
    return await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};
const pendingTasksUserId = async (jobNo) => {
  try {
    const query = `SELECT u."username", TO_CHAR(s."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "inboundDate" FROM public.scheduleinbounds s JOIN public.lot l ON s."jobNo" = l."jobNo" JOIN public.users u ON s."userId" = u."userid" WHERE l."jobNo" = :jobNo AND l."status" = 'Pending'`;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });
    if (result.length === 0)
      return { username: "", dateRange: "", inboundDates: [] };
    const dates = result.map((r) => new Date(r.inboundDate));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const inboundDates = result.map((r) => r.inboundDate);
    let formattedRange;
    if (minDate.getTime() === maxDate.getTime()) {
      formattedRange = `${minDate.getDate()} ${minDate.toLocaleString("en-SG", {
        month: "long",
      })} ${minDate.getFullYear()}`;
    } else {
      formattedRange = `${minDate.getDate()} ${minDate.toLocaleString("en-SG", {
        month: "long",
      })} ${minDate.getFullYear()} - ${maxDate.getDate()} ${maxDate.toLocaleString(
        "en-SG",
        { month: "long" }
      )} ${maxDate.getFullYear()}`;
    }
    return {
      username: result[0].username || "",
      dateRange: formattedRange || "",
      inboundDates: inboundDates,
    };
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};
const findScheduleIdPendingOutbound = async (page = 1, pageSize = 10) => {
  try {
    const offset = (page - 1) * pageSize;
    const countQuery = `SELECT COUNT(DISTINCT so."scheduleOutboundId")::int FROM public.scheduleoutbounds so JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId" WHERE si."isOutbounded" = false`;
    const countResult = await db.sequelize.query(countQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;
    const dataQuery = `SELECT DISTINCT so."scheduleOutboundId", CONCAT('SINO', LPAD(so."scheduleOutboundId"::TEXT, 3, '0')) AS "outboundJobNo", so."releaseDate" FROM public.scheduleoutbounds so JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId" WHERE si."isOutbounded" = false ORDER BY so."releaseDate" ASC LIMIT :limit OFFSET :offset`;
    const data = await db.sequelize.query(dataQuery, {
      replacements: { limit: pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return { totalCount, data };
  } catch (error) {
    console.error("Error fetching pending outbound schedule IDs:", error);
    throw error;
  }
};
const getDetailsPendingOutbound = async (scheduleOutboundId) => {
  try {
    const query = `SELECT si."selectedInboundId", i."jobNo", i."lotNo", s."shapeName" as shape, i."noOfBundle" as "expectedBundleCount", b."brandName" AS "brand", c."commodityName" AS "commodity", w."exLmeWarehouseName" AS "exLmeWarehouse", i."exWarehouseLot", so."lotReleaseWeight" FROM public.selectedinbounds si JOIN public.inbounds i ON si."inboundId" = i."inboundId" JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId" LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId" LEFT JOIN public.brands b ON i."brandId" = b."brandId" LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId" LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId" WHERE si."scheduleOutboundId" = :scheduleOutboundId AND si."isOutbounded" = false ORDER BY i."lotNo" ASC`;
    return await db.sequelize.query(query, {
      replacements: { scheduleOutboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });
  } catch (error) {
    console.error("Error fetching pending outbound task details:", error);
    throw error;
  }
};
const pendingOutboundTasksUser = async (scheduleOutboundId) => {
  try {
    const query = `SELECT u."username", TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "releaseDate", TO_CHAR(so."stuffingDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "stuffingDate", so."containerNo", so."sealNo" FROM public.scheduleoutbounds so JOIN public.users u ON so."userId" = u."userid" WHERE so."scheduleOutboundId" = :scheduleOutboundId LIMIT 1;`;
    const result = await db.sequelize.query(query, {
      replacements: { scheduleOutboundId },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    return {
      username: result?.username || "N/A",
      releaseDate: result?.releaseDate || "N/A",
      stuffingDate: result?.stuffingDate,
      containerNo: result?.containerNo,
      sealNo: result?.sealNo,
    };
  } catch (error) {
    console.error("Error fetching user info for outbound tasks:", error);
    throw error;
  }
};

// --------------------- Office Flow ----------------------
// ----- INBOUND ROUTES -------
const findInboundTasksOffice = async (
  filters = {},
  page = 1,
  pageSize = 10
) => {
  try {
    const offset = (page - 1) * pageSize;
    let whereClauses = `l.status = 'Pending'`;
    const replacements = {};

    if (filters.startDate && filters.endDate) {
      whereClauses += ` AND (l."inbounddate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate AND :endDate`;
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }
    if (filters.lotNo) {
      const [jobNo, lotNo] = filters.lotNo.split(" - ");
      whereClauses += ` AND l."jobNo" = :jobNo AND l."lotNo"::text = :lotNo`;
      replacements.jobNo = jobNo;
      replacements.lotNo = lotNo;
    }
    if (filters.commodity) {
      whereClauses += ` AND l.commodity = :commodity`;
      replacements.commodity = filters.commodity;
    }
    if (filters.brand) {
      whereClauses += ` AND l.brand = :brand`;
      replacements.brand = filters.brand;
    }
    if (filters.shape) {
      whereClauses += ` AND l.shape = :shape`;
      replacements.shape = filters.shape;
    }
    if (filters.quantity) {
      whereClauses += ` AND l."expectedBundleCount" = :quantity`;
      replacements.quantity = parseInt(filters.quantity, 10);
    }
    if (filters.scheduledBy) {
      whereClauses += ` AND u.username = :scheduledBy`;
      replacements.scheduledBy = filters.scheduledBy;
    }

    if (filters.type) {
      if (filters.type === "Discrepancies") {
        whereClauses += ` AND l.report = true`;
      } else if (filters.type === "Duplicated") {
        whereClauses += ` AND l."reportDuplicate" = true`;
      }
    }

    const countQuery = `
      SELECT COUNT(DISTINCT l."jobNo")::int
      FROM public.lot l
      LEFT JOIN public.scheduleinbounds s ON s."scheduleInboundId" = l."scheduleInboundId"
      LEFT JOIN public.users u ON s."userId" = u."userid"
      WHERE ${whereClauses}
    `;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;
    
    const jobNoQuery = `
      SELECT l."jobNo"
      FROM public.lot l
      LEFT JOIN public.scheduleinbounds s ON s."scheduleInboundId" = l."scheduleInboundId"
      LEFT JOIN public.users u ON s."userId" = u."userid"
      WHERE ${whereClauses}
      GROUP BY l."jobNo"
      ORDER BY MIN(l."inbounddate") ASC
      LIMIT :pageSize OFFSET :offset
    `;

    
    const jobNosResult = await db.sequelize.query(jobNoQuery, {
      replacements: { ...replacements, pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });
    const jobNos = jobNosResult.map((j) => j.jobNo);


    if (jobNos.length === 0) {
      return { totalCount, data: {} };
    }

    const tasksQuery = `
      SELECT
        l."jobNo",
        TO_CHAR(l."inbounddate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "date",
        l."lotId",
        l."lotNo"::text AS "lotNo",
        l."exWarehouseLot" AS "exWLot",
        l.commodity AS "metal",
        l.brand,
        l.shape,
        l."expectedBundleCount" AS quantity,
        COALESCE(u.username, 'N/A') AS "scheduledBy",
        l.report AS "hasWarning",
        l."reportDuplicate" AS "showCopyIcon"
      FROM public.lot l
      LEFT JOIN public.scheduleinbounds s ON s."scheduleInboundId" = l."scheduleInboundId"
      LEFT JOIN public.users u ON s."userId" = u."userid"
      WHERE l."jobNo" IN (:jobNos) AND ${whereClauses}
      ORDER BY l."inbounddate" ASC, l."lotNo"::integer ASC, l.report DESC
    `;


    const tasksResult = await db.sequelize.query(tasksQuery, {
      replacements: { ...replacements, jobNos },
      type: db.sequelize.QueryTypes.SELECT,
    });


    const tasksMap = {};
    for (const task of tasksResult) {
      if (!tasksMap[task.jobNo]) {
        tasksMap[task.jobNo] = [];
      }
      tasksMap[task.jobNo].push({ ...task, canEdit: false, isEditing: false });
    }

    Object.keys(tasksMap).forEach(jobNo => {
      console.log(`  JobNo ${jobNo}: ${tasksMap[jobNo].length} lots`);
      tasksMap[jobNo].forEach((lot, index) => {
        console.log(`    Lot ${index + 1}: ${lot.lotNo} (ID: ${lot.lotId})`);
      });
    });


    return { totalCount, data: tasksMap };
  } catch (error) {
    console.error("Error fetching filtered inbound tasks:", error);
    throw error;
  }
};

// Update lot inbounddate (updated to work with lot table) (edit functionality)
const getLotInboundDate = async (jobNo, lotNo) => {
  try {
    const query = `
      SELECT 
        TO_CHAR("inbounddate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YYYY') AS "inboundDate"
      FROM public.lot
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
    console.error("Error fetching lot inbound date:", error);
    throw error;
  }
};

// Update lot inbounddate (specific to jobNo + lotNo) (edit functionality)
const updateLotInboundDate = async (jobNo, lotNo, inboundDate) => {
  try {
    const query = `
      UPDATE public.lot
      SET "inbounddate" = :inboundDate, "updatedAt" = NOW()
      WHERE "jobNo" = :jobNo AND "lotNo" = :lotNo
      RETURNING *;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo, lotNo, inboundDate },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    return result[0];
  } catch (error) {
    console.error("Error updating lot inbound date:", error);
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

    if (filters.startDate && filters.endDate) {
      // Changed to use releaseDate from selectedinbounds table
      whereClauses += ` AND (si."releaseDate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate AND :endDate`;
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }
    if (filters.lotNo) {
      const [jobNo, lotNo] = filters.lotNo.split(" - ");
      whereClauses += ` AND i."jobNo"::text = :jobNo AND i."lotNo"::text = :lotNo`;
      replacements.jobNo = jobNo;
      replacements.lotNo = lotNo;
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
  so."scheduleOutboundId",
  si."selectedInboundId",
  i."jobNo",
  i."lotNo"::text AS "lotNo",
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
      const scheduleId = task.scheduleOutboundId.toString();
      if (!tasksMap[scheduleId]) {
        tasksMap[scheduleId] = [];
      }

      // Create release date range string
      let releaseDateRange = task.releaseDate || '';
      if (task.releaseDate && task.releaseEndDate && task.releaseDate !== task.releaseEndDate) {
        releaseDateRange = `${task.releaseDate} - ${task.releaseEndDate}`;
      }

      tasksMap[scheduleId].push({
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
  }
  catch (error) {
    console.error("Error fetching filtered outbound tasks:", error);
    throw error;
  }
};

// Get outbound dates for a specific lot
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

// Helper function to convert DD/MM/YYYY to YYYY-MM-DD
const convertDateFormat = (dateString) => {
  if (!dateString) return null;

  // Check if it's already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  // Convert DD/MM/YYYY to YYYY-MM-DD
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
    const [day, month, year] = dateString.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
};

// Updated updateLotOutboundDates with date conversion
const updateLotOutboundDates = async (jobNo, lotNo, releaseDate, releaseEndDate, exportDate, deliveryDate) => {
  try {
    // Convert dates from DD/MM/YYYY to YYYY-MM-DD format
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
        deliveryDate: convertedDeliveryDate
      },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    return result[0];
  } catch (error) {
    console.error("Error updating lot outbound dates:", error);
    throw error;
  }
}


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
          "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
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
          "updatedAt" = (NOW() AT TIME ZONE 'Asia/Singapore')
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




module.exports = {
  // Inbound
  getDetailsPendingTasks,
  pendingTasksUserId,
  findJobNoPendingTasks,
  findInboundTasksOffice,
  updateReportStatus,
  updateDuplicateStatus,
  pendingTasksUpdateQuantity,
  getReportSupervisorUsername,
  updateLotInboundDate,
  getLotInboundDate,
  // Outbound
  findScheduleIdPendingOutbound,
  getDetailsPendingOutbound,
  pendingOutboundTasksUser,
  findOutboundTasksOffice,
  getPendingOutboundTasks,
  // New
  getOfficeFilterOptions,
  getPendingInboundTasks, // Export the new function
  updateLotOutboundDates,
  getLotOutboundDates

};