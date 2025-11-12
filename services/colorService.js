const asyncHandler = require("express-async-handler");
const factory = require("./handlersFactory");
const Color = require("../models/colorModel");
const ApiError = require("../utils/apiError");

// @desc    Get list of colors
// @route   GET /api/v1/colors
// @access  Public
exports.getColors = factory.getAll(Color);

// @desc    Get specific color by id
// @route   GET /api/v1/colors/:id
// @access  Public
exports.getColor = factory.getOne(Color);

// @desc    Create color
// @route   POST  /api/v1/colors
// @access  Private/Admin-Manager
exports.createColor = factory.createOne(Color);

// @desc    Update specific color
// @route   PUT /api/v1/colors/:id
// @access  Private/Admin-Manager
exports.updateColor = factory.updateOne(Color);

// @desc    Delete specific color
// @route   DELETE /api/v1/colors/:id
// @access  Private/Admin
exports.deleteColor = factory.deleteOne(Color);

// @desc    Get colors by category
// @route   GET /api/v1/colors/category/:categoryId
// @access  Public
exports.getColorsByCategory = asyncHandler(async (req, res, next) => {
  const { categoryId } = req.params;

  const colors = await Color.find({
    $or: [
      { categoryIds: categoryId },
      { categoryIds: { $size: 0 } }, // Colors without specific categories (available for all)
    ],
  }).select("-__v");

  res.status(200).json({
    results: colors.length,
    data: colors,
  });
});
