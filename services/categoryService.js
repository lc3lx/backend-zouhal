const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');

const factory = require('./handlersFactory');
const { uploadSingleImage } = require('../middlewares/uploadImageMiddleware');
const Category = require('../models/categoryModel');
const ApiError = require('../utils/apiError');

// Upload single image
exports.uploadCategoryImage = uploadSingleImage('image');

// Image processing
exports.resizeImage = asyncHandler(async (req, res, next) => {
  const filename = `category-${uuidv4()}-${Date.now()}.jpeg`;

  if (req.file) {
    await sharp(req.file.buffer)
      .resize(600, 600)
      .toFormat('jpeg')
      .jpeg({ quality: 95 })
      .toFile(`uploads/categories/${filename}`);

    // Save image into our db
    req.body.image = filename;
  }

  next();
});

// @desc    Get list of categories
// @route   GET /api/v1/categories
// @access  Public
exports.getCategories = factory.getAll(Category);

// @desc    Get specific category by id
// @route   GET /api/v1/categories/:id
// @access  Public
exports.getCategory = factory.getOne(Category);

// @desc    Create category
// @route   POST  /api/v1/categories
// @access  Private/Admin-Manager
exports.createCategory = factory.createOne(Category);

// @desc    Update specific category
// @route   PUT /api/v1/categories/:id
// @access  Private/Admin-Manager
exports.updateCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Get the existing category to check for old image
  const existingCategory = await Category.findById(id);
  if (!existingCategory) {
    return next(new ApiError(`No category found for this id ${id}`, 404));
  }

  // If updating with new image, delete old image
  if (req.body.image && existingCategory.image) {
    const oldImagePath = path.join(__dirname, "../uploads/categories", existingCategory.image);
    if (fs.existsSync(oldImagePath)) {
      fs.unlinkSync(oldImagePath);
    }
  }

  const category = await Category.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  // Trigger save to apply post hooks
  await category.save();

  res.status(200).json({
    status: "success",
    data: category,
  });
});

// @desc    Delete specific category
// @route   DELETE /api/v1/categories/:id
// @access  Private/Admin
exports.deleteCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const category = await Category.findById(id);

  if (!category) {
    return next(new ApiError(`No category found for this id ${id}`, 404));
  }

  // Delete associated image file
  if (category.image) {
    const imagePath = path.join(__dirname, "../uploads/categories", category.image);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  await Category.findByIdAndDelete(id);

  res.status(204).json({
    status: "success",
    data: null,
  });
});
