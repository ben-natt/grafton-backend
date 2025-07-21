const db = require("../database");

// --- INBOUND ---
const findJobNoPendingTasks = async (page = 1, pageSize = 10) => {
  try {
    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(DISTINCT l."jobNo")::int
      FROM public.lot l
      JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      WHERE l."status" = 'Pending' AND l."report" = 'False'
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
        WHERE l."status" = 'Pending' AND l."report" = 'False'
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

const getDetailsPendingTasks = async (jobNo) => {
  try {
    const query = `
    SELECT "lotId", "lotNo","jobNo", "commodity", "expectedBundleCount", "brand",
           "exWarehouseLot", "exLmeWarehouse", "shape", "report"
    FROM public.lot
    WHERE "jobNo" = :jobNo AND "status" = 'Pending' AND "report" = 'False'
    ORDER BY "exWarehouseLot" ASC;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (result.length > 0) {
      console.log("Query result:", result);
      console.log("First result keys:", Object.keys(result[0]));
    } else {
      console.log("No pending tasks found for jobNo:", jobNo);
    }
    return result;
  } catch (error) {
    console.error("Error in /pending-tasks route:", error);
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

const pendingTasksUserId = async (jobNo) => {
  try {
    const query = `
          SELECT 
            u."username", 
            TO_CHAR(s."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "inboundDate"
          FROM public.scheduleinbounds s
          JOIN public.lot l ON s."jobNo" = l."jobNo"
          JOIN public.users u ON s."userId" = u."userid"
          WHERE l."jobNo" = :jobNo AND l."status" = 'Pending'
        `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (result.length === 0) {
      console.log("No results found for jobNo:", jobNo);
      return {
        username: "",
        dateRange: "",
        inboundDates: [], // Add empty array
      };
    }

    const dates = result.map((r) => new Date(r.inboundDate));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // Get array of all inbound dates in YYYY-MM-DD format
    const inboundDates = result.map((r) => r.inboundDate);

    let formattedRange;

    if (minDate.getTime() === maxDate.getTime()) {
      const day = minDate.getDate();
      const month = minDate.toLocaleString("en-SG", { month: "long" });
      const year = minDate.getFullYear();
      formattedRange = `${day} ${month} ${year}`;
    } else {
      const minDay = minDate.getDate();
      const maxDay = maxDate.getDate();
      const minMonth = minDate.toLocaleString("en-SG", { month: "long" });
      const maxMonth = maxDate.toLocaleString("en-SG", { month: "long" });
      const minYear = minDate.getFullYear();
      const maxYear = maxDate.getFullYear();

      if (minYear === maxYear) {
        if (minMonth === maxMonth) {
          formattedRange = `${minDay} ${minMonth} - ${maxDay} ${maxMonth} ${maxYear}`;
        } else {
          formattedRange = `${minDay} ${minMonth} - ${maxDay} ${maxMonth} ${maxYear}`;
        }
      } else {
        formattedRange = `${minDay} ${minMonth} ${minYear} - ${maxDay} ${maxMonth} ${maxYear}`;
      }
    }

    console.log("Returning result:", {
      username: result[0].username || "",
      dateRange: formattedRange || "",
      inboundDates: inboundDates, // Include the dates array
    });

    return {
      username: result[0].username || "",
      dateRange: formattedRange || "",
      inboundDates: inboundDates, // Return array of dates
    };
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

const pendingTasksUserIdSingleDate = async (jobNo) => {
  try {
    const query = `
          SELECT 
            u."username", 
            TO_CHAR(s."inboundDate" AT TIME ZONE 'Asia/Singapore', 'DD-MM-YYYY') AS "inboundDate"
          FROM public.scheduleinbounds s
          JOIN public.lot l ON s."jobNo" = l."jobNo"
          JOIN public.users u ON s."userId" = u."userid"
          WHERE l."jobNo" = :jobNo AND l."status" = 'Pending'
        `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (result.length > 0) {
      console.log("Query result:", result);
      console.log("First result keys:", Object.keys(result[0]));
    } else {
      console.log("No pending tasks found for jobNo:", jobNo);
    }
    return result;
  } catch (error) {
    console.error("Error in /pending-tasks route:", error);
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

const getDetailsPendingTasksOrderByReport = async (jobNo) => {
  try {
    const query = `
SELECT 
    "lotId", 
    LPAD("lotNo"::text, 2, '0') AS "lotNo", 
    "jobNo", 
    "commodity", 
    "expectedBundleCount", 
    "brand",
    "exWarehouseLot", 
    "exLmeWarehouse", 
    "shape", 
    "report"
FROM public.lot
WHERE "jobNo" = :jobNo AND "status" = 'Pending'
ORDER BY "report" DESC;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (result.length > 0) {
      console.log("Query result:", result);
      console.log("First result keys:", Object.keys(result[0]));
    } else {
      console.log("No pending tasks found for jobNo:", jobNo);
    }
    return result;
  } catch (error) {
    console.error("Error in /pending-tasks route:", error);
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

const findJobNoOfficePendingTasks = async () => {
  try {
    const query = `
    SELECT *
    FROM (
      SELECT DISTINCT ON (l."jobNo") l."jobNo", s."inboundDate"
      FROM public.lot l
      JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      WHERE l."status" = 'Pending'
      ORDER BY l."jobNo", s."inboundDate" ASC
    ) AS distinct_jobs
    ORDER BY distinct_jobs."inboundDate" ASC;
        `;
    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

// --- OUTBOUND ---
const findScheduleIdPendingOutbound = async (page = 1, pageSize = 10) => {
  try {
    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(DISTINCT so."scheduleOutboundId")::int
      FROM public.scheduleoutbounds so
      JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
      WHERE si."isOutbounded" = false
    `;
    const countResult = await db.sequelize.query(countQuery, {
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;

    const dataQuery = `
      SELECT DISTINCT so."scheduleOutboundId",
      CONCAT('SINO', LPAD(so."scheduleOutboundId"::TEXT, 3, '0')) AS "outboundJobNo", so."releaseDate"
      FROM public.scheduleoutbounds so
      JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
      WHERE si."isOutbounded" = false
      ORDER BY so."releaseDate" ASC
      LIMIT :limit OFFSET :offset
    `;
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
    const query = `
            SELECT
                si."selectedInboundId",
                i."jobNo",
                i."lotNo",
                s."shapeName" as shape,
                i."noOfBundle" as "expectedBundleCount",
                b."brandName" AS "brand",
                c."commodityName" AS "commodity",
                w."exLmeWarehouseName" AS "exLmeWarehouse",
                i."exWarehouseLot",
                so."lotReleaseWeight"
            FROM public.selectedinbounds si
            JOIN public.inbounds i ON si."inboundId" = i."inboundId"
            JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
            LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
            LEFT JOIN public.brands b ON i."brandId" = b."brandId"
            LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId"
            LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
            WHERE si."scheduleOutboundId" = :scheduleOutboundId AND si."isOutbounded" = false
            ORDER BY i."lotNo" ASC
        `;
    const result = await db.sequelize.query(query, {
      replacements: { scheduleOutboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching pending outbound task details:", error);
    throw error;
  }
};

const pendingOutboundTasksUser = async (scheduleOutboundId) => {
  try {
    const query = `
            SELECT
                u."username",
                TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "releaseDate",
                TO_CHAR(so."stuffingDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "stuffingDate",
                so."containerNo",
                so."sealNo"
            FROM public.scheduleoutbounds so
            JOIN public.users u ON so."userId" = u."userid"
            WHERE so."scheduleOutboundId" = :scheduleOutboundId
            LIMIT 1;
        `;
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

const getDetailsPendingOutboundOffice = async (scheduleOutboundId) => {
  try {
    const query = `
            SELECT
              si."selectedInboundId",
                i."jobNo",
                i."lotNo",
                i."noOfBundle" as "quantity",
                b."brandName" AS "brand",
                c."commodityName" AS "metal",
                i."exWarehouseLot",
                sh."shapeName",
                so."lotReleaseWeight"
            FROM public.selectedinbounds si
            JOIN public.inbounds i ON si."inboundId" = i."inboundId"
            JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
            LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
            LEFT JOIN public.shapes sh ON i."shapeId" = sh."shapeId"
            LEFT JOIN public.brands b ON i."brandId" = b."brandId"
            LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId"
            WHERE si."scheduleOutboundId" = :scheduleOutboundId AND si."isOutbounded" = false
            ORDER BY i."lotNo" ASC
        `;
    const result = await db.sequelize.query(query, {
      replacements: { scheduleOutboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching pending outbound task details:", error);
    throw error;
  }
};

const pendingOutboundTasksUserIdSingleDate = async (scheduleOutboundId) => {
  try {
    const query = `
    SELECT
        u."username",
        TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD-MM-YYYY') AS "releaseDate",
        so."sealNo"
    FROM public.scheduleoutbounds so
    JOIN public.users u ON so."userId" = u."userid"
            WHERE so."scheduleOutboundId" = :scheduleOutboundId;
      `;

    const result = await db.sequelize.query(query, {
      replacements: { scheduleOutboundId },
      type: db.sequelize.QueryTypes.SELECT,
    });

    if (result.length > 0) {
      console.log("Query result:", result);
      console.log("First result keys:", Object.keys(result[0]));
    } else {
      console.log(
        "No pending tasks found for scheduleOutboundId:",
        scheduleOutboundId
      );
    }
    return result;
  } catch (error) {
    console.error("Error in /pending-tasks route:", error);
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

const findScheduleIdPendingOutboundOffice = async () => {
  try {
    const query = `
            SELECT DISTINCT so."scheduleOutboundId",
            CONCAT('SINO', LPAD(so."scheduleOutboundId"::TEXT, 3, '0')) AS "outboundJobNo", so."releaseDate"
            FROM public.scheduleoutbounds so
            JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
            WHERE si."isOutbounded" = false
            ORDER BY so."releaseDate" ASC
        `;
    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching pending outbound schedule IDs:", error);
    throw error;
  }
};

// Office Functions
// Updated by Redwan

const findInboundTasksOffice = async (
  filters = {},
  page = 1,
  pageSize = 10
) => {
  try {
    const offset = (page - 1) * pageSize;
    let whereClauses = `l.status = 'Pending'`;
    const replacements = {};

    // Build filter conditions
    if (filters.startDate && filters.endDate) {
      // FIX: Use AT TIME ZONE for correct date casting
      whereClauses += ` AND (s."inboundDate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate AND :endDate`;
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
      whereClauses += ` AND l.report = :hasWarning`;
      replacements.hasWarning = filters.type === "Discrepancies";
    }

    // Get total count of job groups
    const countQuery = `
      SELECT COUNT(DISTINCT l."jobNo")::int
      FROM public.lot l
      JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      JOIN public.users u ON s."userId" = u."userid"
      WHERE ${whereClauses}
    `;
    const countResult = await db.sequelize.query(countQuery, {
      replacements,
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });
    const totalCount = countResult.count;

    // Get paginated job numbers
    const jobNoQuery = `
      SELECT DISTINCT l."jobNo"
      FROM public.lot l
      JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      JOIN public.users u ON s."userId" = u."userid"
      WHERE ${whereClauses}
      ORDER BY l."jobNo" ASC
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

    // Get all tasks for the paginated job numbers
    const tasksQuery = `
      SELECT
        l."jobNo",
        TO_CHAR(s."inboundDate" AT TIME ZONE 'Asia/Singapore', 'DD-MM-YYYY') AS "date",
        l."lotId",
        LPAD(l."lotNo"::text, 2, '0') AS "lotNo",
        l."exWarehouseLot" AS "exWLot",
        l.commodity AS "metal",
        l.brand,
        l.shape,
        l."expectedBundleCount" AS quantity,
        u.username AS "scheduledBy",
        l.report AS "hasWarning"
      FROM public.lot l
      JOIN public.scheduleinbounds s ON s."jobNo" = l."jobNo"
      JOIN public.users u ON s."userId" = u."userid"
      WHERE l."jobNo" IN (:jobNos)
      ORDER BY l."jobNo" ASC, l.report DESC, l."lotNo" ASC
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

    return { totalCount, data: tasksMap };
  } catch (error) {
    console.error("Error fetching filtered inbound tasks:", error);
    throw error;
  }
};

const findOutboundTasksOffice = async (
  filters = {},
  page = 1,
  pageSize = 10
) => {
  try {
    const offset = (page - 1) * pageSize;
    let whereClauses = `si."isOutbounded" = false`;
    const replacements = {};

    // Build filter conditions
    if (filters.startDate && filters.endDate) {
      // FIX: Use AT TIME ZONE for correct date casting
      whereClauses += ` AND (so."releaseDate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate AND :endDate`;
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }
    if (filters.lotNo) {
      const [jobNo, lotNo] = filters.lotNo.split(" - ");
      whereClauses += ` AND i."jobNo" = :jobNo AND i."lotNo"::text = :lotNo`;
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
      SELECT DISTINCT so."scheduleOutboundId"
      ${baseQuery}
      WHERE ${whereClauses}
      ORDER BY so."scheduleOutboundId" ASC
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

    // FIX: Corrected the final tasksQuery syntax
    const tasksQuery = `
      SELECT
        so."scheduleOutboundId",
        si."selectedInboundId",
        i."jobNo",
        i."lotNo",
        sh."shapeName" AS shape,
        i."noOfBundle" AS "expectedBundleCount",
        b."brandName" AS brand,
        c."commodityName" AS commodity,
        i."exWarehouseLot" AS "exWLot",
        u.username AS "scheduledBy",
        TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD-MM-YYYY') AS "releaseDate",
        so."outboundType"
      ${baseQuery}
      WHERE so."scheduleOutboundId" IN (:scheduleIds)
      ORDER BY so."scheduleOutboundId" ASC, i."lotNo" ASC
    `;
    const tasksResult = await db.sequelize.query(tasksQuery, {
      replacements: { scheduleIds },
      type: db.sequelize.QueryTypes.SELECT,
    });

    const tasksMap = {};
    for (const task of tasksResult) {
      const scheduleId = task.scheduleOutboundId.toString();
      if (!tasksMap[scheduleId]) {
        tasksMap[scheduleId] = [];
      }
      tasksMap[scheduleId].push({
        selectedInboundId: task.selectedInboundId.toString(),
        jobNo: task.jobNo.toString(),
        date: task.releaseDate,
        lotId: task.selectedInboundId.toString(),
        lotNo: task.lotNo.toString(),
        exWLot: task.exWLot,
        commodity: task.commodity,
        brand: task.brand,
        shape: task.shape,
        expectedBundleCount: task.expectedBundleCount,
        scheduledBy: task.scheduledBy,
        releaseDate: task.releaseDate,
        outboundType: task.outboundType,
      });
    }
    return { totalCount, data: tasksMap };
  } catch (error) {
    console.error("Error fetching filtered outbound tasks:", error);
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
  pendingTasksUserIdSingleDate,
  updateReportStatus,
  getDetailsPendingTasksOrderByReport,
  pendingTasksUpdateQuantity,
  findJobNoOfficePendingTasks,
  getReportSupervisorUsername,
  // Outbound
  findScheduleIdPendingOutbound,
  getDetailsPendingOutbound,
  pendingOutboundTasksUser,
  getDetailsPendingOutboundOffice,
  pendingOutboundTasksUserIdSingleDate,
  findScheduleIdPendingOutboundOffice,
  findOutboundTasksOffice,
};
