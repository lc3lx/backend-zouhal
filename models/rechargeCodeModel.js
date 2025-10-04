const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// كل كود شحن يمكن استخدامه مرة واحدة فقط
const rechargeCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4().substring(0, 8).toUpperCase(),
    },
    amount: {
      type: Number,
      required: [true, "Recharge amount is required"],
      min: [0.01, "Amount must be greater than 0"],
    },
    currency: {
      type: String,
      default: "USD",
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: [true, "Recharge code must be created by an admin"],
    },
    usedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    usedAt: Date,
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
    description: String,
  },
  { timestamps: true }
);

// Index for faster lookups
rechargeCodeSchema.index({ code: 1 });
rechargeCodeSchema.index({ expiresAt: 1 });

// Check if code is expired
rechargeCodeSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

// Check if code is valid for a specific user
rechargeCodeSchema.methods.isValidForUser = function (userId) {
  // الكود يمكن استخدامه مرة واحدة فقط بواسطة أي مستخدم
  return !this.isUsed && !this.isExpired();
};

// Check if code is valid (backward compatibility)
rechargeCodeSchema.methods.isValid = function () {
  return this.isValidForUser();
};

// Use the recharge code (يمكن استخدامه مرة واحدة فقط)
rechargeCodeSchema.methods.useCode = async function (userId) {
  if (this.isUsed) {
    throw new Error(
      "This recharge code has already been used and cannot be used again"
    );
  }

  if (this.isExpired()) {
    throw new Error("This recharge code has expired");
  }

  this.usedBy = userId;
  this.isUsed = true;
  this.usedAt = new Date();

  await this.save();
  return this;
};

// Generate multiple codes
rechargeCodeSchema.statics.generateCodes = async function (
  amount,
  count,
  createdBy,
  description = "",
  expiresInDays = 30
) {
  const codes = [];

  for (let i = 0; i < count; i += 1) {
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000
    );
    codes.push({
      amount,
      createdBy,
      description,
      expiresAt,
    });
  }

  return await this.insertMany(codes);
};

module.exports = mongoose.model("RechargeCode", rechargeCodeSchema);
