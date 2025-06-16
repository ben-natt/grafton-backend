const db = require('../database');

const findJobNoPendingTasks = async () => {
    try {
        const query = `
            SELECT DISTINCT "jobNo" FROM public.lot
        `;
        const result = await db.sequelize.query(query, {
            type: db.sequelize.QueryTypes.SELECT
        });
        return result;
    } catch (error) {
        console.error('Error fetching pending tasks records:', error);
        throw error;
    }
};

const getDetailsPendingTasks = async (jobNo) => {
    try {
        const query = `
            SELECT "jobNo", "commodity", "expectedBundleCount", "brand", "status", "exWarehouseLot", "exLmeWarehouse" 
            FROM public.lot
            WHERE "jobNo" = :jobNo AND "status" = 'Pending'
            ORDER BY "exWarehouseLot" ASC
        `;
        const result = await db.sequelize.query(query, {
            replacements: { jobNo },
            type: db.sequelize.QueryTypes.SELECT
        });
        return result;
    } catch (error) {
        console.error('Error in /pending-tasks route:', error); 
        console.error('Error fetching pending tasks records:', error);
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
        type: db.sequelize.QueryTypes.SELECT
      });
  
      if (result.length === 0) {
        return {
          username: null,
          dateRange: null,
        };
      }
  
      const dates = result.map(r => new Date(r.inboundDate));
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
  
      let formattedRange;
  
      if (minDate.getTime() === maxDate.getTime()) {
        // Single date
        const day = minDate.getDate();
        const month = minDate.toLocaleString('en-SG', { month: 'long' });
        const year = minDate.getFullYear();
        formattedRange = `${day} ${month} ${year}`;
      } else {
        // Date range
        const minDay = minDate.getDate();
        const maxDay = maxDate.getDate();
        const minMonth = minDate.toLocaleString('en-SG', { month: 'long' });
        const maxMonth = maxDate.toLocaleString('en-SG', { month: 'long' });
        const minYear = minDate.getFullYear();
        const maxYear = maxDate.getFullYear();
  
        if (minYear === maxYear) {
          if (minMonth === maxMonth) {
            // Same month, same year
            formattedRange = `${minDay} ${minMonth} - ${maxDay} ${maxMonth} ${maxYear}`;
          } else {
            // Different month, same year
            formattedRange = `${minDay} ${minMonth} - ${maxDay} ${maxMonth} ${maxYear}`;
          }
        } else {
          // Different year
          formattedRange = `${minDay} ${minMonth} ${minYear} - ${maxDay} ${maxMonth} ${maxYear}`;
        }
      }
  
      return {
        username: result[0].username,
        dateRange: formattedRange,
      };
  
    } catch (error) {
      console.error('Error fetching pending tasks records:', error);
      throw error;
    }
  };
  
  

module.exports = {
    getDetailsPendingTasks,
    pendingTasksUserId,
    findJobNoPendingTasks
};
