const db = require("../database");

// --- INBOUND ---
const findJobNoPendingTasks = async () => {
  try {
    const query = `
            SELECT DISTINCT "jobNo" FROM public.lot
                  WHERE "status" = 'Pending'
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

const getDetailsPendingTasks = async (jobNo) => {
  try {
    const query = `
    SELECT "lotId", "lotNo","jobNo", "commodity", "expectedBundleCount", "brand",
           "exWarehouseLot", "exLmeWarehouse", "shape", "report"
    FROM public.lot
    WHERE "jobNo" = :jobNo AND "status" = 'Pending'
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
    SELECT "lotId", "lotNo","jobNo", "commodity", "expectedBundleCount", "brand",
           "exWarehouseLot", "exLmeWarehouse", "shape", "report"
    FROM public.lot
    WHERE "jobNo" = :jobNo AND "status" = 'Pending'
    ORDER BY "report" DESC;
    `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT
    });

    if (result.length > 0) {
      console.log('Query result:', result);
      console.log('First result keys:', Object.keys(result[0]));
    } else {
      console.log('No pending tasks found for jobNo:', jobNo);
    }
    return result;
  } catch (error) {
    console.error('Error in /pending-tasks route:', error);
    console.error('Error fetching pending tasks records:', error);
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



// --- OUTBOUND ---
const findJobNoPendingOutbound = async () => {
  try {
    const query = `
            SELECT DISTINCT si."jobNo"
            FROM public.selectedinbounds si
            WHERE si."isOutbounded" = false
        `;
    const result = await db.sequelize.query(query, {
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching pending outbound job numbers:", error);
    throw error;
  }
};

const getDetailsPendingOutbound = async (jobNo) => {
  try {
    // UPDATED QUERY: Added stuffingDate, containerNo, sealNo, and shapeName
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
                so."lotReleaseWeight",
                TO_CHAR(so."stuffingDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "stuffingDate",
                so."containerNo",
                so."sealNo"
            FROM public.selectedinbounds si
            JOIN public.inbounds i ON si."inboundId" = i."inboundId"
            JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
            LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
            LEFT JOIN public.brands b ON i."brandId" = b."brandId"
            LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId"
            LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
            WHERE si."jobNo" = :jobNo AND si."isOutbounded" = false
            ORDER BY i."lotNo" ASC
        `;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching pending outbound task details:", error);
    throw error;
  }
};

const pendingOutboundTasksUserId = async (jobNo) => {
  try {
    const query = `
            SELECT
                u."username",
                TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD Mon YYYY') AS "releaseDate"
            FROM public.selectedinbounds si
            JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
            JOIN public.users u ON so."userId" = u."userid"
            WHERE si."jobNo" = :jobNo AND si."isOutbounded" = false
            LIMIT 1;
        `;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
    });

    return {
      username: result?.username || "N/A",
      dateRange: result?.releaseDate || "N/A",
    };
  } catch (error) {
    console.error("Error fetching user info for outbound tasks:", error);
    throw error;
  }
};

// SELECTEDINBOUNDS TABLE, INBOUND TABLE AAND (EXTRAS LIKE COMMODITIES, BRANDS, EXLMEWAREHOUSES)
const getDetailsPendingOutboundOffice = async (jobNo) => {
  try {
    const query = `
            SELECT
              si."selectedInboundId",
                i."jobNo",
                i."lotNo",
                i."noOfBundle" as "expectedBundleCount",
                b."brandName" AS "brand",
                c."commodityName" AS "commodity",
                w."exLmeWarehouseName" AS "exLmeWarehouse",
                i."exWarehouseLot",
                sh."shapeName",
                so."lotReleaseWeight"
            FROM public.selectedinbounds si
            JOIN public.inbounds i ON si."inboundId" = i."inboundId"
            JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
            LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
            LEFT JOIN public.shapes sh ON sh."shapeName" = i."shape"
            LEFT JOIN public.brands b ON i."brandId" = b."brandId"
            LEFT JOIN public.exlmewarehouses w ON i."exLmeWarehouseId" = w."exLmeWarehouseId"
            WHERE si."jobNo" = :jobNo AND si."isOutbounded" = false
            ORDER BY i."lotNo" ASC
        `;
    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT,
    });
    return result;
  } catch (error) {
    console.error("Error fetching pending outbound task details:", error);
    throw error;
  }
};

const pendingOutboundTasksUserIdSingleDate = async (jobNo) => {
  try {
    const query = `
            SELECT
            u."username",
            TO_CHAR(so."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD-MM-YYYY') AS "releaseDate"
            FROM public.selectedinbounds si
            JOIN public.scheduleoutbounds so ON si."scheduleOutboundId" = so."scheduleOutboundId"
            JOIN public.users u ON so."userId" = u."userid"
            WHERE si."jobNo" = :jobNo AND si."isOutbounded" = false;
      `;

    const result = await db.sequelize.query(query, {
      replacements: { jobNo },
      type: db.sequelize.QueryTypes.SELECT
    });

    if (result.length > 0) {
      console.log('Query result:', result);
      console.log('First result keys:', Object.keys(result[0]));
    } else {
      console.log('No pending tasks found for jobNo:', jobNo);
    }
    return result;
  } catch (error) {
    console.error('Error in /pending-tasks route:', error);
    console.error('Error fetching pending tasks records:', error);
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
  // Outbound
  findJobNoPendingOutbound,
  getDetailsPendingOutbound,
  pendingOutboundTasksUserId,
  getDetailsPendingOutboundOffice,
  pendingOutboundTasksUserIdSingleDate,
};
