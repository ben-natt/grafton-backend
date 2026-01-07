const { sequelize, DataTypes } = require("../database");

const models = {};

// Lot Model
models.Lot = sequelize.define(
  "Lot",
  {
    lotId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: "lotId",
    },
    jobNo: {
      type: DataTypes.STRING(16),
      field: "jobNo",
    },
    crewLotNo: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    netWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    grossWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    actualWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    exWarehouseLot: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    exWarehouseWarrant: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    expectedBundleCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    brand: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    commodity: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(50), // Use string instead of enum temporarily
      allowNull: true,
    },
    shape: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    exWarehouseLocation: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    exLmeWarehouse: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    inboundWarehouse: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    scheduleInboundId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    report: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isConfirm: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isWeighted: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    isRelabelled: {
      type: DataTypes.BOOLEAN,
      field: "isRelabelled",
    },
    isRebundled: {
      type: DataTypes.BOOLEAN,
      field: "isRebundled",
    },
    isRepackProvided: {
      type: DataTypes.BOOLEAN,
      field: "isRepackProvided",
    },
    noOfMetalStraps: {
      type: DataTypes.INTEGER,
      field: "noOfMetalStraps",
    },
    repackDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "repackDescription",
    },
    incompleteBundle: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    noOfPieces: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reportDuplicate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isDuplicated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    inbounddate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    stickerWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    crewLotNo: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "lot",
    timestamps: true,
    underscored: false,
    freezeTableName: true,
    name: {
      singular: "lot",
      plural: "lot",
    },
  }
);

// Inbound Model (same as before)
models.Inbound = sequelize.define(
  "Inbound",
  {
    inboundId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    jobNo: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    crewLotNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    noOfBundle: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    barcodeNo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    commodityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    shapeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    exLmeWarehouseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    exWarehouseWarrant: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    inboundWarehouseId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    grossWeight: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    netWeight: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    actualWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    isWeighted: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    isRelabelled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    isRebundled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    noOfMetalStraps: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isRepackProvided: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    repackDescription: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    brandId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    inboundDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    exWarehouseLot: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    scheduleInboundDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    exWarehouseLocationId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    processedId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    incompleteBundle: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    noOfPieces: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    stickerWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    crewLotNo: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "inbounds",
    timestamps: true,
  }
);

// InboundBundle Model (updated)
models.InboundBundle = sequelize.define(
  "InboundBundle",
  {
    inboundBundleId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    inboundId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "inbounds",
        key: "inboundId",
      },
    },
    lotId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "lot",
        key: "lotId",
      },
    },
    bundleNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    weight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    meltNo: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    isOutbounded: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isRelabelled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    isRebundled: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    isRepackProvided: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    noOfMetalStrap: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    repackDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    incompleteBundle: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    noOfPieces: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isDuplicated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    stickerWeight: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "inboundbundles",
    timestamps: true,
  }
);

// BeforeImage Model (updated)
models.BeforeImage = sequelize.define(
  "BeforeImage",
  {
    beforeImagesId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    inboundId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "inbounds",
        key: "inboundId",
      },
    },
    lotId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "lot",
        key: "lotId",
      },
    },
    imageUrl: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    inboundBundleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "inboundbundles",
        key: "inboundBundleId",
      },
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "beforeimages",
    timestamps: true,
  }
);

// AfterImage Model (updated)
models.AfterImage = sequelize.define(
  "AfterImage",
  {
    afterImagesId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    inboundId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "inbounds",
        key: "inboundId",
      },
    },
    lotId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "lot",
        key: "lotId",
      },
    },
    imageUrl: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    inboundBundleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "inboundbundles",
        key: "inboundBundleId",
      },
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "afterimages",
    timestamps: true,
  }
);

models.BundlePieces = sequelize.define(
  "BundlePieces",
  {
    pieceid: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bundleid: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "inboundbundles",
        key: "inboundBundleId",
      },
    },
    piecetype: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    createdat: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedat: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "bundle_pieces",
    timestamps: true,
    createdAt: "createdat",
    updatedAt: "updatedat",
  }
);

// Define Associations
models.Inbound.hasMany(models.InboundBundle, {
  foreignKey: "inboundId",
  as: "bundles",
});

models.Lot.hasMany(models.InboundBundle, {
  foreignKey: "lotId",
  as: "bundles",
});

models.InboundBundle.belongsTo(models.Inbound, {
  foreignKey: "inboundId",
  as: "inbound",
});

models.InboundBundle.belongsTo(models.Lot, {
  foreignKey: "lotId",
  as: "lot",
});

models.Inbound.hasMany(models.BeforeImage, {
  foreignKey: "inboundId",
  as: "beforeImages",
});

models.Lot.hasMany(models.BeforeImage, {
  foreignKey: "lotId",
  as: "beforeImages",
});

models.BeforeImage.belongsTo(models.Inbound, {
  foreignKey: "inboundId",
  as: "inbound",
});

models.BeforeImage.belongsTo(models.Lot, {
  foreignKey: "lotId",
  as: "lot",
});

models.Inbound.hasMany(models.AfterImage, {
  foreignKey: "inboundId",
  as: "afterImages",
});

models.Lot.hasMany(models.AfterImage, {
  foreignKey: "lotId",
  as: "afterImages",
});

models.AfterImage.belongsTo(models.Inbound, {
  foreignKey: "inboundId",
  as: "inbound",
});

models.AfterImage.belongsTo(models.Lot, {
  foreignKey: "lotId",
  as: "lot",
});

models.InboundBundle.hasMany(models.BeforeImage, {
  foreignKey: "inboundBundleId",
  as: "beforeImages",
});

models.BeforeImage.belongsTo(models.InboundBundle, {
  foreignKey: "inboundBundleId",
  as: "inboundBundle",
});

models.InboundBundle.hasMany(models.AfterImage, {
  foreignKey: "inboundBundleId",
  as: "afterImages",
});

models.AfterImage.belongsTo(models.InboundBundle, {
  foreignKey: "inboundBundleId",
  as: "inboundBundle",
});

models.InboundBundle.hasMany(models.BundlePieces, {
  foreignKey: "bundleid",
  as: "pieceEntries",
});

models.BundlePieces.belongsTo(models.InboundBundle, {
  foreignKey: "bundleid",
  as: "inboundBundle",
});

// Add sequelize instance to models
models.sequelize = sequelize;

module.exports = models;
