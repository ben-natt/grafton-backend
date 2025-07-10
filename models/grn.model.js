const db = require("../database");

/**
 * Model for handling all database operations related to the Goods Release Notes (GRN) page.
 */
const grnModel = {
  /**
   * Fetches a paginated and filtered list of all GRNs.
   * It uses an INNER JOIN to ensure only outbounds with transactions are included.
   * @param {object} filters - The filter criteria.
   * @param {string} [filters.jobNo] - Filter by job number (prefix of grnNo).
   * @param {string} [filters.grnNo] - Filter by a specific GRN number.
   * @param {string} [filters.startDate] - The start of the date range.
   * @param {string} [filters.endDate] - The end of the date range.
   * @returns {Promise<Array>} A promise that resolves to an array of GRN objects.
   */
  async getAllGrns(filters = {}) {
    console.log("MODEL (getAllGrns): Fetching GRNs with filters:", filters);
    try {
      // Reverted to INNER JOIN to ensure that only GRNs (records from the 'outbounds' table)
      // that have at least one transaction item are returned, matching the filtering logic.
      let query = `
        SELECT
          o."outboundId",
          TO_CHAR(o."createdAt" AT TIME ZONE 'Asia/Singapore', 'DD-MM-YYYY') AS "date",
          o."grnNo",
          o."grnImage",
          o."fileSize",
          ot_summary.commodities,
          ot_summary.quantity,
          ot_summary.jobNos
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
      `;

      const whereClauses = [];
      const replacements = {};

      // If a full GRN number is provided, use it for an exact match.
      if (filters.grnNo) {
        whereClauses.push(`o."grnNo" = :grnNo`);
        replacements.grnNo = filters.grnNo;
      }
      // Otherwise, if a job number (prefix) is provided, use it for a partial match.
      else if (filters.jobNo) {
        whereClauses.push(`o."grnNo" LIKE :jobNo`);
        replacements.jobNo = `${filters.jobNo}%`;
      }

      if (filters.startDate && filters.endDate) {
        whereClauses.push(
          `o."createdAt"::date BETWEEN :startDate::date AND :endDate::date`
        );
        replacements.startDate = filters.startDate;
        replacements.endDate = filters.endDate;
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }

      query += ` ORDER BY o."createdAt" DESC, o."grnNo" DESC;`;

      const results = await db.sequelize.query(query, {
        replacements,
        type: db.sequelize.QueryTypes.SELECT,
      });

      console.log(`MODEL (getAllGrns): Found ${results.length} GRNs.`);
      return results;
    } catch (error) {
      console.error("MODEL ERROR in getAllGrns:", error);
      throw error;
    }
  },

  /**
   * Fetches the stored path of the GRN PDF from the database.
   * @param {number} outboundId - The ID of the outbound record.
   * @returns {Promise<object|null>} A promise that resolves to the query result or null.
   */
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

  /**
   * Fetches distinct values for populating filter dropdowns on the frontend.
   * This now ensures that only job numbers and GRNs associated with valid, linked outbounds are returned.
   * @returns {Promise<object>} A promise that resolves to an object containing arrays of filter options.
   */
  async getFilterOptions() {
    console.log(
      "MODEL (getFilterOptions): Fetching filter options with corrected logic."
    );
    try {
      // This query ensures we only get GRN numbers from outbounds
      // that have at least one corresponding transaction.
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
        // The frontend will now derive the job numbers and suffixes from this single list.
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
