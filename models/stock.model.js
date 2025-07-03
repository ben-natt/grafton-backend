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
            public.outboundtransactions o ON o."inboundId" = i."inboundId"
        JOIN 
            public.commodities c ON i."commodityId" = c."commodityId"
        JOIN 
            public.shapes s ON i."shapeId" = s."shapeId"
        WHERE 
            o."inboundId" IS NULL
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

const getInventory = async () => {
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
            public.outboundtransactions o ON o."inboundId" = i."inboundId"
        JOIN 
            public.brands b ON b."brandId" = i."brandId"
        JOIN 
            public.commodities c ON c."commodityId" = i."commodityId"
        JOIN 
            public.shapes s ON s."shapeId" = i."shapeId"
        WHERE 
            o."inboundId" IS NULL 
        GROUP BY 
            i."jobNo", c."commodityName", b."brandName", s."shapeName"
        ORDER BY 
            i."jobNo"
        LIMIT 10;
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

const getFilterOptions = async () => {
    try {
        const brandsQuery = 'SELECT DISTINCT "brandName" FROM public.brands WHERE "brandName" IS NOT NULL ORDER BY "brandName";';
        const shapesQuery = 'SELECT DISTINCT "shapeName" FROM public.shapes WHERE "shapeName" IS NOT NULL ORDER BY "shapeName";';
        const commoditiesQuery = 'SELECT DISTINCT "commodityName" FROM public.commodities WHERE "commodityName" IS NOT NULL ORDER BY "commodityName";';
        const jobNosQuery = 'SELECT DISTINCT "jobNo" FROM public.inbounds WHERE "jobNo" IS NOT NULL ORDER BY "jobNo";';
        const exLMEWarehouseQuery = 'SELECT DISTINCT "exLmeWarehouseName" FROM public.exlmewarehouses WHERE "exLmeWarehouseName" IS NOT NULL ORDER BY "exLmeWarehouseName";';

        const [brands, shapes, commodities, jobNos, exlmewarehouse] = await Promise.all([
            db.sequelize.query(brandsQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(shapesQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(commoditiesQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(jobNosQuery, { type: db.sequelize.QueryTypes.SELECT }),
            db.sequelize.query(exLMEWarehouseQuery, { type: db.sequelize.QueryTypes.SELECT })
        ]);
        if (!brands || !shapes || !commodities || !jobNos || !exlmewarehouse) {
            throw new Error('Failed to fetch filter options');
        }

        return {
            brands: brands.map(item => item.brandName),
            shapes: shapes.map(item => item.shapeName),
            commodities: commodities.map(item => item.commodityName),
            jobNos: jobNos.map(item => item.jobNo),
            exLMEWarehouse: exlmewarehouse.map(item => item.exLmeWarehouseName)
        };
    } catch (error) {
        console.error('Error fetching filter options:', error);
        throw error;
    }
};


const getLotSummary = async (jobNo, lotNo) => {
    try {
        // Query 1: Get the details for the specific AVAILABLE lot you clicked on.
        // This query is back to its original form.
        const detailsQuery = `
            SELECT 
                i."jobNo" AS "JobNo", i."lotNo" AS "LotNo", i."noOfBundle" AS "NoOfBundle",
                i."inboundId", i."barcodeNo" AS "Barcode", c."commodityName" AS "Commodity", b."brandName" AS "Brand",
                s."shapeName" AS "Shape", exlme."exLmeWarehouseName" AS "ExLMEWarehouse",
                i."exWarehouseLot" AS "ExWarehouseLot", i."exWarehouseWarrant" AS "ExWarehouseWarrant",
                exwhl."exWarehouseLocationName" AS "ExWarehouseLocation", iw."inboundWarehouseName" AS "InboundWarehouse",
                i."inboundDate" AS "InboundDate", i."scheduleInboundDate" AS "ScheduleInboundDate",
                i."grossWeight" AS "GrossWeight", i."netWeight" AS "NetWeight", i."actualWeight" AS "ActualWeight",
                i."isRebundled" AS "IsRebundled", i."isRepackProvided" AS "IsRepackProvided",
                i."updatedAt" AS "UpdatedAt"
            FROM public.inbounds i
            LEFT JOIN public.outboundtransactions o ON o."inboundId" = i."inboundId"
            LEFT JOIN public.brands b ON b."brandId" = i."brandId"
            LEFT JOIN public.commodities c ON c."commodityId" = i."commodityId"
            LEFT JOIN public.shapes s ON s."shapeId" = i."shapeId"
            LEFT JOIN public.exlmewarehouses exlme ON exlme."exLmeWarehouseId" = i."exLmeWarehouseId"
            LEFT JOIN public.exwarehouselocations exwhl ON exwhl."exWarehouseLocationId" = i."exWarehouseLocationId"
            LEFT JOIN public.inboundwarehouses iw ON iw."inboundWarehouseId" = i."inboundWarehouseId"
            WHERE o."inboundId" IS NULL
              AND i."jobNo" = :jobNo
              AND i."lotNo" = :lotNo
            LIMIT 1;
        `;

        const lotDetailsResult = await db.sequelize.query(detailsQuery, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { jobNo, lotNo }
        });

        if (lotDetailsResult.length === 0) {
            // This can happen if the lot was already outbounded and the list view wasn't refreshed.
            // Or if we are looking up an already outbounded lot directly.
            // For now, we'll return null, but a more robust solution might fetch details anyway without the o."inboundId" IS NULL filter.
            return null;
        }

        const lotDetails = lotDetailsResult[0];

        // --- NEW OUTBOUND ACTIVITY QUERY ---
        // Extract the numeric part of the job number (e.g., "040" from "SINI040")
        const numericJobNo = lotDetails.JobNo.match(/\d+/);
        let outboundActivities = [];

        if (numericJobNo) {
            const jobNoPattern = `%${numericJobNo[0]}`; // Creates a pattern like '%040'

            // Query 2: Get all outbound transactions that match the numeric pattern
            const outboundQuery = `
                SELECT "jobNo", "lotNo", "createdAt"
                FROM public.outboundtransactions
                WHERE "jobNo" ILIKE :jobNoPattern
                ORDER BY "createdAt" DESC;
            `;

            outboundActivities = await db.sequelize.query(outboundQuery, {
                type: db.sequelize.QueryTypes.SELECT,
                replacements: { jobNoPattern }
            });
        }

        // Query 3: Get the lot counts
        const countsQuery = `
            SELECT 
              COUNT(*) AS "TotalCount",
              COUNT(CASE WHEN o."inboundId" IS NULL THEN 1 END) AS "AvailableCount"
            FROM public.inbounds i
            LEFT JOIN public.outboundtransactions o ON o."inboundId" = i."inboundId"
            WHERE i."jobNo" = :jobNo;
        `;
        const lotCountsResult = await db.sequelize.query(countsQuery, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: { jobNo: lotDetails.JobNo }
        });


        // Merge all results into a single object
        const finalResult = {
            ...lotDetails,
            ...lotCountsResult[0],
            "OutboundActivities": outboundActivities // Add the list of activities
        };

        return finalResult;

    } catch (error) {
        console.error('Error fetching lot summary records:', error);
        throw error;
    }
};

const getLotDetails = async (filters) => {
    try {
        let query = `
                SELECT 
                    i."inboundId" as id, 
                    i."jobNo" AS "JobNo",
                    i."lotNo" AS "LotNo",
                    i."exWarehouseLot" AS "Ex-WarehouseLot",
                    c."commodityName" AS "Metal",
                    b."brandName" AS "Brand",
                    s."shapeName" AS "Shape",
                    i."noOfBundle" AS "Qty",
                    i."netWeight" AS "Weight"
                FROM 
                    public.inbounds i
                JOIN 
                    public.commodities c ON i."commodityId" = c."commodityId"
                JOIN 
                    public.shapes s ON i."shapeId" = s."shapeId"
                LEFT JOIN 
                    public.brands b ON i."brandId" = b."brandId"
                LEFT JOIN 
                    public.outboundtransactions o ON o."inboundId" = i."inboundId"
            `;

        const replacements = {};
        let whereClauses = ['o."inboundId" IS NULL'];

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
        if (filters.brands && Array.isArray(filters.brands) && filters.brands.length > 0) {
            whereClauses.push('b."brandName" IN (:brands)');
            replacements.brands = filters.brands;
        }
        if (filters.exWarehouseLocation) {
            whereClauses.push('ewl."warehouseName" = :exWarehouseLocation');
            replacements.exWarehouseLocation = filters.exWarehouseLocation;
        }
        if (filters.exLMEWarehouse) {
            whereClauses.push('elme."warehouseName" = :exLMEWarehouse');
            replacements.exLMEWarehouse = filters.exLMEWarehouse;
        }
        if (filters.noOfBundle) {
            whereClauses.push('i."noOfBundle" = :noOfBundle');
            replacements.noOfBundle = parseInt(filters.noOfBundle, 10);
        }
        if (filters.inboundWarehouse) {
            whereClauses.push('iw."warehouseName" = :inboundWarehouse');
            replacements.inboundWarehouse = filters.inboundWarehouse;
        }
        if (filters.exWarehouseLot) {
            whereClauses.push('i."exWarehouseLot" ILIKE :exWarehouseLot');
            replacements.exWarehouseLot = `%${filters.exWarehouseLot}%`;
        }
        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        query += ' ORDER BY i."inboundId" LIMIT 100;';

        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT,
            replacements: replacements
        });
        return result;
    } catch (error) {
        console.error('Error fetching lot details:', error);
        throw error;
    }
};

const createScheduleOutbound = async (scheduleData) => {
    const t = await db.sequelize.transaction();

    try {
        const {
            releaseDate,
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

        const scheduleQuery = `
            INSERT INTO public.scheduleoutbounds(
            "releaseDate", "userId", "lotReleaseWeight", "outboundType", "exportDate", "stuffingDate", "containerNo", "sealNo", "createdAt", "updatedAt", "deliveryDate", "storageReleaseLocation", "releaseWarehouse", "transportVendor")
            VALUES (:releaseDate, :userId, :lotReleaseWeight, :outboundType, :exportDate, :stuffingDate, :containerNo, :sealNo, NOW(), NOW(), :deliveryDate, :storageReleaseLocation, :releaseWarehouse, :transportVendor)
            RETURNING "scheduleOutboundId";
        `;

        const scheduleResult = await db.sequelize.query(scheduleQuery, {
            replacements: {
                releaseDate,
                userId: 1, // Placeholder
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

        const scheduleOutboundId = scheduleResult[0][0].scheduleOutboundId;
        if (!scheduleOutboundId) {
            throw new Error("Failed to create schedule and get new ID.");
        }

        if (selectedLots && selectedLots.length > 0) {
            const selectedInboundsQuery = `
                INSERT INTO public.selectedinbounds(
                    "inboundId", "scheduleOutboundId", "lotNo", "jobNo", "createdAt", "updatedAt"
                ) VALUES (
                    :inboundId, :scheduleOutboundId, :lotNo, :jobNo, NOW(), NOW()
                );
            `;

            const updateInboundQuantityQuery = `
                UPDATE public.inbounds 
                SET "noOfBundle" = :quantity 
                WHERE "inboundId" = :inboundId;
            `;

            for (const lot of selectedLots) {
                const inboundId = lot.id;
                const quantity = lot.Qty; // Get quantity from lot object

                if (!inboundId) {
                    console.warn('Skipping lot: missing inboundId', lot);
                    continue;
                }

                const lotNoString = lot['Lot No']?.toString() ?? '';
                const lotNoParts = lotNoString.split('-');
                const jobNo = lotNoParts[0] || null;
                const lotNo = lotNoParts.length > 1 ? parseInt(lotNoParts[1], 10) : null;

                if (!jobNo || !Number.isInteger(lotNo)) {
                    console.warn(`Invalid Lot No format: "${lotNoString}"`);
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


                if (quantity !== undefined && quantity !== null) {
                    await db.sequelize.query(updateInboundQuantityQuery, {
                        replacements: {
                            quantity: quantity,
                            inboundId: inboundId
                        },
                        type: db.sequelize.QueryTypes.UPDATE,
                        transaction: t
                    });
                }
            }
        }

        await t.commit();
        return { success: true, message: 'Schedule created successfully.', scheduleOutboundId };

    } catch (error) {
        await t.rollback();
        console.error('Error in createScheduleOutbound transaction:', error);
        throw new Error('Failed to create outbound schedule due to a database error.');
    }
}

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

        if (setClauses.length === 0) {
            return { success: false, message: 'No valid fields to update.' };
        }

        const query = `
            UPDATE public.inbounds
            SET ${setClauses.join(', ')}, "updatedAt" = NOW()
            WHERE "inboundId" = :inboundId;
        `;

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


module.exports = {
    getAllStock,
    getLotDetails,
    getInventory,
    getFilterOptions,
    getLotSummary,
    createScheduleOutbound,
    EditInformation
};
