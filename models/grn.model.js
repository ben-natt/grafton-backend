const db = require("../database");
const path = require("path");
const fs = require("fs").promises;
const pdfService = require("../pdf.services");

const grnModel = {
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

      if (filters.searchQuery) {
        whereClauses.push(
          `(o."grnNo" ILIKE :searchPattern OR ot_summary.jobNos ILIKE :searchPattern OR ot_summary.commodities ILIKE :searchPattern)`
        );
        replacements.searchPattern = `%${filters.searchQuery}%`;
      }

      if (filters.startDate && filters.endDate) {
        whereClauses.push(
          `(o."createdAt" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate::date AND :endDate::date`
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

      let orderByClause = 'ORDER BY o."createdAt" DESC, o."grnNo" DESC';

      if (filters.sortBy && sortColumnMap[filters.sortBy]) {
        const sortOrder = filters.sortOrder === "DESC" ? "DESC" : "ASC";
        orderByClause = `ORDER BY ${
          sortColumnMap[filters.sortBy]
        } ${sortOrder}`;
      }

      const dataQuery = `
        SELECT
          o."outboundId",
          TO_CHAR(o."createdAt" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "date",
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

      return { totalCount, data: results };
    } catch (error) {
      console.error("MODEL ERROR in getAllGrns:", error);
      throw error;
    }
  },

  async getGrnPdfPath(outboundId) {
    try {
      const query = `
        SELECT "grnImage" FROM public.outbounds WHERE "outboundId" = :outboundId;
      `;
      const result = await db.sequelize.query(query, {
        replacements: { outboundId },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
      });
      return result;
    } catch (error) {
      console.error("MODEL ERROR in getGrnPdfPath:", error);
      throw error;
    }
  },

  async getGrnPreviewImagePath(outboundId) {
    try {
      const query = `
        SELECT "grnPreviewImage" FROM public.outbounds WHERE "outboundId" = :outboundId;
      `;
      const result = await db.sequelize.query(query, {
        replacements: { outboundId },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
      });
      return result;
    } catch (error) {
      console.error("MODEL ERROR in getGrnPreviewImagePath:", error);
      throw error;
    }
  },

  async getFilterOptions() {
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

      return { grnNos: allGrnNos };
    } catch (error) {
      console.error("MODEL ERROR in getFilterOptions:", error);
      throw error;
    }
  },

  async getGrnDetailsForMultipleIds(outboundIds) {
    try {
      const query = `
            SELECT "outboundId", "grnNo", "grnImage"
            FROM public.outbounds
            WHERE "outboundId" IN (:outboundIds);
        `;
      const results = await db.sequelize.query(query, {
        replacements: { outboundIds },
        type: db.sequelize.QueryTypes.SELECT,
      });
      return results;
    } catch (error) {
      console.error("MODEL ERROR in getGrnDetailsForMultipleIds:", error);
      throw error;
    }
  },

  async getGrnDetailsForEdit(outboundId) {
    try {
      const query = `
        SELECT
            o."grnNo",
            o."jobIdentifier" as "ourReference",
            o."driverName", o."driverIdentityNo", o."truckPlateNo",
            o."warehouseStaff", o."warehouseSupervisor",
            o."releaseDate",
            (SELECT STRING_AGG(DISTINCT ot.commodity, ', ') FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId") as commodities,
            (SELECT STRING_AGG(DISTINCT ot.shape, ', ') FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId") as shapes,
            (SELECT STRING_AGG(DISTINCT ot.brands, ', ') FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId") as brands,
            (SELECT ot."releaseWarehouse" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "releaseWarehouse",
            (SELECT ot."transportVendor" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "transportVendor",
            (SELECT ot."containerNo" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "containerNo",
            (SELECT ot."sealNo" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "sealNo",
            (SELECT ot."deliveryDate" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "deliveryDate",
            (SELECT ot."exportDate" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "exportDate",
            (SELECT ot."stuffingDate" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "stuffingDate"
        FROM public.outbounds o
        WHERE o."outboundId" = :outboundId;
      `;
      const result = await db.sequelize.query(query, {
        replacements: { outboundId },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
      });
      return result;
    } catch (error) {
      console.error("MODEL ERROR in getGrnDetailsForEdit:", error);
      throw error;
    }
  },

  async updateAndRegenerateGrn(outboundId, data) {
    const t = await db.sequelize.transaction();
    try {
      const signatureQuery = `
        SELECT "driverSignature", "warehouseStaffSignature", "warehouseSupervisorSignature"
        FROM public.outbounds WHERE "outboundId" = :outboundId;
      `;
      const signatures = await db.sequelize.query(signatureQuery, {
        replacements: { outboundId },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
        transaction: t,
      });

      const outboundUpdateQuery = `
        UPDATE public.outbounds SET
          "releaseDate" = :releaseDate,
          "updatedAt" = NOW()
        WHERE "outboundId" = :outboundId;
      `;
      await db.sequelize.query(outboundUpdateQuery, {
        replacements: { releaseDate: data.releaseDate, outboundId },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      });

      const transactionUpdateQuery = `
        UPDATE public.outboundtransactions SET
          "releaseWarehouse" = :releaseWarehouse,
          "transportVendor" = :transportVendor,
          "commodity" = :commodities,
          "shape" = :shapes,
          "brands" = :brands,
          "containerNo" = :containerNo,
          "sealNo" = :sealNo,
          "releaseDate" = :releaseDate,
          "deliveryDate" = :deliveryDate,
          "exportDate" = :exportDate,
          "stuffingDate" = :stuffingDate,
          "updatedAt" = NOW()
        WHERE "outboundId" = :outboundId;
      `;
      await db.sequelize.query(transactionUpdateQuery, {
        replacements: { ...data, outboundId },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      });

      const pdfData = await this._gatherDataForPdfRegeneration(outboundId, t);

      pdfData.driverSignature = signatures.driverSignature;
      pdfData.warehouseStaffSignature = signatures.warehouseStaffSignature;
      pdfData.warehouseSupervisorSignature =
        signatures.warehouseSupervisorSignature;
      pdfData.isWeightVisible = true;

      const oldFilesQuery = `SELECT "grnImage", "grnPreviewImage" FROM public.outbounds WHERE "outboundId" = :outboundId;`;
      const oldFiles = await db.sequelize.query(oldFilesQuery, {
        replacements: { outboundId },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
        transaction: t,
      });

      if (oldFiles) {
        if (oldFiles.grnImage) {
          await fs
            .unlink(path.join(__dirname, "..", oldFiles.grnImage))
            .catch((err) => console.error("Error deleting old PDF:", err));
        }
        if (oldFiles.grnPreviewImage) {
          await fs
            .unlink(path.join(__dirname, "..", oldFiles.grnPreviewImage))
            .catch((err) => console.error("Error deleting old preview:", err));
        }
      }

      const { outputPath, previewImagePath } = await pdfService.generateGrnPdf(
        pdfData
      );

      const stats = await fs.stat(outputPath);
      const fileSizeInBytes = stats.size;
      const relativePdfPath = path.relative(
        path.join(__dirname, ".."),
        outputPath
      );
      const relativePreviewPath = path.relative(
        path.join(__dirname, ".."),
        previewImagePath
      );

      const fileUpdateQuery = `
        UPDATE public.outbounds SET
          "grnImage" = :grnImage,
          "grnPreviewImage" = :grnPreviewImage,
          "fileSize" = :fileSize,
          "updatedAt" = NOW()
        WHERE "outboundId" = :outboundId;
      `;
      await db.sequelize.query(fileUpdateQuery, {
        replacements: {
          grnImage: relativePdfPath,
          grnPreviewImage: relativePreviewPath,
          fileSize: fileSizeInBytes,
          outboundId,
        },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      });

      await t.commit();

      const pdfBuffer = await fs.readFile(outputPath);
      const previewImageBuffer = await fs.readFile(previewImagePath);

      return {
        pdf: pdfBuffer.toString("base64"),
        previewImage: previewImageBuffer.toString("base64"),
      };
    } catch (error) {
      await t.rollback();
      console.error("MODEL ERROR in updateAndRegenerateGrn:", error);
      throw error;
    }
  },

  async _gatherDataForPdfRegeneration(outboundId, transaction) {
    const outboundDetailsQuery = `
      SELECT "grnNo", "jobIdentifier", "releaseDate", "driverName", 
             "driverIdentityNo", "truckPlateNo", "warehouseStaff", "warehouseSupervisor", uom
      FROM public.outbounds
      WHERE "outboundId" = :outboundId;
    `;
    const outboundDetails = await db.sequelize.query(outboundDetailsQuery, {
      replacements: { outboundId },
      type: db.sequelize.QueryTypes.SELECT,
      plain: true,
      transaction,
    });

    const lotsQuery = `
      SELECT 
        "jobNo", "lotNo", "noOfBundle", "grossWeight", "netWeight", "actualWeight",
        commodity, shape, brands, "transportVendor", "releaseWarehouse", "containerNo", "sealNo"
      FROM public.outboundtransactions
      WHERE "outboundId" = :outboundId;
    `;
    const lots = await db.sequelize.query(lotsQuery, {
      replacements: { outboundId },
      type: db.sequelize.QueryTypes.SELECT,
      transaction,
    });

    if (!outboundDetails || lots.length === 0) {
      throw new Error("Could not find necessary details to regenerate PDF.");
    }

    const firstLot = lots[0];
    const aggregateDetails = (key) =>
      [...new Set(lots.map((lot) => lot[key]).filter(Boolean))].join(", ");

    return {
      ourReference: outboundDetails.jobIdentifier,
      grnNo: outboundDetails.grnNo,
      fileName: `${outboundDetails.jobIdentifier}/${outboundDetails.grnNo
        .split("-")
        .pop()
        .padStart(2, "0")}`,
      releaseDate: new Date(outboundDetails.releaseDate).toLocaleDateString(
        "en-GB",
        { day: "2-digit", month: "short", year: "numeric" }
      ),
      warehouse: firstLot.releaseWarehouse || "N/A",
      transportVendor: firstLot.transportVendor || "N/A",
      containerAndSealNo:
        firstLot.containerNo && firstLot.sealNo
          ? `${firstLot.containerNo} / ${firstLot.sealNo}`
          : "N/A",
      driverName: outboundDetails.driverName,
      driverIdentityNo: outboundDetails.driverIdentityNo,
      truckPlateNo: outboundDetails.truckPlateNo,
      warehouseStaff: outboundDetails.warehouseStaff,
      warehouseSupervisor: outboundDetails.warehouseSupervisor,
      uom: outboundDetails.uom,
      cargoDetails: {
        commodity: aggregateDetails("commodity") || "N/A",
        shape: aggregateDetails("shape") || "N/A",
        brand: aggregateDetails("brands") || "N/A",
      },
      lots: lots.map((lot) => {
        const actualWeight = parseFloat(lot.actualWeight) || 0;
        const grossWeight = parseFloat(lot.grossWeight) || 0;
        const displayWeight = actualWeight !== 0 ? actualWeight : grossWeight;

        return {
          lotNo: `${lot.jobNo}-${lot.lotNo}`,
          bundles: lot.noOfBundle,
          actualWeightMt: displayWeight.toFixed(3),
          netWeightMt: (parseFloat(lot.netWeight) || 0).toFixed(3),
        };
      }),
    };
  },
};

module.exports = grnModel;
