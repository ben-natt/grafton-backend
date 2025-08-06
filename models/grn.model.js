const db = require("../database");

const grnModel = {
  // MODIFIED: To support pagination, robust filtering, and new search functionality
  async getAllGrns(filters = {}) {
    console.log("MODEL (getAllGrns): Fetching GRNs with filters:", filters);
    try {
      const page = parseInt(filters.page) || 1;
      const pageSize = parseInt(filters.pageSize) || 25;
      const offset = (page - 1) * pageSize;

      let whereClauses = [];
      const replacements = { limit: pageSize, offset };

      if (filters.grnNo) {
        whereClauses.push(`o."grnNo" = :grnNo`);
        replacements.grnNo = filters.grnNo;
      } else if (filters.jobNo) {
        whereClauses.push(`o."grnNo" LIKE :jobNo`);
        replacements.jobNo = `${filters.jobNo}/%`;
      }

      // NEW: Search functionality
      if (filters.searchQuery) {
        // Search by grnNo (SINO/SINI), jobNo, or commodity
        whereClauses.push(
          `(o."grnNo" ILIKE :searchPattern OR ot_summary.jobNos ILIKE :searchPattern OR ot_summary.commodities ILIKE :searchPattern)`
        );
        replacements.searchPattern = `%${filters.searchQuery}%`;
      }

      if (filters.startDate && filters.endDate) {
        whereClauses.push(
          `o."createdAt"::date BETWEEN :startDate::date AND :endDate::date`
        );
        replacements.startDate = filters.startDate;
        replacements.endDate = filters.endDate;
      }

      const whereString =
        whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const baseQuery = `
        FROM public.outbounds o
        INNER JOIN (
          SELECT
            ot."outboundId",
            STRING_AGG(DISTINCT ot.commodity, ', ') AS commodities,
            COUNT(ot."outboundTransactionId") AS quantity,
            STRING_AGG(DISTINCT ot."jobNo", ', ') AS jobNos
          FROM public.outboundtransactions ot
          WHERE ot."outboundId" IS NOT NULL
          GROUP BY ot."outboundId"
        ) AS ot_summary ON o."outboundId" = ot_summary."outboundId"
        ${whereString}
      `;

      const countQuery = `SELECT COUNT(o."outboundId")::int ${baseQuery}`;
      const countResult = await db.sequelize.query(countQuery, {
        replacements,
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
      });
      const totalCount = countResult.count || 0;

      const sortColumnMap = {
        Date: 'o."createdAt"',
        "GRN No.": 'o."grnNo"',
        "File Name": 'o."grnImage"',
      };

      let orderByClause = 'ORDER BY o."createdAt" DESC, o."grnNo" DESC'; // Default sort

      if (filters.sortBy && sortColumnMap[filters.sortBy]) {
        const sortOrder = filters.sortOrder === "DESC" ? "DESC" : "ASC";
        orderByClause = `ORDER BY ${
          sortColumnMap[filters.sortBy]
        } ${sortOrder}`;
      }

      const dataQuery = `
        SELECT
          o."outboundId",
          TO_CHAR(o."createdAt" AT TIME ZONE 'Asia/Singapore', 'DD-MM-YYYY') AS "date",
          o."grnNo",
          o."grnImage",
          o."grnPreviewImage",
          o."fileSize",
          ot_summary.commodities,
          ot_summary.quantity,
          ot_summary.jobNos
        ${baseQuery}
        ${orderByClause}
        LIMIT :limit OFFSET :offset;
      `;

      const results = await db.sequelize.query(dataQuery, {
        replacements,
        type: db.sequelize.QueryTypes.SELECT,
      });

      console.log(`MODEL (getAllGrns): Found ${results.length} GRNs.`);
      return { totalCount, data: results };
    } catch (error) {
      console.error("MODEL ERROR in getAllGrns:", error);
      throw error;
    }
  },

  async getGrnPdfPath(outboundId) {
    console.log(
      `MODEL (getGrnPdfPath): Fetching PDF path for outboundId: ${outboundId}`
    );
    try {
      const query = `
        SELECT "grnImage" FROM public.outbounds WHERE "outboundId" = :outboundId;
      `;
      const result = await db.sequelize.query(query, {
        replacements: { outboundId },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
      });
      console.log("MODEL (getGrnPdfPath): Path found:", result);
      return result;
    } catch (error) {
      console.error("MODEL ERROR in getGrnPdfPath:", error);
      throw error;
    }
  },

  async getGrnPreviewImagePath(outboundId) {
    console.log(
      `MODEL (getGrnPreviewImagePath): Fetching Preview Image path for outboundId: ${outboundId}`
    );
    try {
      const query = `
        SELECT "grnPreviewImage" FROM public.outbounds WHERE "outboundId" = :outboundId;
      `;
      const result = await db.sequelize.query(query, {
        replacements: { outboundId },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
      });
      console.log("MODEL (getGrnPreviewImagePath): Path found:", result);
      return result;
    } catch (error) {
      console.error("MODEL ERROR in getGrnPreviewImagePath:", error);
      throw error;
    }
  },

  async getFilterOptions() {
    console.log(
      "MODEL (getFilterOptions): Fetching filter options with corrected logic."
    );
    try {
      const query = `
        SELECT DISTINCT
          o."grnNo"
        FROM public.outbounds o
        INNER JOIN public.outboundtransactions ot ON o."outboundId" = ot."outboundId"
        WHERE o."grnNo" IS NOT NULL AND o."grnNo" LIKE '%/%'
        ORDER BY o."grnNo" ASC;
      `;

      const results = await db.sequelize.query(query, {
        type: db.sequelize.QueryTypes.SELECT,
      });

      const allGrnNos = results.map((item) => item.grnNo);

      const filterOptions = {
        grnNos: allGrnNos,
      };

      console.log("MODEL (getFilterOptions): Options fetched successfully.");
      return filterOptions;
    } catch (error) {
      console.error("MODEL ERROR in getFilterOptions:", error);
      throw error;
    }
  },
};

module.exports = grnModel;
