const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Wallet = require("../models/walletModel");
const User = require("../models/userModel");
const RechargeCode = require("../models/rechargeCodeModel");

// @desc    Get user wallet
// @route   GET /api/v1/wallet
// @access  Protected/User
exports.getUserWallet = asyncHandler(async (req, res, next) => {
  const wallet = await Wallet.findOne({ user: req.user._id })
    .populate("user", "name email")
    .sort({ "transactions.createdAt": -1 });

  if (!wallet) {
    return next(new ApiError("Wallet not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: wallet,
  });
});

// @desc    Create wallet for user (called automatically)
// @route   POST /api/v1/wallet
// @access  Protected/User
exports.createUserWallet = asyncHandler(async (req, res, next) => {
  // Check if user already has a wallet
  const existingWallet = await Wallet.findOne({ user: req.user._id });
  if (existingWallet) {
    return next(new ApiError("User already has a wallet", 400));
  }

  const wallet = await Wallet.create({ user: req.user._id });

  // Update user with wallet reference
  await User.findByIdAndUpdate(req.user._id, { wallet: wallet._id });

  res.status(201).json({
    status: "success",
    data: wallet,
  });
});

// @desc    Recharge wallet using code
// @route   POST /api/v1/wallet/recharge
// @access  Protected/User
exports.rechargeWallet = asyncHandler(async (req, res, next) => {
  const { code } = req.body;

  if (!code) {
    return next(new ApiError("Recharge code is required", 400));
  }

  // Find the recharge code
  const rechargeCode = await RechargeCode.findOne({ code: code.toUpperCase() });

  if (!rechargeCode) {
    return next(new ApiError("Invalid recharge code", 400));
  }

  // Check if code is valid
  if (!rechargeCode.isValid()) {
    if (rechargeCode.isUsed) {
      return next(new ApiError("This code has already been used", 400));
    }
    if (rechargeCode.isExpired()) {
      return next(new ApiError("This code has expired", 400));
    }
  }

  // Get user wallet
  let wallet = await Wallet.findOne({ user: req.user._id });
  if (!wallet) {
    // Create wallet if it doesn't exist
    wallet = await Wallet.create({ user: req.user._id });
    await User.findByIdAndUpdate(req.user._id, { wallet: wallet._id });
  }

  // Use the recharge code
  await rechargeCode.useCode(req.user._id);

  // Add transaction to wallet
  await wallet.addTransaction(
    "recharge",
    rechargeCode.amount,
    `Wallet recharge using code: ${rechargeCode.code}`,
    null,
    rechargeCode._id
  );

  res.status(200).json({
    status: "success",
    message: `Wallet recharged successfully with ${rechargeCode.amount} USD`,
    data: {
      wallet,
      rechargedAmount: rechargeCode.amount,
    },
  });
});

// @desc    Get wallet transaction history
// @route   GET /api/v1/wallet/transactions
// @access  Protected/User
exports.getWalletTransactions = asyncHandler(async (req, res, next) => {
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  const wallet = await Wallet.findOne({ user: req.user._id });

  if (!wallet) {
    return next(new ApiError("Wallet not found", 404));
  }

  // Get transactions with pagination
  const transactions = wallet.transactions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(skip, skip + limit);

  const totalTransactions = wallet.transactions.length;

  res.status(200).json({
    status: "success",
    results: transactions.length,
    paginationResult: {
      currentPage: page,
      limit,
      numberOfPages: Math.ceil(totalTransactions / limit),
      next: page * limit < totalTransactions ? page + 1 : null,
    },
    data: transactions,
  });
});

// @desc    Check wallet balance
// @route   GET /api/v1/wallet/balance
// @access  Protected/User
exports.checkWalletBalance = asyncHandler(async (req, res, next) => {
  const wallet = await Wallet.findOne({ user: req.user._id });

  if (!wallet) {
    return next(new ApiError("Wallet not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      balance: wallet.balance,
      currency: wallet.currency,
    },
  });
});

// Admin functions

// @desc    Get all wallets (Admin only)
// @route   GET /api/v1/wallet/admin/all
// @access  Protected/Admin
exports.getAllWallets = asyncHandler(async (req, res, next) => {
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  const wallets = await Wallet.find()
    .populate("user", "name email phone")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalWallets = await Wallet.countDocuments();

  res.status(200).json({
    status: "success",
    results: wallets.length,
    paginationResult: {
      currentPage: page,
      limit,
      numberOfPages: Math.ceil(totalWallets / limit),
      next: page * limit < totalWallets ? page + 1 : null,
    },
    data: wallets,
  });
});

// @desc    Get wallet by user ID (Admin only)
// @route   GET /api/v1/wallet/admin/:userId
// @access  Protected/Admin
exports.getWalletByUserId = asyncHandler(async (req, res, next) => {
  const wallet = await Wallet.findOne({ user: req.params.userId })
    .populate("user", "name email phone")
    .populate("transactions.rechargeCode")
    .populate("transactions.orderId");

  if (!wallet) {
    return next(new ApiError("Wallet not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: wallet,
  });
});

// @desc    Adjust wallet balance (Admin only)
// @route   PUT /api/v1/wallet/admin/:userId/adjust
// @access  Protected/Admin
exports.adjustWalletBalance = asyncHandler(async (req, res, next) => {
  const { amount, type, description } = req.body;

  if (!amount || !type || !description) {
    return next(
      new ApiError("Amount, type, and description are required", 400)
    );
  }

  if (!["credit", "debit"].includes(type)) {
    return next(new ApiError("Type must be either credit or debit", 400));
  }

  const wallet = await Wallet.findOne({ user: req.params.userId });

  if (!wallet) {
    return next(new ApiError("Wallet not found", 404));
  }

  // Add transaction
  await wallet.addTransaction(type, amount, `Admin adjustment: ${description}`);

  res.status(200).json({
    status: "success",
    message: `Wallet ${type}ed successfully with ${amount} USD`,
    data: wallet,
  });
});
