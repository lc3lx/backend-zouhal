const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: [true, "Wallet must belong to a user"],
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, "Wallet balance cannot be negative"],
    },
    currency: {
      type: String,
      default: "USD",
    },
    transactions: [
      {
        type: {
          type: String,
          enum: ["credit", "debit", "refund", "recharge"],
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        orderId: {
          type: mongoose.Schema.ObjectId,
          ref: "Order",
        },
        rechargeCode: {
          type: mongoose.Schema.ObjectId,
          ref: "RechargeCode",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Create wallet for user automatically
walletSchema.statics.createWalletForUser = async function (userId) {
  const wallet = await this.create({ user: userId });
  return wallet;
};

// Add transaction to wallet
walletSchema.methods.addTransaction = async function (
  type,
  amount,
  description,
  orderId = null,
  rechargeCode = null
) {
  this.transactions.push({
    type,
    amount,
    description,
    orderId,
    rechargeCode,
  });

  if (type === "credit" || type === "recharge") {
    this.balance += amount;
  } else if (type === "debit") {
    this.balance -= amount;
  }

  await this.save();
  return this;
};

// Check if user has sufficient balance
walletSchema.methods.hasSufficientBalance = function (amount) {
  return this.balance >= amount;
};

module.exports = mongoose.model("Wallet", walletSchema);
