module.exports = (sequelize, DataTypes) => {
  // Define ScheduleOutbound model
  const ScheduleOutbound = sequelize.define(
    "ScheduleOutbound",
    {
      scheduleOutboundId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        field: "scheduleOutboundId",
      },
      releaseDate: {
        type: DataTypes.DATE,
        allowNull: false,
        field: "releaseDate",
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "userId",
      },
      storageReleaseLocation: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: "storageReleaseLocation",
      },
      releaseWarehouse: {
        type: DataTypes.STRING(20),
        allowNull: false,
        field: "releaseWarehouse",
      },
      lotReleaseWeight: {
        type: DataTypes.DOUBLE,
        allowNull: false,
        field: "lotReleaseWeight",
      },
      transportVendor: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: "transportVendor",
      },
      outboundType: {
        type: DataTypes.ENUM("Flatbed", "Container"),
        allowNull: true,
        field: "outboundType",
      },
      exportDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "exportDate",
      },
      stuffingDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "stuffingDate",
      },
      containerNo: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "containerNo",
      },
      sealNo: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "sealNo",
      },
      tareWeight: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
        field: "tareWeight",
      },
      uom: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "uom",
      },
      deliveryDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "deliveryDate",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "createdAt",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updatedAt",
      },
    },
    {
      tableName: "scheduleoutbounds",
      timestamps: true,
      updatedAt: "updatedAt",
      createdAt: "createdAt",
    }
  );

  // Define StuffingPhotos model
  const StuffingPhotos = sequelize.define(
    "StuffingPhotos",
    {
      stuffingPhotoId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        field: "stuffingPhotoId",
      },
      scheduleOutboundId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "scheduleoutboundId",
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: false,
        field: "imageUrl",
      },
    },
    {
      tableName: "stuffing_photos",
      timestamps: true,
    }
  );

  // Define SelectedInbounds model
  const SelectedInbounds = sequelize.define(
    "SelectedInbounds",
    {
      selectedInboundId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        field: "selectedInboundId",
      },
      inboundId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "inboundId",
      },
      scheduleOutboundId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "scheduleOutboundId",
      },
      isOutbounded: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "isOutbounded",
      },
      lotNo: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "lotNo",
      },
      jobNo: {
        type: DataTypes.STRING(16),
        allowNull: true,
        field: "jobNo",
      },
      storageReleaseLocation: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "storageReleaseLocation",
      },
      releaseDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "releaseDate",
      },
      releaseEndDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "releaseEndDate",
      },
      // --- PER-LOT CONTAINER INFO ---
      containerNo: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "containerNo",
      },
      sealNo: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "sealNo",
      },
      tareWeight: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: true,
        field: "tareWeight",
      },
      uom: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "uom",
      },
      stuffingDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "stuffingDate",
      },
      exportDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "exportDate",
      },
      deliveryDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "deliveryDate",
      },
      // -----------------------------
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "createdAt",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updatedAt",
      },
    },
    {
      tableName: "selectedinbounds",
      timestamps: true,
      updatedAt: "updatedAt",
      createdAt: "createdAt",
    }
  );

  const Inbounds = sequelize.define(
    "Inbounds",
    {
      inboundId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        field: "inboundId",
      },
      jobNo: {
        type: DataTypes.STRING(16),
        allowNull: false,
        field: "jobNo",
      },
      lotNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "lotNo",
      },
      noOfBundle: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "noOfBundle",
      },
      barcodeNo: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "barcodeNo",
      },
      commodityId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "commodityId",
      },
      shapeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "shapeId",
      },
      exLmeWarehouseId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "exLmeWarehouseId",
      },
      exWarehouseWarrant: {
        type: DataTypes.STRING(20),
        allowNull: false,
        field: "exWarehouseWarrant",
      },
      inboundWarehouseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "inboundWarehouseId",
      },
      grossWeight: {
        type: DataTypes.DOUBLE,
        allowNull: false,
        field: "grossWeight",
      },
      netWeight: {
        type: DataTypes.DOUBLE,
        allowNull: false,
        field: "netWeight",
      },
      actualWeight: {
        type: DataTypes.DOUBLE,
        allowNull: true,
        field: "actualWeight",
      },
      isWeighted: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: "isWeighted",
      },
      isRelabelled: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: "isRelabelled",
      },
      isRebundled: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: "isRebundled",
      },
      noOfMetalStraps: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "noOfMetalStraps",
      },
      isRepackProvided: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        field: "isRepackProvided",
      },
      repackDescription: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "repackDescription",
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "userId",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "createdAt",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updatedAt",
      },
      brandId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "brandId",
      },
      inboundDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "inboundDate",
      },
      exWarehouseLot: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "exWarehouseLot",
      },
      crewLotNo: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "crewLotNo",
      },
    },
    {
      tableName: "inbounds",
      timestamps: true,
      updatedAt: "updatedAt",
      createdAt: "createdAt",
      indexes: [
        {
          unique: true,
          fields: ["jobNo", "lotNo"],
        },
      ],
    }
  );

  const Brand = sequelize.define(
    "Brand",
    {
      brandId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        field: "brandId",
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        field: "brandName",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "createdAt",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updatedAt",
      },
    },
    {
      tableName: "brands",
      timestamps: true,
    }
  );

  const Commodity = sequelize.define(
    "Commodity",
    {
      commodityId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        field: "commodityId",
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        field: "commodityName",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "createdAt",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updatedAt",
      },
    },
    {
      tableName: "commodities",
      timestamps: true,
    }
  );

  const Shape = sequelize.define(
    "Shape",
    {
      shapeId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        field: "shapeId",
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        field: "shapeName",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "createdAt",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updatedAt",
      },
    },
    {
      tableName: "shapes",
      timestamps: true,
    }
  );

  Inbounds.belongsTo(Brand, { foreignKey: "brandId", as: "brandDetails" });
  Inbounds.belongsTo(Commodity, {
    foreignKey: "commodityId",
    as: "commodityDetails",
  });
  Inbounds.belongsTo(Shape, { foreignKey: "shapeId", as: "shapeDetails" });

  const ScheduleInbound = sequelize.define(
    "ScheduleInbound",
    {
      jobNo: {
        type: DataTypes.STRING(16),
        primaryKey: true,
        allowNull: false,
        field: "jobNo",
      },
      inboundDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "inboundDate",
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "userId",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "createdAt",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updatedAt",
      },
    },
    {
      tableName: "scheduleinbounds",
      timestamps: true,
      updatedAt: "updatedAt",
      createdAt: "createdAt",
    }
  );

  const Lot = sequelize.define(
    "Lot",
    {
      jobNo: {
        type: DataTypes.STRING(16),
        primaryKey: true,
        allowNull: false,
        field: "jobNo",
      },
      lotNo: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        field: "lotNo",
      },
      netWeight: {
        type: DataTypes.DOUBLE,
        allowNull: true,
        field: "netWeight",
      },
      grossWeight: {
        type: DataTypes.DOUBLE,
        allowNull: true,
        field: "grossWeight",
      },
      actualWeight: {
        type: DataTypes.DOUBLE,
        allowNull: true,
        field: "actualWeight",
      },
      exWarehouseLot: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "exWarehouseLot",
      },
      exWarehouseWarrant: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "exWarehouseWarrant",
      },
      expectedBundleCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "expectedBundleCount",
      },
      status: {
        type: DataTypes.ENUM("pending", "completed", "cancelled", "outbounded"),
        allowNull: false,
        defaultValue: "pending",
      },
      brand: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "brand",
      },
      commodity: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "commodity",
      },
      shape: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "shape",
      },
      exWarehouseLocation: {
        type: DataTypes.STRING(30),
        allowNull: true,
        field: "exWarehouseLocation",
      },
      exLmeWarehouse: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "exLmeWarehouse",
      },
      inboundWarehouse: {
        type: DataTypes.STRING(20),
        allowNull: true,
        field: "inboundWarehouse",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "createdAt",
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: "updatedAt",
      },
    },
    {
      tableName: "lot",
      timestamps: true,
      updatedAt: "updatedAt",
      createdAt: "createdAt",
      indexes: [
        {
          unique: true,
          fields: ["jobNo", "lotNo"],
        },
      ],
    }
  );

  ScheduleOutbound.hasMany(SelectedInbounds, {
    foreignKey: "scheduleOutboundId",
    as: "selectedInbounds",
  });

  SelectedInbounds.belongsTo(ScheduleOutbound, {
    foreignKey: "scheduleOutboundId",
    as: "scheduleOutbound",
  });

  ScheduleOutbound.hasMany(StuffingPhotos, {
    foreignKey: "scheduleOutboundId",
    as: "stuffingPhotos",
  });
  StuffingPhotos.belongsTo(ScheduleOutbound, {
    foreignKey: "scheduleOutboundId",
  });

  SelectedInbounds.belongsTo(Inbounds, {
    foreignKey: "inboundId",
    targetKey: "inboundId",
    constraints: false,
    as: "masterInbound",
  });

  return {
    ScheduleOutbound,
    SelectedInbounds,
    StuffingPhotos,
    ScheduleInbound,
    Lot,
    Inbounds,
    Brand,
    Commodity,
    Shape,
  };
};