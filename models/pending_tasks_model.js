// [File: pending_tasks_model.js]
const db = require("../database");

const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

const finalizeInboundJob = async (jobNo, userId, filters = {}) => {
  const transaction = await db.sequelize.transaction();
  try {
    console.log(
      `[Model] Finalizing Job: ${jobNo} for User: ${userId} with filters:`,
      filters,
    );

    // 1. Build Filter Clauses
    // We strictly match the logic in getPendingInboundTasks to ensure we only
    // confirm what the user currently sees.
    const replacements = { jobNo };
    const whereClauses = [
      `"jobNo" = :jobNo`,
      `status IN ('Pending', 'Received')`,
      `report = false`, // Exclude items with active reports
      `COALESCE("isConfirmed", false) = false`, // Exclude already confirmed items
      `(COALESCE("reportDuplicate", false) = false OR "isDuplicated" = true)`, // Exclude unresolved duplicates
    ];

    // 2. Apply Optional Filters (if they exist)

    // Filter by Ex-Warehouse Lot
    if (filters.exWarehouseLot) {
      whereClauses.push(`"exWarehouseLot" ILIKE :exWarehouseLot`);
      replacements.exWarehouseLot = `%${filters.exWarehouseLot}%`;
    }

    // Filter by Date Range (using 'inbounddate' column)
    if (filters.startDate && filters.endDate) {
      whereClauses.push(`"inbounddate"::date >= :startDate::date`);
      whereClauses.push(`"inbounddate"::date <= :endDate::date`);
      replacements.startDate = filters.startDate;
      replacements.endDate = filters.endDate;
    }

    // 3. Combine Clauses
    const whereSQL = whereClauses.join(" AND ");

    // 4. Execute Update
    // Sets isConfirmed = true only for the matching rows
    await db.sequelize.query(
      `UPDATE public.lot 
       SET "isConfirmed" = true, "updatedAt" = NOW() 
       WHERE ${whereSQL}`,
      {
        replacements,
        type: db.sequelize.QueryTypes.UPDATE,
        transaction,
      },
    );

    await transaction.commit();
    return { success: true };
  } catch (error) {
    await transaction.rollback();
    console.error("Error finalizing inbound job:", error);
    throw error;
  }
};

const getPendingInboundTasks = async (
  page = 1,
  pageSize = 10,
  filters = {},
) => {
  try {
    console.log("\n--- [DEBUG] getPendingInboundTasks START ---");
    console.log(`Page: ${page}, PageSize: ${pageSize}`);

    const { startDate, endDate, exWarehouseLot } = filters;
    const offset = (page - 1) * pageSize;

    // UPDATED: Filter for status IN ('Pending', 'Received')
    const baseWhere = [
      `l.status IN ('Pending', 'Received')`,
      `l.report = false`,
      `(COALESCE(l."reportDuplicate", false) = false OR l."isDuplicated" = true)`,
      `COALESCE(l."isConfirmed", false) = false`,
    ];
    const replacements = {};

    if (exWarehouseLot) {
      baseWhere.push(`l."exWarehouseLot" ILIKE :exWarehouseLot`);
      replacements.exWarehouseLot = `%${exWarehouseLot}%`;
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

    // 1. Count Query
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
    console.log("[DEBUG] Total Pending/Received Jobs Found:", totalCount);

    const totalPages = Math.ceil(totalCount / pageSize);
    if (totalCount === 0)
      return { data: [], page, pageSize, totalPages, totalCount };

    // 2. Job Number Pagination Query
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

    if (paginatedJobNos.length === 0)
      return { data: [], page, pageSize, totalPages, totalCount };

    const lotFilterClause = exWarehouseLot
      ? `AND l."exWarehouseLot" ILIKE :exWarehouseLot`
      : "";

    // 3. Details Query
    const detailsQuery = `
      SELECT
        l."lotId", l."lotNo", l."jobNo", l.commodity, l."expectedBundleCount",
        l.brand, l."exWarehouseLot", l."exWarehouseWarrant", l."exLmeWarehouse", l.shape, l.report,
        l."isDuplicated", l."inbounddate", l."isConfirm", 
        s."scheduleInboundId",
        u.username
      FROM public.lot l
      LEFT JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      LEFT JOIN public.users u ON s."userId" = u.userid
      WHERE l."jobNo" IN (:paginatedJobNos)
        AND l.status IN ('Pending', 'Received')
        AND l.report = false
        AND COALESCE(l."isConfirmed", false) = false
        AND (COALESCE(l."reportDuplicate", false) = false OR l."isDuplicated" = true)
        ${lotFilterClause}
      ORDER BY l."inbounddate" ASC, l."jobNo" ASC, l."exWarehouseLot" ASC;
    `;

    const detailsReplacements = { paginatedJobNos };
    if (exWarehouseLot)
      detailsReplacements.exWarehouseLot = `%${exWarehouseLot}%`;

    const detailsForPage = await db.sequelize.query(detailsQuery, {
      replacements: detailsReplacements,
      type: db.sequelize.QueryTypes.SELECT,
    });

    // 4. Grouping Reducer
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

      if (lot.inbounddate) {
        acc[jobNo].inboundDates.push(new Date(lot.inbounddate));
      }

      // UPDATED: Only push UNCONFIRMED lots.
      // This ensures that "Received" lots (which have isConfirm=true) result in an empty list,
      // enabling the "Confirm Finished" UI on the frontend.
      if (lot.isConfirm !== true) {
        acc[jobNo].lotDetails.push({
          lotId: lot.lotId,
          lotNo: lot.lotNo,
          jobNo: lot.jobNo,
          commodity: lot.commodity,
          expectedBundleCount: lot.expectedBundleCount,
          brand: lot.brand,
          exWarehouseLot: lot.exWarehouseLot,
          exWarehouseWarrant: lot.exWarehouseWarrant,
          exLmeWarehouse: lot.exLmeWarehouse,
          shape: lot.shape,
          report: lot.report,
          isDuplicated: lot.isDuplicated,
          isConfirm: lot.isConfirm,
        });
      }

      return acc;
    }, {});

    Object.values(groupedByJobNo).forEach((group) => {
      if (group.inboundDates.length > 0) {
        const minDate = new Date(
          Math.min(...group.inboundDates.map((d) => d.getTime())),
        );
        const maxDate = new Date(
          Math.max(...group.inboundDates.map((d) => d.getTime())),
        );

        if (!isNaN(minDate.getTime())) {
          const minDateString = minDate.toDateString();
          const maxDateString = maxDate.toDateString();

          group.userInfo.inboundDate =
            minDateString === maxDateString
              ? formatDate(minDate)
              : `${formatDate(minDate)} - ${formatDate(maxDate)}`;
        } else {
          group.userInfo.inboundDate = "Invalid Date";
        }
      } else {
        group.userInfo.inboundDate = "N/A";
      }
      delete group.inboundDates;
    });

    console.log(
      "[DEBUG] Final Grouped Jobs:",
      Object.keys(groupedByJobNo).length,
    );

    return {
      data: Object.values(groupedByJobNo),
      page,
      pageSize,
      totalPages,
      totalCount,
    };
  } catch (error) {
    console.error("Error fetching pending inbound tasks:", error);
    throw error;
  }
};

const updateScheduleOutboundDetails = async (
  scheduleOutboundId,
  { containerNo, sealNo },
) => {
  try {
    if (containerNo === undefined && sealNo === undefined) return null;
    const setClauses = [];
    const replacements = { scheduleOutboundId };

    if (containerNo !== undefined) {
      setClauses.push(`"containerNo" = :containerNo`);
      replacements.containerNo = containerNo;
    }
    if (sealNo !== undefined) {
      setClauses.push(`"sealNo" = :sealNo`);
      replacements.sealNo = sealNo;
    }
    if (setClauses.length === 0) return null;

    const query = `
      UPDATE public.scheduleoutbounds
      SET ${setClauses.join(", ")}, "updatedAt" = NOW()
      WHERE "scheduleOutboundId" = :scheduleOutboundId
      RETURNING *;
    `;
    const result = await db.sequelize.query(query, {
      replacements,
      type: db.sequelize.QueryTypes.UPDATE,
    });
    return result[0];
  } catch (error) {
    console.error("Error updating schedule outbound details:", error);
    throw error;
  }
};

const getPendingOutboundTasks = async (
  page = 1,
  pageSize = 10,
  filters = {},
) => {
  try {
    const { startDate, endDate, jobNo } = filters;
    const offset = (page - 1) * pageSize;
    let baseWhere = [`si."isOutbounded" = false`];
    const replacements = {};
    let jobNoFilterWhere = "";

    if (jobNo) {
      const lotNoPattern = /-(\d+)$/;
      const match = jobNo.match(lotNoPattern);
      if (match) {
        const lotNoPart = match[1];
        const jobNoPart = jobNo.substring(0, match.index);
        const sanitizedJobNo = jobNoPart.replace(/-/g, "");
        jobNoFilterWhere = `(REPLACE(si."jobNo", '-', '') ILIKE :sanitizedJobNo AND si."lotNo"::text ILIKE :lotNoPart)`;
        replacements.sanitizedJobNo = `%${sanitizedJobNo}%`;
        replacements.lotNoPart = `%${lotNoPart}%`;
      } else {
        const sanitizedJobNo = jobNo.replace(/-/g, "");
        jobNoFilterWhere = `(
          REPLACE(si."jobNo", '-', '') ILIKE :sanitizedJobNo 
          OR 
          REPLACE(COALESCE(so."outboundJobNo", CONCAT('SINO', LPAD(so."scheduleOutboundId"::TEXT, 3, '0'))), '-', '') ILIKE :sanitizedJobNo
        )`;
        replacements.sanitizedJobNo = `%${sanitizedJobNo}%`;
      }
      baseWhere.push(jobNoFilterWhere);
    }

    const baseWhereString = baseWhere.join(" AND ");
    const dateOverlapWhere =
      startDate && endDate
        ? `WHERE sr.max_release_date >= :startDate::date AND sr.min_release_date <= :endDate::date`
        : "";

    if (startDate && endDate) {
      replacements.startDate = startDate;
      replacements.endDate = endDate;
    }

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

    if (totalCount === 0)
      return { data: [], page, pageSize, totalPages, totalCount };

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
      (s) => s.scheduleOutboundId,
    );
    if (paginatedScheduleIds.length === 0)
      return { data: [], page, pageSize, totalPages, totalCount };

    const detailsQuery = `
      SELECT
        so."scheduleOutboundId",
        si."selectedInboundId",
        COALESCE(so."outboundJobNo", CONCAT('SINO', LPAD(so."scheduleOutboundId"::TEXT, 3, '0'))) AS "outboundJobNo",
        COALESCE(si."releaseDate", so."releaseDate") AS "releaseDate",
        COALESCE(si."releaseEndDate", so."releaseEndDate") AS "releaseEndDate",
        so."stuffingDate", 
        so."containerNo", 
        so."sealNo",
        so."outboundType",
        u.username,
        si."jobNo", 
        si."lotNo" as "lotNo", 
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
        ${jobNo ? `AND ${jobNoFilterWhere}` : ""}
      ORDER BY si."releaseDate" ASC, i."jobNo" ASC, i."lotNo" ASC;
    `;

    const detailsForPage = await db.sequelize.query(detailsQuery, {
      replacements: { ...replacements, paginatedScheduleIds },
      type: db.sequelize.QueryTypes.SELECT,
    });

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
            stuffingDate: item.stuffingDate
              ? formatDate(item.stuffingDate)
              : null,
            containerNo: item.containerNo,
            sealNo: item.sealNo,
            outboundType: item.outboundType,
          },
          lotDetails: [],
          releaseDates: [],
        };
      }
      if (item.releaseDate)
        acc[scheduleId].releaseDates.push(new Date(item.releaseDate));
      if (item.releaseEndDate)
        acc[scheduleId].releaseDates.push(new Date(item.releaseEndDate));

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
        releaseDate: item.releaseDate ? formatDate(item.releaseDate) : null,
        releaseEndDate: item.releaseEndDate
          ? formatDate(item.releaseEndDate)
          : null,
      });
      return acc;
    }, {});

    Object.values(groupedByScheduleId).forEach((group) => {
      if (group.releaseDates.length > 0) {
        const minDate = new Date(
          Math.min(...group.releaseDates.map((d) => d.getTime())),
        );
        const maxDate = new Date(
          Math.max(...group.releaseDates.map((d) => d.getTime())),
        );
        const minDateString = minDate.toDateString();
        const maxDateString = maxDate.toDateString();

        group.userInfo.releaseDate = formatDate(minDate);
        group.userInfo.releaseEndDate =
          minDateString === maxDateString ? null : formatDate(maxDate);
      } else {
        group.userInfo.releaseDate = null;
        group.userInfo.releaseEndDate = null;
      }
      delete group.releaseDates;
    });

    return {
      data: Object.values(groupedByScheduleId),
      page,
      pageSize,
      totalPages,
      totalCount,
    };
  } catch (error) {
    console.error("Error fetching pending outbound tasks:", error);
    throw error;
  }
};

const reportJobDiscrepancy = async (
  jobNo,
  reportedBy,
  discrepancyType,
  options = {},
) => {
  const managedTransaction = !options.transaction;
  const transaction = options.transaction || (await db.sequelize.transaction());
  try {
    // UPDATED: Allow reporting on Received items too
    const lotsToUpdate = await db.sequelize.query(
      `SELECT "lotId" FROM public.lot 
       WHERE "jobNo" = :jobNo 
         AND status IN ('Pending', 'Received') 
         AND report = false`,
      {
        replacements: { jobNo },
        type: db.sequelize.QueryTypes.SELECT,
        transaction,
      },
    );

    if (lotsToUpdate.length === 0) {
      if (managedTransaction) await transaction.rollback();
      return 0;
    }

    await db.sequelize.query(
      `INSERT INTO public.job_reports ("jobNo", "reportedById", "discrepancyType") 
       VALUES (:jobNo, :reportedById, :discrepancyType)`,
      {
        replacements: { jobNo, reportedById: reportedBy, discrepancyType },
        type: db.sequelize.QueryTypes.INSERT,
        transaction,
      },
    );

    const [updateResult, updateCount] = await db.sequelize.query(
      `UPDATE public.lot SET report = true 
       WHERE "jobNo" = :jobNo 
         AND status IN ('Pending', 'Received') 
         AND report = false`,
      {
        replacements: { jobNo },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction,
      },
    );

    if (managedTransaction) await transaction.commit();
    return updateCount;
  } catch (error) {
    if (managedTransaction) await transaction.rollback();
    console.error("Error reporting job discrepancy:", error);
    throw error;
  }
};

const reverseInbound = async (inboundId) => {
  const t = await db.sequelize.transaction();
  try {
    const inboundEntry = await db.sequelize.query(
      `SELECT "jobNo", "exWarehouseLot" FROM public.inbounds WHERE "inboundId" = :inboundId`,
      {
        replacements: { inboundId },
        type: db.sequelize.QueryTypes.SELECT,
        transaction: t,
        plain: true,
      },
    );

    if (!inboundEntry) throw new Error("Inbound entry not found.");
    const { jobNo, exWarehouseLot } = inboundEntry;

    await db.sequelize.query(
      `UPDATE public."lot" SET status = 'Pending', "isConfirm" = false , "crewLotNo" = null, "updatedAt" = NOW(),
      "actualWeight" = NULL , "isWeighted" = null , "stickerWeight" = null
       WHERE "jobNo" = :jobNo AND "exWarehouseLot" = :exWarehouseLot`,
      {
        replacements: { jobNo, exWarehouseLot },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      },
    );

    await db.sequelize.query(
      `DELETE FROM public.inbounds WHERE "inboundId" = :inboundId`,
      {
        replacements: { inboundId },
        type: db.sequelize.QueryTypes.DELETE,
        transaction: t,
      },
    );

    await t.commit();
    return {
      success: true,
      message: "Inbound reversed successfully.",
      inboundId: inboundId,
      jobNo: jobNo,
      exWarehouseLot: exWarehouseLot,
    };
  } catch (error) {
    await t.rollback();
    console.error("Error reversing inbound:", error);
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

const getSupervisorPendingStatus = async (userId) => {
  try {
    // 1. Get Creation Timestamp (UTC) of latest schedules
    // UPDATED: Check for Pending OR Received
    const inboundQuery = `
      SELECT MAX(s."createdAt") as "ts" 
      FROM public.scheduleinbounds s
      JOIN public.lot l ON s."scheduleInboundId" = l."scheduleInboundId"
      WHERE l.status IN ('Pending', 'Received')
    `;

    const outboundQuery = `
      SELECT MAX(so."createdAt") as "ts"
      FROM public.scheduleoutbounds so
      JOIN public.selectedinbounds si ON so."scheduleOutboundId" = si."scheduleOutboundId"
      WHERE si."isOutbounded" = false
    `;

    const [inboundRes, outboundRes] = await Promise.all([
      db.sequelize.query(inboundQuery, {
        plain: true,
        type: db.sequelize.QueryTypes.SELECT,
      }),
      db.sequelize.query(outboundQuery, {
        plain: true,
        type: db.sequelize.QueryTypes.SELECT,
      }),
    ]);

    const inboundTime = inboundRes?.ts ? new Date(inboundRes.ts) : null;
    const outboundTime = outboundRes?.ts ? new Date(outboundRes.ts) : null;
    const times = [inboundTime, outboundTime].filter((d) => d !== null);

    // If NO pending tasks exist, return false.
    if (times.length === 0) {
      return { hasPending: false, lastUpdated: null };
    }

    const lastTaskTime = new Date(Math.max(...times));

    return { hasPending: true, lastUpdated: lastTaskTime };
  } catch (error) {
    console.error("Error checking supervisor status:", error);
    return { hasPending: false, lastUpdated: null };
  }
};

const setLastReadPendingTaskTime = async (userId, timestampIgnored) => {
  try {
    console.log(
      `[PendingModel] setLastReadTime called for User: ${userId}. Setting to NOW() UTC.`,
    );

    // Write standard UTC. This ensures future reads are saved correctly.
    const query = `
      INSERT INTO public.user_pending_task_status ("userId", "lastReadTime", "updatedAt")
      VALUES (:userId, NOW(), NOW())
      ON CONFLICT ("userId") 
      DO UPDATE SET "lastReadTime" = NOW(), "updatedAt" = NOW();
    `;

    await db.sequelize.query(query, {
      replacements: { userId },
    });

    console.log("[PendingModel] Read status updated successfully.");
    return true;
  } catch (error) {
    console.error("[PendingModel] !!! SQL ERROR:", error);
    throw error;
  }
};

const getLastReadPendingTaskTime = async (userId) => {
  try {
    const query = `SELECT "lastReadTime" FROM public.user_pending_task_status WHERE "userId" = :userId`;
    const result = await db.sequelize.query(query, {
      replacements: { userId },
      type: db.sequelize.QueryTypes.SELECT,
    });
    if (result && result.length > 0) return result[0].lastReadTime;
    return null;
  } catch (error) {
    console.error("Error getting pending task read time:", error);
    throw error;
  }
};

const notifySupervisorOfNewTask = async (lotId) => {
  try {
    if (!lotId) return;
    await db.sequelize.query(
      `UPDATE public.lot SET "updatedAt" = NOW() WHERE "lotId" = :lotId`,
      { replacements: { lotId }, type: db.sequelize.QueryTypes.UPDATE },
    );
  } catch (error) {
    console.error("Error triggering supervisor notification:", error);
  }
};
module.exports = {
  getPendingInboundTasks,
  finalizeInboundJob,
  getPendingOutboundTasks,
  updateScheduleOutboundDetails,
  reportJobDiscrepancy,
  reverseInbound,
  pendingOutboundTasksUser,
  getSupervisorPendingStatus,
  setLastReadPendingTaskTime,
  getLastReadPendingTaskTime,
  notifySupervisorOfNewTask,
};
