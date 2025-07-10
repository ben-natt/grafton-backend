// models/schedule_outbound.model.js
module.exports = (sequelize, DataTypes) => {
  // Define ScheduleOutbound model
  const ScheduleOutbound = sequelize.define('ScheduleOutbound', {
    scheduleOutboundId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'scheduleOutboundId',
    },
    releaseDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'releaseDate',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'userId',
    },
    // Changed from ID to string as per updated schema
    storageReleaseLocation: { 
      type: DataTypes.STRING(20),
      allowNull: false, // Assuming it's NOT NULL as per updated schema
      field: 'storageReleaseLocation',
    },
    // Changed from ID to string as per updated schema
    releaseWarehouse: { 
      type: DataTypes.STRING(20),
      allowNull: false, // Assuming it's NOT NULL as per updated schema
      field: 'releaseWarehouse',
    },
    lotReleaseWeight: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      field: 'lotReleaseWeight',
    },
    // Changed from ID to string as per updated schema
    transportVendor: { 
      type: DataTypes.STRING(255),
      allowNull: false, // Assuming it's NOT NULL as per updated schema
      field: 'transportVendor',
    },
    outboundType: {
      type: DataTypes.ENUM('Flatbed','Container'), // Example enum values
      allowNull: true, // Assuming it can be null if not provided
      field: 'outboundType',
    },
    exportDate: {
      type: DataTypes.DATE,
      allowNull: true, 
      field: 'exportDate',
    },
    stuffingDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'stuffingDate',
    },
    containerNo: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'containerNo',
    },
    sealNo: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'sealNo',
    },
    deliveryDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deliveryDate',
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
    tableName: 'scheduleoutbounds',
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
  });

  // Define SelectedInbounds model
  const SelectedInbounds = sequelize.define('SelectedInbounds', {
    selectedInboundId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'selectedInboundId',
    },
    inboundId: { // This now refers to the primary key of the 'inbounds' table
      type: DataTypes.INTEGER, // Changed to INTEGER as per Inbounds_pkey
      allowNull: true, // Keeping as true as per provided schema
      field: 'inboundId',
    },
    scheduleOutboundId: { // Foreign key to ScheduleOutbound
      type: DataTypes.INTEGER,
      allowNull: true, // Keeping as true as per provided schema, though typically would be false for FK
      field: 'scheduleOutboundId',
    },
    isOutbounded: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'isOutbounded',
    },
    lotNo: { // Lot number from the original 'inbounds' table
      type: DataTypes.INTEGER,
      allowNull: true, // Can be null
      field: 'lotNo',
    },
    jobNo: { // Job number from the original 'inbounds' table
      type: DataTypes.STRING(16),
      allowNull: true, // Can be null
      field: 'jobNo',
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
    tableName: 'selectedinbounds',
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
  });

  // Define the Inbounds model (master record)
  const Inbounds = sequelize.define('Inbounds', {
    inboundId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'inboundId',
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
    noOfBundle: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'noOfBundle',
    },
    barcodeNo: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'barcodeNo',
    },
    commodityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'commodityId',
    },
    shapeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'shapeId',
    },
    exLmeWarehouseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'exLmeWarehouseId',
    },
    exWarehouseWarrant: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'exWarehouseWarrant',
    },
    inboundWarehouseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'inboundWarehouseId',
    },
    grossWeight: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      field: 'grossWeight',
    },
    netWeight: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      field: 'netWeight',
    },
    actualWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'actualWeight',
    },
    isWeighted: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'isWeighted',
    },
    isRelabelled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'isRelabelled',
    },
    isRebundled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'isRebundled',
    },
    noOfMetalStraps: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'noOfMetalStraps',
    },
    isRepackProvided: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: 'isRepackProvided',
    },
    repackDescription: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'repackDescription',
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
    brandId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'brandId',
    },
    inboundDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'inboundDate',
    },
    exWarehouseLot: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'exWarehouseLot',
    },
  }, {
    tableName: 'inbounds', // This is the actual table name
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
    // Add unique index on jobNo and lotNo if they form a composite unique key
    indexes: [
      {
        unique: true,
        fields: ['jobNo', 'lotNo']
      }
    ]
  });

  // Define new models for lookup tables: Brands, Commodities, Shapes
  const Brand = sequelize.define('Brand', {
    brandId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'brandId',
    },
    name: { // This will hold the 'brandName' from the DB
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'brandName', // Explicitly map to the 'brandName' column
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
    tableName: 'brands',
    timestamps: true,
  });

  const Commodity = sequelize.define('Commodity', {
    commodityId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'commodityId',
    },
    name: { // This will hold the 'commodityName' from the DB
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'commodityName', // Assuming your commodities table has 'commodityName'
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
    tableName: 'commodities',
    timestamps: true,
  });

  const Shape = sequelize.define('Shape', {
    shapeId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'shapeId',
    },
    name: { // This will hold the 'shapeName' from the DB
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'shapeName', // Assuming your shapes table has 'shapeName'
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
    tableName: 'shapes',
    timestamps: true,
  });

  // Define associations for Inbounds with the lookup tables
  Inbounds.belongsTo(Brand, { foreignKey: 'brandId', as: 'brandDetails' });
  Inbounds.belongsTo(Commodity, { foreignKey: 'commodityId', as: 'commodityDetails' });
  Inbounds.belongsTo(Shape, { foreignKey: 'shapeId', as: 'shapeDetails' });

  // Re-define ScheduleInbound and Lot models as they will be queried
  const ScheduleInbound = sequelize.define('ScheduleInbound', {
    jobNo: {
      type: DataTypes.STRING(16),
      primaryKey: true,
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
    tableName: 'scheduleinbounds', // Assuming this is the table name for ScheduleInbound
    timestamps: true,
    updatedAt: 'updatedAt',
    createdAt: 'createdAt',
  });

  const Lot = sequelize.define('Lot', {
    jobNo: {
      type: DataTypes.STRING(16),
      primaryKey: true,
      allowNull: false,
      field: 'jobNo',
    },
    lotNo: {
      type: DataTypes.INTEGER,
      primaryKey: true,
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
      type: DataTypes.ENUM('pending', 'completed', 'cancelled', 'outbounded'), // Added 'outbounded' status
      allowNull: false,
      defaultValue: 'pending',
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
    indexes: [
      {
        unique: true,
        fields: ['jobNo', 'lotNo']
      }
    ]
  });

  // Define associations for ScheduleOutbound and SelectedInbounds
  ScheduleOutbound.hasMany(SelectedInbounds, {
    foreignKey: 'scheduleOutboundId',
    as: 'selectedInbounds',
  });

  SelectedInbounds.belongsTo(ScheduleOutbound, {
    foreignKey: 'scheduleOutboundId',
    as: 'scheduleOutbound',
  });

  // Link SelectedInbounds to Inbounds (master record)
  SelectedInbounds.belongsTo(Inbounds, {
    foreignKey: 'inboundId', // This is the PK of the Inbounds table
    targetKey: 'inboundId',
    constraints: false, 
    as: 'masterInbound',
  });

  return { ScheduleOutbound, SelectedInbounds, ScheduleInbound, Lot, Inbounds, Brand, Commodity, Shape };
};
