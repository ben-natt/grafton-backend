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
        JOIN 
            public.commodities c ON i."commodityId" = c."commodityId"
        JOIN 
            public.shapes s ON i."shapeId" = s."shapeId"
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
				i."lotNo" AS "Lot No",
                c."commodityName" AS "Metal",
                b."brandName" AS "Brand",
                s."shapeName" AS "Shape",
                i."noOfBundle" AS "Qty", 
             	i."netWeight" AS "Weight"
            FROM 
                public.inbounds i 
            JOIN 
                public.brands b ON b."brandId" = i."brandId"
            JOIN 
                public.commodities c ON c."commodityId" = i."commodityId"
            JOIN 
                public.shapes s ON s."shapeId" = i."shapeId"
            ORDER BY 
                i."inboundId" limit 200
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
    getInventory
};