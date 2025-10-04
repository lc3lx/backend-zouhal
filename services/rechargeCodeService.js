const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const RechargeCode = require("../models/rechargeCodeModel");
const factory = require("./handlersFactory");

// @desc    Create recharge codes (Admin only)
// @route   POST /api/v1/recharge-codes
// @access  Protected/Admin
exports.createRechargeCodes = asyncHandler(async (req, res, next) => {
  const { amount, count, description, expiresInDays } = req.body;

  if (!amount || !count) {
    return next(new ApiError("Amount and count are required", 400));
  }

  if (amount <= 0) {
    return next(new ApiError("Amount must be greater than 0", 400));
  }

  if (count <= 0 || count > 100) {
    return next(new ApiError("Count must be between 1 and 100", 400));
  }

  const codes = await RechargeCode.generateCodes(
    amount,
    count,
    req.user._id,
    description || `Recharge code for ${amount} USD`,
    expiresInDays || 30
  );

  res.status(201).json({
    status: "success",
    message: `${count} recharge codes created successfully`,
    data: codes,
  });
});

// @desc    Get all recharge codes (Admin only)
// @route   GET /api/v1/recharge-codes
// @access  Protected/Admin
exports.getAllRechargeCodes = asyncHandler(async (req, res, next) => {
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  // Build filter
  let filter = {};

  if (req.query.isUsed !== undefined) {
    filter.isUsed = req.query.isUsed === "true";
  }

  if (req.query.code) {
    filter.code = { $regex: req.query.code, $options: "i" };
  }

  const codes = await RechargeCode.find(filter)
    .populate("createdBy", "name email")
    .populate("usedBy", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const totalCodes = await RechargeCode.countDocuments(filter);

  res.status(200).json({
    status: "success",
    results: codes.length,
    paginationResult: {
      currentPage: page,
      limit,
      numberOfPages: Math.ceil(totalCodes / limit),
      next: page * limit < totalCodes ? page + 1 : null,
    },
    data: codes,
  });
});

// @desc    Get specific recharge code (Admin only)
// @route   GET /api/v1/recharge-codes/:id
// @access  Protected/Admin
exports.getRechargeCode = factory.getOne(RechargeCode, [
  { path: "createdBy", select: "name email" },
  { path: "usedBy", select: "name email" },
]);

// @desc    Delete recharge code (Admin only)
// @route   DELETE /api/v1/recharge-codes/:id
// @access  Protected/Admin
exports.deleteRechargeCode = asyncHandler(async (req, res, next) => {
  const code = await RechargeCode.findById(req.params.id);

  if (!code) {
    return next(new ApiError("Recharge code not found", 404));
  }

  // Don't allow deletion of used codes
  if (code.isUsed) {
    return next(new ApiError("Cannot delete a used recharge code", 400));
  }

  await RechargeCode.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: "success",
    message: "Recharge code deleted successfully",
  });
});

// @desc    Get recharge code statistics (Admin only)
// @route   GET /api/v1/recharge-codes/stats
// @access  Protected/Admin
exports.getRechargeCodeStats = asyncHandler(async (req, res, next) => {
  const stats = await RechargeCode.aggregate([
    {
      $group: {
        _id: null,
        totalCodes: { $sum: 1 },
        usedCodes: {
          $sum: { $cond: ["$isUsed", 1, 0] },
        },
        unusedCodes: {
          $sum: { $cond: ["$isUsed", 0, 1] },
        },
        totalValue: { $sum: "$amount" },
        usedValue: {
          $sum: { $cond: ["$isUsed", "$amount", 0] },
        },
        unusedValue: {
          $sum: { $cond: ["$isUsed", 0, "$amount"] },
        },
        expiredCodes: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $lt: ["$expiresAt", new Date()] },
                  { $eq: ["$isUsed", false] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const result = stats[0] || {
    totalCodes: 0,
    usedCodes: 0,
    unusedCodes: 0,
    totalValue: 0,
    usedValue: 0,
    unusedValue: 0,
    expiredCodes: 0,
  };

  res.status(200).json({
    status: "success",
    data: result,
  });
});

// @desc    Bulk delete unused recharge codes (Admin only)
// @route   DELETE /api/v1/recharge-codes/bulk-delete
// @access  Protected/Admin
exports.bulkDeleteUnusedCodes = asyncHandler(async (req, res, next) => {
  const result = await RechargeCode.deleteMany({
    isUsed: false,
    expiresAt: { $lt: new Date() },
  });

  res.status(200).json({
    status: "success",
    message: `${result.deletedCount} expired unused recharge codes deleted successfully`,
    data: {
      deletedCount: result.deletedCount,
    },
  });
});
