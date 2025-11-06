const db = require("../database");

const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

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
      `l.report = false`,
      `(l."reportDuplicate" = false OR l."isDuplicated" = true)`,
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

    const lotFilterClause = exWarehouseLot
      ? `AND l."exWarehouseLot" ILIKE :exWarehouseLot`
      : "";

    // fetch lot details for those jobs (keep your existing visibility filters)
    const detailsQuery = `
      SELECT
        l."lotId", l."lotNo", l."jobNo", l.commodity, l."expectedBundleCount",
        l.brand, l."exWarehouseLot", l."exWarehouseWarrant", l."exLmeWarehouse", l.shape, l.report,
        l."isDuplicated", l."inbounddate",
        u.username
      FROM public.lot l
      JOIN public.scheduleinbounds s ON l."scheduleInboundId" = s."scheduleInboundId"
      JOIN public.users u ON s."userId" = u.userid
      WHERE l."jobNo" IN (:paginatedJobNos)
        AND l.status = 'Pending'
        AND l.report = false
        AND (l."reportDuplicate" = false OR l."isDuplicated" = true)
        ${lotFilterClause}
      ORDER BY l."inbounddate" ASC, l."jobNo" ASC, l."exWarehouseLot" ASC;
    `;

    const detailsReplacements = { paginatedJobNos };
    if (exWarehouseLot) {
      detailsReplacements.exWarehouseLot = `%${exWarehouseLot}%`;
    }

    const detailsForPage = await db.sequelize.query(detailsQuery, {
      replacements: detailsReplacements,
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
        exWarehouseWarrant: lot.exWarehouseWarrant,
        exLmeWarehouse: lot.exLmeWarehouse,
        shape: lot.shape,
        report: lot.report,
        isDuplicated: lot.isDuplicated,
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

const updateScheduleOutboundDetails = async (
  scheduleOutboundId,
  { containerNo, sealNo }
) => {
  try {
    if (containerNo === undefined && sealNo === undefined) {
      return null; // Nothing to update
    }

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
  filters = {}
) => {
  try {
    const { startDate, endDate, jobNo } = filters;
    const offset = (page - 1) * pageSize;

    let baseWhere = [`si."isOutbounded" = false`];
    const replacements = {};
    let jobNoFilterWhere = "";

    if (jobNo) {
      // Regex to check if the part after the last dash is purely numeric
      const lotNoPattern = /-(\d+)$/;
      const match = jobNo.match(lotNoPattern);

      if (match) {
        // --- Search by Inbound JobNo + LotNo ---
        // e.g., "SINI-001-23" or "SINI001-23"
        const lotNoPart = match[1]; // "23"
        // Get the part before the last dash
        const jobNoPart = jobNo.substring(0, match.index); // "SINI-001" or "SINI001"

        // Sanitize the jobNo part by removing all dashes
        const sanitizedJobNo = jobNoPart.replace(/-/g, ""); // "SINI001"

        jobNoFilterWhere = `(REPLACE(si."jobNo", '-', '') ILIKE :sanitizedJobNo AND si."lotNo"::text ILIKE :lotNoPart)`;
        replacements.sanitizedJobNo = `%${sanitizedJobNo}%`;
        replacements.lotNoPart = `%${lotNoPart}%`;
      } else {
        // --- Search by OutboundJobNo OR InboundJobNo ---
        // e.g., "SINO-076A", "SINO001", "SINI-001", "SINI001"
        // Sanitize the entire input for a broad search
        const sanitizedJobNo = jobNo.replace(/-/g, ""); // "SINO076A", "SINO001", "SINI001"

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

    // Use CTE approach similar to inbound logic
    const dateOverlapWhere =
      startDate && endDate
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

    if (detailsForPage.length > 0) {
      console.log("--- DEBUG: First item from detailsForPage ---");
      console.log(detailsForPage[0]);
    }

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
      // Collect all release dates for this schedule to calculate range later
      if (item.releaseDate)
        acc[scheduleId].releaseDates.push(new Date(item.releaseDate));
      console.log(`[Reduce] Pushed date for schedule ${scheduleId}. Array length is now: ${acc[scheduleId].releaseDates.length}`);
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

    // Calculate date ranges for each schedule (similar to inbound logic)
    Object.values(groupedByScheduleId).forEach((group) => {
      if (group.releaseDates.length > 0) {
        const minDate = new Date(
          Math.min(...group.releaseDates.map((d) => d.getTime()))
        );
        const maxDate = new Date(
          Math.max(...group.releaseDates.map((d) => d.getTime()))
        );

        // Check if dates are the same (compare date strings to avoid time differences)
        const minDateString = minDate.toDateString();
        const maxDateString = maxDate.toDateString();

        group.userInfo.releaseDate = formatDate(minDate);
        group.userInfo.releaseEndDate =
          minDateString === maxDateString ? null : formatDate(maxDate);
      } else {
        group.userInfo.releaseDate = null;
        group.userInfo.releaseEndDate = null;
      }
      console.log(`[ForEach] Final userInfo for schedule ${group.scheduleInfo.scheduleOutboundId}:`, group.userInfo);
      delete group.releaseDates;
    });

    const finalData = Object.values(groupedByScheduleId);
    return { data: finalData, page, pageSize, totalPages, totalCount };
  } catch (error) {
    console.error("Error fetching pending outbound tasks:", error);
    throw error;
  }
};

const reportJobDiscrepancy = async (
  jobNo,
  reportedBy,
  discrepancyType,
  options = {}
) => {
  // Get transaction from options, or create a new one if not provided
  const managedTransaction = !options.transaction;
  const transaction = options.transaction || (await db.sequelize.transaction());

  try {
    // Check if there are any lots to report
    const lotsToUpdate = await db.sequelize.query(
      `SELECT "lotId" FROM public.lot 
       WHERE "jobNo" = :jobNo AND status = 'Pending' AND report = false`,
      {
        replacements: { jobNo },
        type: db.sequelize.QueryTypes.SELECT,
        transaction, // <-- Pass transaction
      }
    );

    if (lotsToUpdate.length === 0) {
      if (managedTransaction) await transaction.rollback();
      return 0; // No lots were found to update
    }

    // Create the report entry
    await db.sequelize.query(
      `INSERT INTO public.job_reports ("jobNo", "reportedById", "discrepancyType") 
       VALUES (:jobNo, :reportedById, :discrepancyType)`,
      {
        replacements: {
          jobNo: jobNo,
          reportedById: reportedBy,
          discrepancyType: discrepancyType,
        },
        type: db.sequelize.QueryTypes.INSERT,
        transaction, // <-- Pass transaction
      }
    );

    // Mark all associated lots as reported
    const [updateResult, updateCount] = await db.sequelize.query(
      `UPDATE public.lot SET report = true 
       WHERE "jobNo" = :jobNo AND status = 'Pending' AND report = false`,
      {
        replacements: { jobNo },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction, // <-- Pass transaction
      }
    );

    if (managedTransaction) await transaction.commit(); // Only commit if we started it
    return updateCount; // Return the number of lots that were updated
  } catch (error) {
    if (managedTransaction) await transaction.rollback(); // Only rollback if we started it
    console.error("Error reporting job discrepancy:", error);
    throw error; // Re-throw error to be caught by the sync controller
  }
};

const reverseInbound = async (inboundId) => {
  const t = await db.sequelize.transaction();
  try {
    // Step 1: Get both "jobNo" and "exWarehouseLot" from the inbounds table to uniquely identify the record.
    const inboundEntry = await db.sequelize.query(
      `SELECT "jobNo", "exWarehouseLot" FROM public.inbounds WHERE "inboundId" = :inboundId`,
      {
        replacements: { inboundId },
        type: db.sequelize.QueryTypes.SELECT,
        transaction: t,
        plain: true,
      }
    );

    if (!inboundEntry) {
      throw new Error("Inbound entry not found.");
    }

    const { jobNo, exWarehouseLot } = inboundEntry;

    // Step 2: Update the corresponding lot's status back to 'Pending' using both identifiers.
    await db.sequelize.query(
      `UPDATE public."lot" SET status = 'Pending', "isConfirm" = false , "crewLotNo" = null, "updatedAt" = NOW(),
      "actualWeight" = NULL , "isWeighted" = null , "stickerWeight" = null
       WHERE "jobNo" = :jobNo AND "exWarehouseLot" = :exWarehouseLot`,
      {
        replacements: { jobNo, exWarehouseLot },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      }
    );

    // Step 3: Delete the entry from the inbounds table.
    await db.sequelize.query(
      `DELETE FROM public.inbounds WHERE "inboundId" = :inboundId`,
      {
        replacements: { inboundId },
        type: db.sequelize.QueryTypes.DELETE,
        transaction: t,
      }
    );

    await t.commit();
    return {
      success: true,
      message: "Inbound reversed successfully.",
      inboundId: inboundId,
    };
  } catch (error) {
    await t.rollback();
    console.error("Error reversing inbound:", error);

    throw error;
  }
};

module.exports = {
  getPendingInboundTasks,
  getPendingOutboundTasks,
  updateScheduleOutboundDetails,
  reportJobDiscrepancy,
  reverseInbound,
};
