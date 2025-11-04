const asyncHandler = require("express-async-handler");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const factory = require("./handlersFactory");
const { uploadSingleImage } = require("../middlewares/uploadImageMiddleware");
const Store = require("../models/storeModel");
const ApiError = require("../utils/apiError");

// Upload single image
exports.uploadStoreImage = uploadSingleImage("logo");

// Image processing
exports.resizeImage = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next();
  }
  const filename = `store-${uuidv4()}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(600, 600)
    .toFormat("jpeg")
    .jpeg({ quality: 95 })
    .toFile(`uploads/stores/${filename}`);

  // Save image into our db
  req.body.logo = filename;

  next();
});

// @desc    Get list of stores
// @route   GET /api/v1/stores
// @access  Public
exports.getStores = factory.getAll(Store);

// @desc    Get specific store by id
// @route   GET /api/v1/stores/:id
// @access  Public
exports.getStore = factory.getOne(Store);

// @desc    Create store
// @route   POST  /api/v1/stores
// @access  Private
exports.createStore = factory.createOne(Store);

// @desc    Update specific store
// @route   PUT /api/v1/stores/:id
// @access  Private
exports.updateStore = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Get the existing store to check for old image
  const existingStore = await Store.findById(id);
  if (!existingStore) {
    return next(new ApiError(`No store found for this id ${id}`, 404));
  }

  // If updating with new image, delete old image
  if (req.body.logo && existingStore.logo) {
    const oldImagePath = path.join(
      __dirname,
      "../uploads/stores",
      existingStore.logo
    );
    if (fs.existsSync(oldImagePath)) {
      fs.unlinkSync(oldImagePath);
    }
  }

  const store = await Store.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  // Trigger save to apply post hooks
  await store.save();

  res.status(200).json({
    status: "success",
    data: store,
  });
});

// @desc    Delete specific store
// @route   DELETE /api/v1/stores/:id
// @access  Private
exports.deleteStore = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const store = await Store.findById(id);

  if (!store) {
    return next(new ApiError(`No store found for this id ${id}`, 404));
  }

  // Delete associated image file
  if (store.logo) {
    const imagePath = path.join(__dirname, "../uploads/stores", store.logo);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  await Store.findByIdAndDelete(id);

  res.status(204).json({
    status: "success",
    data: null,
  });
});

