const factory = require("./handlersFactory");
const SecondaryCategory = require("../models/secondaryCategoryModel");

exports.setSubCategoryIdToBody = (req, res, next) => {
  // Nested route (Create)
  if (!req.body.subCategory) req.body.subCategory = req.params.subCategoryId;
  next();
};

exports.setCategoryIdToBody = (req, res, next) => {
  // Nested route (Create)
  if (!req.body.category) req.body.category = req.params.categoryId;
  next();
};

// Nested route
// GET /api/v1/subcategories/:subCategoryId/secondary-categories
exports.createFilterObj = (req, res, next) => {
  let filterObject = {};
  if (req.params.subCategoryId)
    filterObject = { subCategory: req.params.subCategoryId };
  if (req.params.categoryId) filterObject = { category: req.params.categoryId };
  req.filterObj = filterObject;
  next();
};

// @desc    Get list of secondary categories
// @route   GET /api/v1/secondary-categories
// @access  Public
exports.getSecondaryCategories = factory.getAll(
  SecondaryCategory,
  "SecondaryCategory"
);

// @desc    Get specific secondary category by id
// @route   GET /api/v1/secondary-categories/:id
// @access  Public
exports.getSecondaryCategory = factory.getOne(
  SecondaryCategory,
  "subCategory category"
);

// @desc    Create secondary category
// @route   POST  /api/v1/secondary-categories
// @access  Private/Admin-Manager
exports.createSecondaryCategory = factory.createOne(SecondaryCategory);

// @desc    Update specific secondary category
// @route   PUT /api/v1/secondary-categories/:id
// @access  Private/Admin-Manager
exports.updateSecondaryCategory = factory.updateOne(SecondaryCategory);

// @desc    Delete specific secondary category
// @route   DELETE /api/v1/secondary-categories/:id
// @access  Private/Admin
exports.deleteSecondaryCategory = factory.deleteOne(SecondaryCategory);
