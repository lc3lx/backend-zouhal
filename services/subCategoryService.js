const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const asyncHandler = require("express-async-handler");
const fs = require("fs");
const path = require("path");

const factory = require("./handlersFactory");
const { uploadSingleImage } = require("../middlewares/uploadImageMiddleware");
const SubCategory = require("../models/subCategoryModel");
const ApiError = require("../utils/apiError");

// Upload single image
exports.uploadSubCategoryImage = uploadSingleImage("image");

// Image processing
exports.resizeImage = asyncHandler(async (req, res, next) => {
  const filename = `subcategory-${uuidv4()}-${Date.now()}.jpeg`;

  if (req.file) {
    await sharp(req.file.buffer)
      .resize(600, 600)
      .toFormat("jpeg")
      .jpeg({ quality: 95 })
      .toFile(`uploads/subcategories/${filename}`);

    // Save image into our db
    req.body.image = filename;
  }

  next();
});

exports.setCategoryIdToBody = (req, res, next) => {
  // Nested route (Create)
  if (!req.body.category) req.body.category = req.params.categoryId;
  next();
};

// Nested route
// GET /api/v1/categories/:categoryId/subcategories
exports.createFilterObj = (req, res, next) => {
  let filterObject = {};
  if (req.params.categoryId) filterObject = { category: req.params.categoryId };
  req.filterObj = filterObject;
  next();
};

// @desc    Get list of subcategories
// @route   GET /api/v1/subcategories
// @access  Public
exports.getSubCategories = factory.getAll(SubCategory);

// @desc    Get specific subcategory by id
// @route   GET /api/v1/subcategories/:id
// @access  Public
exports.getSubCategory = factory.getOne(SubCategory);

// @desc    Create subCategory
// @route   POST  /api/v1/subcategories
// @access  Private
exports.createSubCategory = factory.createOne(SubCategory);

// @desc    Update specific subcategory
// @route   PUT /api/v1/subcategories/:id
// @access  Private
exports.updateSubCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Get the existing subcategory to check for old image
  const existingSubCategory = await SubCategory.findById(id);
  if (!existingSubCategory) {
    return next(new ApiError(`No subcategory found for this id ${id}`, 404));
  }

  // If updating with new image, delete old image
  if (req.body.image && existingSubCategory.image) {
    const oldImagePath = path.join(__dirname, "../uploads/subcategories", existingSubCategory.image);
    if (fs.existsSync(oldImagePath)) {
      fs.unlinkSync(oldImagePath);
    }
  }

  const subCategory = await SubCategory.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  // Trigger save to apply post hooks
  await subCategory.save();

  res.status(200).json({
    status: "success",
    data: subCategory,
  });
});

// @desc    Delete specific subCategory
// @route   DELETE /api/v1/subcategories/:id
// @access  Private
exports.deleteSubCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const subCategory = await SubCategory.findById(id);

  if (!subCategory) {
    return next(new ApiError(`No subcategory found for this id ${id}`, 404));
  }

  // Delete associated image file
  if (subCategory.image) {
    const imagePath = path.join(__dirname, "../uploads/subcategories", subCategory.image);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  await SubCategory.findByIdAndDelete(id);

  res.status(204).json({
    status: "success",
    data: null,
  });
});
