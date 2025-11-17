const db = require("../database");
const path = require("path");
const fs = require("fs").promises;
const pdfService = require("../pdf.services");

const grnModel = {
  async getAllGrns(filters = {}) {
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
        whereClauses.push(`o."jobIdentifier" = :jobNo`);
        replacements.jobNo = filters.jobNo;
      }

      if (filters.searchQuery) {
        whereClauses.push(
          `(o."grnNo" ILIKE :searchPattern OR ot_summary.jobNos ILIKE :searchPattern OR ot_summary.commodities ILIKE :searchPattern)`
        );
        replacements.searchPattern = `%${filters.searchQuery}%`;
      }

      if (filters.startDate && filters.endDate) {
        whereClauses.push(
          `(o."releaseDate" AT TIME ZONE 'Asia/Singapore')::date BETWEEN :startDate::date AND :endDate::date`
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
        Date: 'o."releaseDate"',
        "GRN No.": 'o."grnNo"',
        "File Name": 'o."grnImage"',
      };

      let orderByClause = 'ORDER BY o."releaseDate" DESC, o."grnNo" DESC';

      if (filters.sortBy && sortColumnMap[filters.sortBy]) {
        const sortOrder = filters.sortOrder === "DESC" ? "DESC" : "ASC";
        orderByClause = `ORDER BY ${
          sortColumnMap[filters.sortBy]
        } ${sortOrder}`;
      }

      const dataQuery = `
        SELECT
          o."outboundId",
          TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'DD/MM/YY') AS "date",
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
      // This query now correctly fetches the unique jobIdentifier.
      const query = `
        SELECT DISTINCT o."jobIdentifier" as "jobNo"
        FROM public.outbounds o
        WHERE o."grnNo" IS NOT NULL AND o."jobIdentifier" IS NOT NULL
        ORDER BY "jobNo" ASC;
      `;

      const results = await db.sequelize.query(query, {
        type: db.sequelize.QueryTypes.SELECT,
      });

      const jobNos = results.map((item) => item.jobNo);

      // Return the list of job numbers.
      return { jobNos: jobNos };
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
           TO_CHAR(o."releaseDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "releaseDate",
            o."uom",
            (SELECT ot."outboundType" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "outboundType",
            (SELECT STRING_AGG(DISTINCT ot.commodity, ', ') FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId") as commodities,
            (SELECT STRING_AGG(DISTINCT ot.shape, ', ') FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId") as shapes,
            
            (SELECT ot."releaseWarehouse" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "releaseWarehouse",
            (SELECT ot."transportVendor" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "transportVendor",
            (SELECT ot."containerNo" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "containerNo",
            (SELECT ot."sealNo" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "sealNo",
            (SELECT ot."deliveryDate" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "deliveryDate",
            (SELECT ot."exportDate" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "exportDate",
            (SELECT ot."stuffingDate" FROM public.outboundtransactions ot WHERE ot."outboundId" = o."outboundId" LIMIT 1) as "stuffingDate",
        
            (
              SELECT json_agg(json_build_object(
                'outboundTransactionId', ot."outboundTransactionId",
                'jobNo', ot."jobNo",
                'lotNo', ot."lotNo",
                'brand', ot.brands
              ))
              FROM public.outboundtransactions ot
              WHERE ot."outboundId" = o."outboundId"
            ) as lots

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

  async updateAndRegenerateGrn(outboundId, data, options = {}) {
    // <-- MODIFIED: Add options
    // --- MODIFIED: Use passed transaction or create a new one ---
    const t = options.transaction || (await db.sequelize.transaction());
    // --- END MODIFIED ---
    try {
      const oldDataQuery = `
          SELECT "grnImage", "grnPreviewImage", "driverSignature", "warehouseStaffSignature", "warehouseSupervisorSignature", "isWeightVisible"
          FROM public.outbounds WHERE "outboundId" = :outboundId;
        `;
      const oldData = await db.sequelize.query(oldDataQuery, {
        replacements: { outboundId },
        type: db.sequelize.QueryTypes.SELECT,
        plain: true,
        transaction: t,
      });

      const outboundUpdateQuery = `
          UPDATE public.outbounds SET
            "releaseDate" = :releaseDate,
            "uom" = :uom,
            "updatedAt" = NOW()
          WHERE "outboundId" = :outboundId;
        `;
      await db.sequelize.query(outboundUpdateQuery, {
        replacements: {
          releaseDate: data.releaseDate,
          uom: data.uom,
          outboundId,
        },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      });

      const transactionUpdateQuery = `
          UPDATE public.outboundtransactions SET
            "releaseWarehouse" = :releaseWarehouse,
            "transportVendor" = :transportVendor,
            "commodity" = :commodities,
            "shape" = :shapes,
            "containerNo" = :containerNo,
            "sealNo" = :sealNo,
            "releaseDate" = :releaseDate,
            "updatedAt" = NOW()
          WHERE "outboundId" = :outboundId;
        `;
      await db.sequelize.query(transactionUpdateQuery, {
        replacements: { ...data, outboundId },
        type: db.sequelize.QueryTypes.UPDATE,
        transaction: t,
      });

      if (data.updatedBrands && Array.isArray(data.updatedBrands)) {
        for (const brandUpdate of data.updatedBrands) {
          const { outboundTransactionId, newBrand } = brandUpdate;
          if (outboundTransactionId) {
            const brandUpdateQuery = `
              UPDATE public.outboundtransactions SET
                brands = :newBrand,
                "updatedAt" = NOW()
              WHERE "outboundTransactionId" = :outboundTransactionId;
            `;
            await db.sequelize.query(brandUpdateQuery, {
              replacements: {
                newBrand: newBrand || null,
                outboundTransactionId: outboundTransactionId,
              },
              type: db.sequelize.QueryTypes.UPDATE,
              transaction: t,
            });
          }
        }
      }

      const pdfData = await this._gatherDataForPdfRegeneration(outboundId, t);

      if (oldData.driverSignature)
        pdfData.driverSignature = oldData.driverSignature;
      if (oldData.warehouseStaffSignature)
        pdfData.warehouseStaffSignature = oldData.warehouseStaffSignature;
      if (oldData.warehouseSupervisorSignature)
        pdfData.warehouseSupervisorSignature =
          oldData.warehouseSupervisorSignature;
      pdfData.isWeightVisible = oldData.isWeightVisible;

      if (oldData && oldData.grnImage) {
        const oldBaseName = path.basename(
          oldData.grnImage,
          path.extname(oldData.grnImage)
        );
        pdfData.fileName = oldBaseName.replace(/^GRN_/, "").replace(/_/g, "/");
      } else {
        const grnParts = pdfData.grnNo.split("-");
        const sequence = grnParts.length > 1 ? grnParts.pop() : "1";
        pdfData.fileName = `${pdfData.ourReference}/${sequence.padStart(
          2,
          "0"
        )}`;
      }

      if (oldData) {
        if (oldData.grnImage) {
          await fs
            .unlink(path.join(__dirname, "..", oldData.grnImage))
            .catch((err) => console.error("Error deleting old PDF:", err));
        }
        if (oldData.grnPreviewImage) {
          await fs
            .unlink(path.join(__dirname, "..", oldData.grnPreviewImage))
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

      if (!options.transaction) {
        await t.commit();
      }

      const pdfBuffer = await fs.readFile(outputPath);
      const previewImageBuffer = await fs.readFile(previewImagePath);

      return {
        pdf: pdfBuffer.toString("base64"),
        previewImage: previewImageBuffer.toString("base64"),
      };
    } catch (error) {
      if (!options.transaction) {
        await t.rollback();
      }
      console.error("MODEL ERROR in updateAndRegenerateGrn:", error);
      throw error;
    }
  },

  async getDropdownOptions() {
    try {
      const queries = [
        db.sequelize.query(
          'SELECT "releaseWarehouseName" as name FROM public.releasewarehouses ORDER BY "releaseWarehouseName"',
          { type: db.sequelize.QueryTypes.SELECT }
        ),
        db.sequelize.query(
          'SELECT "transportVendorName" as name FROM public.transportvendors ORDER BY "transportVendorName"',
          { type: db.sequelize.QueryTypes.SELECT }
        ),
        db.sequelize.query(
          'SELECT "commodityName" as name FROM public.commodities ORDER BY "commodityName"',
          { type: db.sequelize.QueryTypes.SELECT }
        ),
        db.sequelize.query(
          'SELECT "shapeName" as name FROM public.shapes ORDER BY "shapeName"',
          { type: db.sequelize.QueryTypes.SELECT }
        ),
        db.sequelize.query(
          'SELECT "brandName" as name FROM public.brands ORDER BY "brandName"',
          { type: db.sequelize.QueryTypes.SELECT }
        ),
        db.sequelize.query(
          "SELECT DISTINCT uom as name FROM public.outbounds WHERE uom IS NOT NULL AND uom <> '' ORDER BY name",
          { type: db.sequelize.QueryTypes.SELECT }
        ),
      ];

      const [
        releaseWarehouses,
        transportVendors,
        commodities,
        shapes,
        brands,
        uoms,
      ] = await Promise.all(queries);

      return {
        releaseWarehouses: releaseWarehouses.map((item) => item.name),
        transportVendors: transportVendors.map((item) => item.name),
        commodities: commodities.map((item) => item.name),
        shapes: shapes.map((item) => item.name),
        brands: brands.map((item) => item.name),
        uoms: uoms.map((item) => item.name),
      };
    } catch (error) {
      console.error("MODEL ERROR in getDropdownOptions:", error);
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

    const uniqueBrands = [
      ...new Set(lots.map((lot) => lot.brands).filter(Boolean)),
    ];
    const multipleBrands = uniqueBrands.length > 1;
    const singleBrandForHeader =
      uniqueBrands.length === 1 ? uniqueBrands[0] : "";

    return {
      ourReference: outboundDetails.jobIdentifier,
      grnNo: outboundDetails.grnNo,
      releaseDate: new Date(outboundDetails.releaseDate).toLocaleDateString(
        "en-GB",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Singapore",
        }
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
        brand: singleBrandForHeader, // MODIFIED: Use singleBrandForHeader
      },
      multipleBrands: multipleBrands, // NEW: Pass multipleBrands flag
      lots: lots.map((lot) => {
        const actualWeight = parseFloat(lot.actualWeight) || 0;
        const grossWeight = parseFloat(lot.grossWeight) || 0;
        const displayWeight = actualWeight !== 0 ? actualWeight : grossWeight;

        return {
          lotNo: `${lot.jobNo}-${lot.lotNo}`,
          bundles: lot.noOfBundle,
          actualWeightMt: displayWeight.toFixed(3),
          netWeightMt: (parseFloat(lot.netWeight) || 0).toFixed(3),
          brand: lot.brands, // NEW: Pass the lot-specific brand
        };
      }),
    };
  },
};

module.exports = grnModel;
