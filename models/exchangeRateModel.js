const mongoose = require("mongoose");

const exchangeRateSchema = new mongoose.Schema(
  {
    fromCurrency: {
      type: String,
      required: [true, "From currency is required"],
      uppercase: true,
      default: "USD",
    },
    toCurrency: {
      type: String,
      required: [true, "To currency is required"],
      uppercase: true,
      default: "SYP",
    },
    rate: {
      type: Number,
      required: [true, "Exchange rate is required"],
      min: [0, "Exchange rate must be positive"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Ensure only one active rate per currency pair
exchangeRateSchema.index(
  { fromCurrency: 1, toCurrency: 1, isActive: 1 },
  { unique: true }
);

module.exports = mongoose.model("ExchangeRate", exchangeRateSchema);
