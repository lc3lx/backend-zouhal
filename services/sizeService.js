const asyncHandler = require("express-async-handler");
const factory = require("./handlersFactory");
const Size = require("../models/sizeModel");
const ApiError = require("../utils/apiError");

// @desc    Get list of sizes
// @route   GET /api/v1/sizes
// @access  Public
exports.getSizes = factory.getAll(Size);

// @desc    Get specific size by id
// @route   GET /api/v1/sizes/:id
// @access  Public
exports.getSize = factory.getOne(Size);

// @desc    Create size
// @route   POST  /api/v1/sizes
// @access  Private/Admin-Manager
exports.createSize = factory.createOne(Size);

// @desc    Update specific size
// @route   PUT /api/v1/sizes/:id
// @access  Private/Admin-Manager
exports.updateSize = factory.updateOne(Size);

// @desc    Delete specific size
// @route   DELETE /api/v1/sizes/:id
// @access  Private/Admin
exports.deleteSize = factory.deleteOne(Size);

// @desc    Get sizes by category
// @route   GET /api/v1/sizes/category/:categoryId
// @access  Public
exports.getSizesByCategory = asyncHandler(async (req, res, next) => {
  const { categoryId } = req.params;

  const sizes = await Size.find({
    $or: [
      { categoryIds: categoryId },
      { categoryIds: { $size: 0 } }, // Sizes without specific categories (available for all)
    ],
  }).select("-__v");

  res.status(200).json({
    results: sizes.length,
    data: sizes,
  });
});

// @desc    Get sizes by type
// @route   GET /api/v1/sizes/type/:type
// @access  Public
exports.getSizesByType = asyncHandler(async (req, res, next) => {
  const { type } = req.params;

  const sizes = await Size.find({ type }).select("-__v");

  res.status(200).json({
    results: sizes.length,
    data: sizes,
  });
});
