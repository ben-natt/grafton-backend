const db = require('../database');

const getAllStock = async () => {
    try {
        const query = `
        SELECT
            c."commodityName" AS "Metal",
            SUM(i."noOfBundle") AS "Bundles",
            COUNT(DISTINCT i."inboundId") AS "Lots",
            s."shapeName" AS "Shape",
            SUM(i."netWeight") AS "TotalWeight(KG)"
        FROM
            public.inbounds i
        LEFT JOIN
            public.selectedInbounds o ON o."inboundId" = i."inboundId"
        -- MODIFICATION: Join with outboundtransactions to filter out processed lots
        LEFT JOIN
            public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
        JOIN
            public.commodities c ON i."commodityId" = c."commodityId"
        JOIN
            public.shapes s ON i."shapeId" = s."shapeId"
        WHERE
            o."inboundId" IS NULL
            -- MODIFICATION: Ensure the lot is not in outboundtransactions
            AND ot."inboundId" IS NULL
        GROUP BY
            c."commodityName", s."shapeName"
        ORDER BY
            c."commodityName";
        `;

        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });

        return result;
    } catch (error) {
        console.error('Error fetching all stock records:', error);
        throw error;
    }
};

const getInventory = async (filters) => {
    try {
        const page = parseInt(filters.page, 10) || 1;
        const pageSize = parseInt(filters.pageSize, 10) || 25;
        const offset = (page - 1) * pageSize;
        const replacements = { pageSize, offset };

        // Define the base aggregation query as a Common Table Expression (CTE)
        const cteQuery = `
            WITH grouped_inventory AS (
                SELECT
                    i."jobNo" AS "Job No",
                    COUNT(i."lotNo") AS "Lot No",
                    c."commodityName" AS "Metal",
                    b."brandName" AS "Brand",
                    s."shapeName" AS "Shape",
                    SUM(i."noOfBundle") AS "Qty",
                    SUM(i."netWeight") AS "Weight"
                FROM
                    public.inbounds i
                LEFT JOIN
                    public.selectedInbounds o ON o."inboundId" = i."inboundId"
                LEFT JOIN
                    public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
                JOIN
                    public.brands b ON b."brandId" = i."brandId"
                JOIN
                    public.commodities c ON c."commodityId" = i."commodityId"
                JOIN
                    public.shapes s ON s."shapeId" = i."shapeId"
                WHERE
                    o."inboundId" IS NULL
                    AND ot."inboundId" IS NULL
                GROUP BY
                    i."jobNo", c."commodityName", b."brandName", s."shapeName"
            )
        `;

        // Rest of the code remains the same...
        let finalWhereClause = '';
        if (filters.search) {
            replacements.search = `%${filters.search}%`;
            finalWhereClause = `
                WHERE
                    "Job No" ILIKE :search OR
                    "Metal" ILIKE :search OR
                    "Brand" ILIKE :search OR
                    "Shape" ILIKE :search OR
                    CAST("Lot No" AS TEXT) ILIKE :search OR
                    CAST("Qty" AS TEXT) ILIKE :search OR
                    CAST("Weight" AS TEXT) ILIKE :search
            `;
        }

        const countQuery = `
            ${cteQuery}
            SELECT COUNT(*)::int AS "totalItems"
            FROM grouped_inventory
            ${finalWhereClause};
        `;

        const dataQuery = `
            ${cteQuery}
            SELECT *
            FROM grouped_inventory
            ${finalWhereClause}
            ORDER BY "Job No"
            LIMIT :pageSize OFFSET :offset;
        `;

        const countReplacements = { ...replacements };
        delete countReplacements.pageSize;
        delete countReplacements.offset;

        const [countResult, items] = await Promise.all([
            db.sequelize.query(countQuery, { replacements: countReplacements, type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(dataQuery, {
                replacements,
                type: db.sequelize.QueryTypes.SELECT
            })
        ]);

        const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;

        return { items, totalItems };
    } catch (error) {
        console.error('Error fetching inventory records:', error);
        throw error;
    }
};


const getFilterOptions = async () => {
    try {
        const brandsQuery = 'SELECT DISTINCT "brandName" FROM public.brands WHERE "brandName" IS NOT NULL ORDER BY "brandName";';
        const shapesQuery = 'SELECT DISTINCT "shapeName" FROM public.shapes WHERE "shapeName" IS NOT NULL ORDER BY "shapeName";';
        const commoditiesQuery = 'SELECT DISTINCT "commodityName" FROM public.commodities WHERE "commodityName" IS NOT NULL ORDER BY "commodityName";';
        const jobNosQuery = 'SELECT DISTINCT "jobNo" FROM public.inbounds WHERE "jobNo" IS NOT NULL ORDER BY "jobNo";';
        const exLMEWarehouseQuery = 'SELECT DISTINCT "exLmeWarehouseName" FROM public.exlmewarehouses WHERE "exLmeWarehouseName" IS NOT NULL ORDER BY "exLmeWarehouseName";';
        const exWarehouseLocationQuery = 'SELECT DISTINCT "exWarehouseLocationName" FROM public.exwarehouselocations WHERE "exWarehouseLocationName" IS NOT NULL ORDER BY "exWarehouseLocationName";';
        const inboundWarehouseQuery = 'SELECT DISTINCT "inboundWarehouseName" FROM public.inboundwarehouses WHERE "inboundWarehouseName" IS NOT NULL ORDER BY "inboundWarehouseName";';

        const [brands, shapes, commodities, jobNos, exlmewarehouse, exWarehouseLocation, inboundWarehouse] = await Promise.all([
            db.sequelize.query(brandsQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(shapesQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(commoditiesQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(jobNosQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(exLMEWarehouseQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(exWarehouseLocationQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(inboundWarehouseQuery, { type: db.sequelize.QueryTypes.SELECT })
        ]);
        if (!brands || !shapes || !commodities || !jobNos || !exlmewarehouse || !exWarehouseLocation || !inboundWarehouse) {
            throw new Error('Failed to fetch filter options');
        }

        return {
            brands: brands.map(item => item.brandName),
            shapes: shapes.map(item => item.shapeName),
            commodities: commodities.map(item => item.commodityName),
            jobNos: jobNos.map(item => item.jobNo),
            exLMEWarehouse: exlmewarehouse.map(item => item.exLmeWarehouseName),
            exWarehouseLocation: exWarehouseLocation.map(item => item.exWarehouseLocationName),
            inboundWarehouse: inboundWarehouse.map(item => item.inboundWarehouseName)


        };
    } catch (error) {
        console.error('Error fetching filter options:', error);
        throw error;
    }
};


const getLotSummary = async (jobNo, lotNo) => {
    try {
        // Query 1: Get the details for the specific AVAILABLE lot you clicked on
        const detailsQuery = `
      SELECT
        i."jobNo" AS "JobNo", i."lotNo" AS "LotNo", i."noOfBundle" AS "NoOfBundle",
        i."inboundId", i."barcodeNo" AS "Barcode", c."commodityName" AS "Commodity", b."brandName" AS "Brand",
        s."shapeName" AS "Shape", exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
        i."exWarehouseLot" AS "ExWarehouseLot", i."exWarehouseWarrant" AS "ExWarehouseWarrant",
        exwhl."exWarehouseLocationName" AS "ExWarehouseLocation", iw."inboundWarehouseName" AS "InboundWarehouse",
        i."createdAt" AS "InboundDate", TO_CHAR(si."inboundDate" AT TIME ZONE 'Asia/Singapore', 'YYYY-MM-DD') AS "ScheduleInboundDate",
        si."createdAt" AS "CreatedAt",
        i."grossWeight" AS "GrossWeight", i."netWeight" AS "NetWeight", i."actualWeight" AS "ActualWeight",
        i."isRebundled" AS "IsRebundled", i."isRepackProvided" AS "IsRepackProvided",
        u1."username" AS "ScheduledBy",
        u2."username" AS "ProcessedBy",
        i."updatedAt" AS "UpdatedAt"
      FROM public.inbounds i
      LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
      -- MODIFICATION: Join with outboundtransactions to filter out processed lots
      LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
      LEFT JOIN public.lot l on l."jobNo" = i."jobNo" AND l."lotNo" = i."lotNo"
      LEFT JOIN public.scheduleinbounds si ON si."scheduleInboundId" = l."scheduleInboundId"
      LEFT JOIN public.brands b ON b."brandId" = i."brandId"
      LEFT JOIN public.commodities c ON c."commodityId" = i."commodityId"
      LEFT JOIN public.shapes s ON s."shapeId" = i."shapeId"
      LEFT JOIN public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
      LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
      LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
      LEFT JOIN public.users u1 ON u1.userid = i."userId"
     LEFT JOIN public.users u2 ON u2.userid = i."processedId"
      WHERE o."inboundId" IS NULL
        -- MODIFICATION: Ensure the lot is not in outboundtransactions
        AND ot."inboundId" IS NULL
        AND i."jobNo" = :jobNo
        AND i."lotNo" = :lotNo
      LIMIT 1;
    `;

        const lotDetailsResult = await db.sequelize.query(detailsQuery, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { jobNo, lotNo }
        });

        if (lotDetailsResult.length === 0) {
            return null;
        }

        const lotDetails = lotDetailsResult[0];
        const exactJobNo = lotDetails.JobNo;

        // --- Outbound Activities ---
        let outboundActivities = [];

        if (exactJobNo) {
            const outboundQuery = `
        SELECT "jobNo", "lotNo", "createdAt"
        FROM public.outboundtransactions
        WHERE "jobNo" = :jobNo
        ORDER BY "createdAt" DESC;
      `;

            outboundActivities = await db.sequelize.query(outboundQuery, {
                type: db.sequelize.QueryTypes.SELECT,
                replacements: { jobNo: exactJobNo }
            });
        }

        // --- Lot Count Info ---
        const countsQuery = `
      SELECT
        COUNT(*) AS "TotalCount",
        COUNT(CASE WHEN o."inboundId" IS NULL AND ot."inboundId" IS NULL THEN 1 END) AS "AvailableCount"
      FROM public.inbounds i
      LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
      -- MODIFICATION: Join with outboundtransactions to get an accurate available count
      LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
      WHERE i."jobNo" = :jobNo;
    `;

        const lotCountsResult = await db.sequelize.query(countsQuery, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { jobNo: exactJobNo }
        });

        // Merge all results into one object
        const finalResult = {
            ...lotDetails,
            ...lotCountsResult[0],
            "OutboundActivities": outboundActivities
        };

        return finalResult;

    } catch (error) {
        console.error('Error fetching lot summary records:', error);
        throw error;
    }
};


const getLotDetails = async (filters) => {
    try {
        const replacements = {};
        // MODIFICATION: Add check for outboundtransactions to the default clauses
        let whereClauses = ['o."inboundId" IS NULL', 'ot."inboundId" IS NULL'];

        // --- Existing Filters ---
        if (filters.selectedMetal) {
            whereClauses.push('c."commodityName" = :selectedMetal');
            replacements.selectedMetal = filters.selectedMetal;
        }
        if (filters.selectedShape) {
            whereClauses.push('s."shapeName" = :selectedShape');
            replacements.selectedShape = filters.selectedShape;
        }
        if (filters.jobNo) {
            whereClauses.push('i."jobNo" ILIKE :jobNo');
            replacements.jobNo = `%${filters.jobNo}%`;
        }
        if (filters.brands) {
            try {
                const brandsList = JSON.parse(filters.brands);
                if (Array.isArray(brandsList) && brandsList.length > 0) {
                    whereClauses.push('b."brandName" IN (:brands)');
                    replacements.brands = brandsList;
                }
            } catch (e) {
                console.error("Error parsing brands filter:", e);
            }
        }
        if (filters.exWarehouseLocation) {
            whereClauses.push('exwhl."exWarehouseLocationName" = :exWarehouseLocation');
            replacements.exWarehouseLocation = filters.exWarehouseLocation;
        }
        if (filters.exLMEWarehouse) {
            whereClauses.push('elme."exLmeWarehouseName" = :exLMEWarehouse');
            replacements.exLMEWarehouse = filters.exLMEWarehouse;
        }
        if (filters.noOfBundle) {
            const noOfBundleInt = parseInt(filters.noOfBundle, 10);
            if (!isNaN(noOfBundleInt)) {
                whereClauses.push('i."noOfBundle" = :noOfBundle');
                replacements.noOfBundle = noOfBundleInt;
            }
        }
        if (filters.inboundWarehouse) {
            whereClauses.push('iw."inboundWarehouseName" = :inboundWarehouse');
            replacements.inboundWarehouse = filters.inboundWarehouse;
        }
        if (filters.exWarehouseLot) {
            whereClauses.push('i."exWarehouseLot" ILIKE :exWarehouseLot');
            replacements.exWarehouseLot = `%${filters.exWarehouseLot}%`;
        }

        // --- NEW Search Filter ---
        if (filters.search) {
            whereClauses.push(`(
                i."jobNo" ILIKE :search OR
                i."exWarehouseLot" ILIKE :search OR
                c."commodityName" ILIKE :search OR
                b."brandName" ILIKE :search OR
                s."shapeName" ILIKE :search OR
                CAST(i."lotNo" AS TEXT) ILIKE :search OR
                CAST(i."netWeight" AS TEXT) ILIKE :search OR
                CAST(i."noOfBundle" AS TEXT) ILIKE :search 
            )`);
            replacements.search = `%${filters.search}%`;
        }

        const whereString = ' WHERE ' + whereClauses.join(' AND ');

        // Query for total count
        const countQuery = `
            SELECT COUNT(i."inboundId")::int AS "totalItems"
            FROM public.inbounds i
            LEFT JOIN public.commodities c ON i."commodityId" = c."commodityId"
            LEFT JOIN public.shapes s ON i."shapeId" = s."shapeId"
            LEFT JOIN public.brands b ON i."brandId" = b."brandId"
            LEFT JOIN public.exlmewarehouses elme ON elme."exLmeWarehouseId" = i."exLmeWarehouseId"
            LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
            LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
            LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
            -- MODIFICATION: Join with outboundtransactions to filter out processed lots
            LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
            ${whereString};
        `;

        const countResult = await db.sequelize.query(countQuery, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { ...replacements }
        });
        const totalItems = countResult[0].totalItems;

        // Query for paginated data
        let query = `
            SELECT
                i."inboundId" as id, i."jobNo" AS "JobNo", i."lotNo" AS "LotNo",
                i."exWarehouseLot" AS "Ex-WarehouseLot", elme."exLmeWarehouseName" AS "ExLMEWarehouse",
                c."commodityName" AS "Metal", b."brandName" AS "Brand", s."shapeName" AS "Shape",
                i."noOfBundle" AS "Qty", SUM(CASE WHEN i."isWeighted" = true THEN i."actualWeight" ELSE i."netWeight" END) AS "Weight"
 , exwhl."exWarehouseLocationName" AS "ExWarehouseLocation"
            , iw."inboundWarehouseName" AS "InboundWarehouse"
            FROM public.inbounds i
            JOIN public.commodities c ON i."commodityId" = c."commodityId"
            JOIN public.shapes s ON i."shapeId" = s."shapeId"
            LEFT JOIN public.brands b ON i."brandId" = b."brandId"
            LEFT JOIN public.exlmewarehouses elme ON elme."exLmeWarehouseId" = i."exLmeWarehouseId"
            LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
            LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
            LEFT JOIN public.selectedInbounds o ON o."inboundId" = i."inboundId"
            -- MODIFICATION: Join with outboundtransactions to filter out processed lots
            LEFT JOIN public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
            ${whereString}
GROUP BY 
    i."inboundId", i."jobNo", i."lotNo", i."exWarehouseLot", elme."exLmeWarehouseName",
    c."commodityName", b."brandName", s."shapeName", i."noOfBundle",
    exwhl."exWarehouseLocationName", iw."inboundWarehouseName"
ORDER BY i."inboundId"        `;

        const page = parseInt(filters.page, 10) || 1;
        const pageSize = parseInt(filters.pageSize, 10) || 25;
        const offset = (page - 1) * pageSize;

        query += ` LIMIT :pageSize OFFSET :offset;`;
        replacements.pageSize = pageSize;
        replacements.offset = offset;

        const items = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: replacements
        });

        return { items, totalItems };

    } catch (error) {
        console.error('Error fetching lot details:', error);
        throw error;
    }
};

const createScheduleOutbound = async (scheduleData, userId) => {
  const t = await db.sequelize.transaction();
  console.log('Creating schedule outbound with data:', scheduleData, 'and userId:', userId);

  try {
    const {
      releaseStartDate, // Used as releaseDate
      releaseEndDate,   // Used as releaseEndDate
      lotReleaseWeight,
      exportDate,
      stuffingDate,
      containerNo,
      sealNo,
      deliveryDate,
      storageReleaseLocation,
      releaseWarehouse,
      transportVendor,
      selectedLots
    } = scheduleData;

    const outboundType = (containerNo && containerNo.length > 0) ? 'container' : 'flatbed';

    const scheduleInsertQuery = `
      INSERT INTO public.scheduleoutbounds (
        "releaseDate", "releaseEndDate", "userId", "lotReleaseWeight", "outboundType", "exportDate",
        "stuffingDate", "containerNo", "sealNo", "createdAt", "updatedAt",
        "deliveryDate", "storageReleaseLocation", "releaseWarehouse", "transportVendor"
      )
      VALUES (
        :releaseDate, :releaseEndDate, :userId, :lotReleaseWeight, :outboundType, :exportDate,
        :stuffingDate, :containerNo, :sealNo, NOW(), NOW(),
        :deliveryDate, :storageReleaseLocation, :releaseWarehouse, :transportVendor
      )
      RETURNING "scheduleOutboundId";
    `;

    const insertResult = await db.sequelize.query(scheduleInsertQuery, {
      replacements: {
        releaseDate: releaseStartDate,
        releaseEndDate: releaseEndDate,
        userId,
        lotReleaseWeight: parseFloat(lotReleaseWeight),
        outboundType,
        exportDate,
        stuffingDate: stuffingDate || null,
        containerNo: containerNo || null,
        sealNo: sealNo || null,
        deliveryDate: deliveryDate || null,
        storageReleaseLocation,
        releaseWarehouse,
        transportVendor
      },
      type: db.sequelize.QueryTypes.INSERT,
      transaction: t
    });

    const scheduleOutboundId = insertResult?.[0]?.[0]?.scheduleOutboundId;

    if (!scheduleOutboundId) {
      throw new Error("Failed to retrieve scheduleOutboundId.");
    }

    // Insert selected lots
    if (selectedLots?.length > 0) {
      const selectedInboundsQuery = `
        INSERT INTO public.selectedinbounds (
          "inboundId", "scheduleOutboundId", "lotNo", "jobNo", "createdAt", "updatedAt"
        )
        VALUES (:inboundId, :scheduleOutboundId, :lotNo, :jobNo, NOW(), NOW())
        ON CONFLICT ("jobNo", "lotNo") DO NOTHING;
      `;

      const updateInboundQuantityQuery = `
        UPDATE public.inbounds
        SET "noOfBundle" = :quantity
        WHERE "inboundId" = :inboundId;
      `;

      for (const lot of selectedLots) {
        const inboundId = lot.id;
        const quantity = lot.Qty;

        if (!inboundId) {
          console.warn('Skipping lot due to missing inboundId:', lot);
          continue;
        }

        const lotNoString = lot['Lot No']?.toString() ?? '';
        const [jobNo, lotNoStr] = lotNoString.split('-');
        const lotNo = parseInt(lotNoStr, 10);

        if (!jobNo || !Number.isInteger(lotNo)) {
          console.warn(`Skipping invalid lot format: "${lotNoString}"`);
          continue;
        }

        await db.sequelize.query(selectedInboundsQuery, {
          replacements: {
            inboundId,
            scheduleOutboundId,
            lotNo,
            jobNo
          },
          type: db.sequelize.QueryTypes.INSERT,
          transaction: t
        });

        if (quantity != null) {
          await db.sequelize.query(updateInboundQuantityQuery, {
            replacements: {
              quantity,
              inboundId
            },
            type: db.sequelize.QueryTypes.UPDATE,
            transaction: t
          });
        }
      }
    }

    await t.commit();
    return {
      success: true,
      message: 'Schedule created successfully.',
      scheduleOutboundId
    };

  } catch (error) {
    await t.rollback();
    console.error('Error in createScheduleOutbound transaction:', error);
    throw new Error('Failed to create outbound schedule due to a database error.');
  }
};



const EditInformation = async (inboundId, updateData) => {
    try {
        const setClauses = [];
        const replacements = { inboundId };

        for (const key in updateData) {
            // Map frontend keys to DB columns
            let dbColumnName;
            switch (key) {
                case 'noOfBundle': dbColumnName = 'noOfBundle'; break;
                case 'barcodeNo': dbColumnName = 'barcodeNo'; break;
                case 'commodity': dbColumnName = 'commodityId'; break;
                case 'brand': dbColumnName = 'brandId'; break;
                case 'shape': dbColumnName = 'shapeId'; break;
                case 'exLMEWarehouse': dbColumnName = 'exLmeWarehouseId'; break;
                case 'exWarehouseLot': dbColumnName = 'exWarehouseLot'; break;
                case 'exWarehouseWarrant': dbColumnName = 'exWarehouseWarrant'; break;
                case 'exWarehouseLocation': dbColumnName = 'exWarehouseLocationId'; break;
                case 'inboundWarehouse': dbColumnName = 'inboundWarehouseId'; break;
                case 'grossWeight': dbColumnName = 'grossWeight'; break;
                case 'netWeight': dbColumnName = 'netWeight'; break;
                case 'actualWeight': dbColumnName = 'actualWeight'; break;
                case 'isRelabelled': dbColumnName = 'isRelabelled'; break;
                case 'isRebundled': dbColumnName = 'isRebundled'; break;
                case 'isRepackProvided': dbColumnName = 'isRepackProvided'; break;
                default:
                    console.warn(`Unknown key: ${key}`);
                    continue;
            }

            // Lookup IDs if needed
            if (['commodityId', 'brandId', 'shapeId', 'exLmeWarehouseId', 'exWarehouseLocationId', 'inboundWarehouseId'].includes(dbColumnName)) {
                let lookupTable, lookupNameCol, lookupIdCol;
                switch (dbColumnName) {
                    case 'commodityId': lookupTable = 'commodities'; lookupNameCol = 'commodityName'; lookupIdCol = 'commodityId'; break;
                    case 'brandId': lookupTable = 'brands'; lookupNameCol = 'brandName'; lookupIdCol = 'brandId'; break;
                    case 'shapeId': lookupTable = 'shapes'; lookupNameCol = 'shapeName'; lookupIdCol = 'shapeId'; break;
                    case 'exLmeWarehouseId': lookupTable = 'exlmewarehouses'; lookupNameCol = 'exLmeWarehouseName'; lookupIdCol = 'exLmeWarehouseId'; break;
                    case 'exWarehouseLocationId': lookupTable = 'exwarehouselocations'; lookupNameCol = 'exWarehouseLocationName'; lookupIdCol = 'exWarehouseLocationId'; break;
                    case 'inboundWarehouseId': lookupTable = 'inboundwarehouses'; lookupNameCol = 'inboundWarehouseName'; lookupIdCol = 'inboundWarehouseId'; break;
                }
                const lookupQuery = `SELECT "${lookupIdCol}" FROM public."${lookupTable}" WHERE "${lookupNameCol}" = :value LIMIT 1;`;
                const lookupResult = await db.sequelize.query(lookupQuery, {
                    type: db.sequelize.QueryTypes.SELECT,
                    replacements: { value: updateData[key] }
                });
                if (lookupResult.length > 0) {
                    setClauses.push(`"${dbColumnName}" = :${key}_id`);
                    replacements[`${key}_id`] = lookupResult[0][lookupIdCol];
                } else {
                    console.warn(`Lookup failed for ${key}: ${updateData[key]}`);
                    continue;
                }
            }
            // Handle boolean fields
            else if (['isRelabelled', 'isRebundled', 'isRepackProvided'].includes(dbColumnName)) {
                setClauses.push(`"${dbColumnName}" = :${key}`);
                replacements[key] = (updateData[key] === 'Yes');
            }
            // Direct mapping for simple fields
            else {
                setClauses.push(`"${dbColumnName}" = :${key}`);
                replacements[key] = updateData[key];
            }
        }

        console.log('Set Clauses:', setClauses);

        if (setClauses.length === 0) {
            return { success: false, message: 'No valid fields to update.' };
        }

        const query = `
            UPDATE public.inbounds
            SET ${setClauses.join(', ')}, "updatedAt" = NOW()
            WHERE "inboundId" = :inboundId;
        `;
        console.log('Update Query:', query);
        const [results, metadata] = await db.sequelize.query(query, {
            replacements,
            type: db.sequelize.QueryTypes.UPDATE
        });

        if (metadata.rowCount > 0) {
            return { success: true, message: 'Lot information updated successfully.' };
        } else {
            return { success: false, message: 'No lot found with the given inboundId or no changes made.' };
        }

    } catch (error) {
        console.error('Error in EditInformation:', error);
        throw error;
    }
};

const getLotsByJobNo = async (jobNo, brandName, shapeName, filters) => { // Accept brandName, shapeName, and filters
    try {
        const page = parseInt(filters.page, 10) || 1;
        const pageSize = parseInt(filters.pageSize, 10) || 100; // Default to a higher page size for this bulk action
        const offset = (page - 1) * pageSize;

        const whereClause = `
            WHERE
                i."jobNo" = :jobNo
                AND b."brandName" = :brandName
                AND s."shapeName" = :shapeName
                AND o."inboundId" IS NULL
                -- MODIFICATION: Ensure the lot is not in outboundtransactions
                AND ot."inboundId" IS NULL
        `;

        const baseQuery = `
            FROM
                public.inbounds i
            LEFT JOIN
                public.selectedInbounds o ON o."inboundId" = i."inboundId"
            -- MODIFICATION: Join with outboundtransactions to filter out processed lots
            LEFT JOIN
                public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
            JOIN
                public.commodities c ON i."commodityId" = c."commodityId"
            JOIN
                public.shapes s ON i."shapeId" = s."shapeId"
            LEFT JOIN
                public.brands b ON i."brandId" = b."brandId"
            LEFT JOIN
                public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
            LEFT JOIN
                public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
            LEFT JOIN
                public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
            ${whereClause}
        `;

        const countQuery = `SELECT COUNT(i."inboundId")::int AS "totalItems" ${baseQuery}`;

        const dataQuery = `
            SELECT
                i."inboundId" as id,
                i."jobNo" AS "JobNo",
                i."lotNo" AS "LotNo",
                i."exWarehouseLot" AS "Ex-WarehouseLot",
                c."commodityName" AS "Metal",
                b."brandName" AS "Brand",
                s."shapeName" AS "Shape",
                i."noOfBundle" AS "Qty",
                i."netWeight" AS "Weight",
                exwhl."exWarehouseLocationName" AS "ExWarehouseLocation",
                exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
                iw."inboundWarehouseName" AS "InboundWarehouse"
            ${baseQuery}
            ORDER BY i."lotNo"
            LIMIT :pageSize OFFSET :offset;
        `;

        const replacements = { jobNo, brandName, shapeName, pageSize, offset };

        const [countResult, items] = await Promise.all([
            db.sequelize.query(countQuery, { replacements: { jobNo, brandName, shapeName }, type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(dataQuery, { replacements, type: db.sequelize.QueryTypes.SELECT })
        ]);

        const totalItems = countResult.length > 0 ? countResult[0].totalItems : 0;

        return { items, totalItems };
    } catch (error) {
        console.error('Error fetching lots by job number and brand:', error);
        throw error;
    }
};


const getInventory1 = async () => {
    try {
        const query = `
            SELECT
                    i."jobNo" AS "Job No",
                    COUNT(i."lotNo") AS "Lot No",
                    c."commodityName" AS "Metal",
                    b."brandName" AS "Brand",
                    s."shapeName" AS "Shape",
                    SUM(i."noOfBundle") AS "Qty",
                    SUM(i."netWeight") AS "Weight"
                FROM
                    public.inbounds i
                LEFT JOIN
                    public.selectedInbounds o ON o."inboundId" = i."inboundId"
                LEFT JOIN
                    public.outboundtransactions ot ON ot."inboundId" = i."inboundId"
                JOIN
                    public.brands b ON b."brandId" = i."brandId"
                JOIN
                    public.commodities c ON c."commodityId" = i."commodityId"
                JOIN
                    public.shapes s ON s."shapeId" = i."shapeId"
                WHERE
                    o."inboundId" IS NULL
                    AND ot."inboundId" IS NULL
                GROUP BY
                    i."jobNo", c."commodityName", b."brandName", s."shapeName"
                ORDER BY
                    i."jobNo"
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });
        return result;
    } catch (error) {
        console.error('Error fetching inventory records:', error);
        throw error;
    }
};


module.exports = {
    getAllStock,
    getLotDetails,
    getInventory,
    getFilterOptions,
    getLotSummary,
    createScheduleOutbound,
    EditInformation,
    getLotsByJobNo,
    getInventory1
};