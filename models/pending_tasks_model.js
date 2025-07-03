const db = require("../database");

// --- INBOUND ---
const findJobNoPendingTasks = async (page = 1, pageSize = 10) => {
  try {
    const offset = (page - 1) * pageSize;
    const query = `
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
    const result = await db.sequelize.query(query, {
      replacements: { limit: pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });

    return result;
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
      };
    }

    const dates = result.map((r) => new Date(r.inboundDate));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

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
    });
    return {
      username: result[0].username || "",
      dateRange: formattedRange || "",
    };
  } catch (error) {
    console.error("Error fetching pending tasks records:", error);
    throw error;
  }
};

// FOR OFICE VERSION
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

const updateReportStatus = async (lotId) => {
  try {
    const query = `
      UPDATE public.lot
      SET "report" = false
      WHERE "lotId" = :lotId
      RETURNING *;
    `;
    const result = await db.sequelize.query(query, {
      replacements: { lotId },
      type: db.sequelize.QueryTypes.UPDATE,
    });

    return result[0];
  } catch (error) {
    console.error("Error updating report status:", error);
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
    const query = `
      SELECT DISTINCT so."scheduleOutboundId",
      CONCAT('SINO', LPAD(so."scheduleOutboundId"::TEXT, 3, '0')) AS "outboundJobNo", so."releaseDate"
      FROM public.scheduleoutbounds so
      JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
      WHERE si."isOutbounded" = false
      ORDER BY so."releaseDate" ASC
      LIMIT :limit OFFSET :offset
    `;
    const result = await db.sequelize.query(query, {
      replacements: { limit: pageSize, offset },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
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

// OFFICE VERSION
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

module.exports = {
  // Inbound
  getDetailsPendingTasks,
  pendingTasksUserId,
  findJobNoPendingTasks,
  pendingTasksUserIdSingleDate,
  updateReportStatus,
  getDetailsPendingTasksOrderByReport,
  pendingTasksUpdateQuantity,
  findJobNoOfficePendingTasks,
  // Outbound
  findScheduleIdPendingOutbound, // New function
  getDetailsPendingOutbound,
  pendingOutboundTasksUser,
  getDetailsPendingOutboundOffice,
  pendingOutboundTasksUserIdSingleDate,
  findScheduleIdPendingOutboundOffice
};
