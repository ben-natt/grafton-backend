
module.exports = (sequelize, DataTypes) => {
  const ScheduleInbound = sequelize.define('ScheduleInbound', {
    scheduleInboundId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'scheduleInboundId',
    },
    jobNo: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'jobNo',
    },
    inboundDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'inboundDate',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'userId',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'createdAt',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updatedAt',
    },
  }, {
    tableName: 'scheduleinbounds',
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
  });

  const Lot = sequelize.define('Lot', {
    lotId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'lotId',
    },
    jobNo: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'jobNo',
    },
    lotNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'lotNo',
    },
    netWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'netWeight',
    },
    grossWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'grossWeight',
    },
    actualWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'actualWeight',
    },
    exWarehouseLot: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'exWarehouseLot',
    },
    exWarehouseWarrant: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'exWarehouseWarrant',
    },
    expectedBundleCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'expectedBundleCount',
    },
    status: {
      type: DataTypes.ENUM('Pending', 'scheduled', 'processed'),
      allowNull: false,
      defaultValue: 'Pending',
      field: 'status',
    },
    brand: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'brand',
    },
    commodity: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'commodity',
    },
    shape: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'shape',
    },
    exWarehouseLocation: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'exWarehouseLocation',
    },
    exLmeWarehouse: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'exLmeWarehouse',
    },
    inboundWarehouse: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'inboundWarehouse',
    },
    scheduleInboundId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'scheduleInboundId',
      references: {
        model: 'scheduleinbounds',
        key: 'scheduleInboundId',
      },  
      onDelete: 'CASCADE',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'createdAt',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updatedAt',
    },
  }, {
    tableName: 'lot',
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
  });

  // Associations
  ScheduleInbound.hasMany(Lot, {
    foreignKey: 'scheduleInboundId',
    sourceKey: 'scheduleInboundId',
    as: 'lot',
    onDelete: 'CASCADE',
  });

  Lot.belongsTo(ScheduleInbound, {
    foreignKey: 'scheduleInboundId',
    targetKey: 'scheduleInboundId',
    as: 'scheduleInbound',
  });

  return { ScheduleInbound, Lot };
};
