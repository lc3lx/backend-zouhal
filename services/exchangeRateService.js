const factory = require("./handlersFactory");
const ExchangeRate = require("../models/exchangeRateModel");
const asyncHandler = require("express-async-handler");

// @desc    Get current exchange rate
// @route   GET /api/v1/exchange-rates/current
// @access  Public
exports.getCurrentExchangeRate = asyncHandler(async (req, res, next) => {
  const { from = "USD", to = "SYP" } = req.query;

  const exchangeRate = await ExchangeRate.findOne({
    fromCurrency: from.toUpperCase(),
    toCurrency: to.toUpperCase(),
    isActive: true,
  }).sort({ lastUpdated: -1 });

  if (!exchangeRate) {
    return res.status(404).json({
      status: "fail",
      message: `No active exchange rate found for ${from} to ${to}`,
    });
  }

  res.status(200).json({
    status: "success",
    data: {
      exchangeRate,
    },
  });
});

// @desc    Convert price between currencies
// @route   GET /api/v1/exchange-rates/convert
// @access  Public
exports.convertPrice = asyncHandler(async (req, res, next) => {
  const { amount, from = "USD", to = "SYP" } = req.query;

  if (!amount || isNaN(amount)) {
    return res.status(400).json({
      status: "fail",
      message: "Please provide a valid amount to convert",
    });
  }

  const exchangeRate = await ExchangeRate.findOne({
    fromCurrency: from.toUpperCase(),
    toCurrency: to.toUpperCase(),
    isActive: true,
  }).sort({ lastUpdated: -1 });

  if (!exchangeRate) {
    return res.status(404).json({
      status: "fail",
      message: `No active exchange rate found for ${from} to ${to}`,
    });
  }

  const convertedAmount = parseFloat(amount) * exchangeRate.rate;

  res.status(200).json({
    status: "success",
    data: {
      originalAmount: parseFloat(amount),
      originalCurrency: from.toUpperCase(),
      convertedAmount: Math.round(convertedAmount * 100) / 100,
      convertedCurrency: to.toUpperCase(),
      exchangeRate: exchangeRate.rate,
      lastUpdated: exchangeRate.lastUpdated,
    },
  });
});

// @desc    Get list of exchange rates
// @route   GET /api/v1/exchange-rates
// @access  Private/Admin
exports.getExchangeRates = factory.getAll(ExchangeRate);

// @desc    Get specific exchange rate by id
// @route   GET /api/v1/exchange-rates/:id
// @access  Private/Admin
exports.getExchangeRate = factory.getOne(ExchangeRate);

// @desc    Create exchange rate
// @route   POST /api/v1/exchange-rates
// @access  Private/Admin
exports.createExchangeRate = asyncHandler(async (req, res, next) => {
  const { fromCurrency, toCurrency, rate } = req.body;

  // Deactivate existing rate for this currency pair
  await ExchangeRate.updateMany(
    {
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
    },
    { isActive: false }
  );

  // Create new active rate
  const exchangeRate = await ExchangeRate.create({
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: toCurrency.toUpperCase(),
    rate,
    isActive: true,
    lastUpdated: new Date(),
  });

  res.status(201).json({
    status: "success",
    data: {
      exchangeRate,
    },
  });
});

// @desc    Update specific exchange rate
// @route   PUT /api/v1/exchange-rates/:id
// @access  Private/Admin
exports.updateExchangeRate = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { rate } = req.body;

  const exchangeRate = await ExchangeRate.findByIdAndUpdate(
    id,
    { rate, lastUpdated: new Date() },
    { new: true, runValidators: true }
  );

  if (!exchangeRate) {
    return res.status(404).json({
      status: "fail",
      message: "No exchange rate found with that ID",
    });
  }

  res.status(200).json({
    status: "success",
    data: {
      exchangeRate,
    },
  });
});

// @desc    Delete specific exchange rate
// @route   DELETE /api/v1/exchange-rates/:id
// @access  Private/Admin
exports.deleteExchangeRate = factory.deleteOne(ExchangeRate);
