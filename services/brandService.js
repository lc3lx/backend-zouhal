const asyncHandler = require("express-async-handler");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const factory = require("./handlersFactory");
const { uploadSingleImage } = require("../middlewares/uploadImageMiddleware");
const Brand = require("../models/brandModel");
const ApiError = require("../utils/apiError");

// Upload single image
exports.uploadBrandImage = uploadSingleImage("image");

// Image processing
exports.resizeImage = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next();
  }
  const filename = `brand-${uuidv4()}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(600, 600)
    .toFormat("jpeg")
    .jpeg({ quality: 95 })
    .toFile(`uploads/brands/${filename}`);

  // Save image into our db
  req.body.image = filename;

  next();
});

// @desc    Get list of brands
// @route   GET /api/v1/brands
// @access  Public
exports.getBrands = factory.getAll(Brand);

// @desc    Get specific brand by id
// @route   GET /api/v1/brands/:id
// @access  Public
exports.getBrand = factory.getOne(Brand);

// @desc    Create brand
// @route   POST  /api/v1/brands
// @access  Private
exports.createBrand = factory.createOne(Brand);

// @desc    Update specific brand
// @route   PUT /api/v1/brands/:id
// @access  Private
exports.updateBrand = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Get the existing brand to check for old image
  const existingBrand = await Brand.findById(id);
  if (!existingBrand) {
    return next(new ApiError(`No brand found for this id ${id}`, 404));
  }

  // If updating with new image, delete old image
  if (req.body.image && existingBrand.image) {
    const oldImagePath = path.join(
      __dirname,
      "../uploads/brands",
      existingBrand.image
    );
    if (fs.existsSync(oldImagePath)) {
      fs.unlinkSync(oldImagePath);
    }
  }

  const brand = await Brand.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  // Trigger save to apply post hooks
  await brand.save();

  res.status(200).json({
    status: "success",
    data: brand,
  });
});

// @desc    Delete specific brand
// @route   DELETE /api/v1/brands/:id
// @access  Private
exports.deleteBrand = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const brand = await Brand.findById(id);

  if (!brand) {
    return next(new ApiError(`No brand found for this id ${id}`, 404));
  }

  // Delete associated image file
  if (brand.image) {
    const imagePath = path.join(__dirname, "../uploads/brands", brand.image);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  await Brand.findByIdAndDelete(id);

  res.status(204).json({
    status: "success",
    data: null,
  });
});
