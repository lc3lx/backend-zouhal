const asyncHandler = require("express-async-handler");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");

const { uploadAny } = require("../middlewares/uploadImageMiddleware");
const factory = require("./handlersFactory");
const Product = require("../models/productModel");

// Accept any files; we'll normalize and enforce limits inside the resize handler
exports.uploadProductImages = uploadAny();

exports.resizeProductImages = asyncHandler(async (req, res, next) => {
  // Normalize files whether multer provided an array (any()) or object (fields())
  let imageCoverFiles = [];
  let imagesFiles = [];
  let variantImageFiles = [];

  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach((f) => {
        if (f.fieldname === "imageCover") imageCoverFiles.push(f);
        else if (f.fieldname === "images") imagesFiles.push(f);
        else if (f.fieldname === "variantImages") variantImageFiles.push(f);
      });
    } else {
      imageCoverFiles = req.files.imageCover || [];
      imagesFiles = req.files.images || [];
      variantImageFiles = req.files.variantImages || [];
    }
  }

  // Enforce soft limits to mimic previous multer field limits
  if (imageCoverFiles.length > 1) imageCoverFiles = imageCoverFiles.slice(0, 1);
  if (imagesFiles.length > 10) imagesFiles = imagesFiles.slice(0, 10);
  if (variantImageFiles.length > 30)
    variantImageFiles = variantImageFiles.slice(0, 30);

  // 1- Image processing for imageCover
  if (imageCoverFiles.length > 0) {
    const imageCoverFileName = `product-${uuidv4()}-${Date.now()}-cover.jpeg`;

    await sharp(imageCoverFiles[0].buffer)
      .resize(2000, 1333)
      .toFormat("jpeg")
      .jpeg({ quality: 95 })
      .toFile(`uploads/products/${imageCoverFileName}`);

    // Save image into our db
    req.body.imageCover = imageCoverFileName;
  }

  // 2- Image processing for images
  if (imagesFiles.length > 0) {
    req.body.images = [];
    await Promise.all(
      imagesFiles.map(async (img, index) => {
        const imageName = `product-${uuidv4()}-${Date.now()}-${index + 1}.jpeg`;
        await sharp(img.buffer)
          .resize(2000, 1333)
          .toFormat("jpeg")
          .jpeg({ quality: 95 })
          .toFile(`uploads/products/${imageName}`);
        req.body.images.push(imageName);
      })
    );
  }

  // 3- Variant images and mapping to variants JSON
  if (variantImageFiles.length > 0) {
    const processedVariantImages = [];
    await Promise.all(
      variantImageFiles.map(async (img, index) => {
        const imageName = `product-${uuidv4()}-${Date.now()}-variant-${
          index + 1
        }.jpeg`;
        await sharp(img.buffer)
          .resize(600, 600, { fit: "inside", withoutEnlargement: true })
          .toFormat("jpeg")
          .jpeg({ quality: 95 })
          .toFile(`uploads/products/${imageName}`);
        processedVariantImages.push(imageName);
      })
    );

    // Parse variants JSON structure (if provided)
    if (req.body.variants && typeof req.body.variants === "string") {
      try {
        req.body.variants = JSON.parse(req.body.variants);
      } catch (e) {
        req.body.variants = [];
      }
    }
    if (!Array.isArray(req.body.variants)) req.body.variants = [];

    // variantImageMap indicates how many images per variant (JSON array)
    let imageMap = [];
    if (
      req.body.variantImageMap &&
      typeof req.body.variantImageMap === "string"
    ) {
      try {
        imageMap = JSON.parse(req.body.variantImageMap);
      } catch (e) {
        imageMap = [];
      }
    } else if (Array.isArray(req.body.variantImageMap)) {
      imageMap = req.body.variantImageMap;
    }

    if (
      req.body.variants.length > 0 &&
      imageMap.length === req.body.variants.length
    ) {
      let cursor = 0;
      req.body.variants = req.body.variants.map((v, i) => {
        const count = Number(imageMap[i]) || 0;
        const slice = processedVariantImages.slice(cursor, cursor + count);
        cursor += count;
        return {
          ...v,
          images: slice,
        };
      });
    }
  }

  // Normalize secondaryCategories if sent via multipart/form-data
  if (req.body && req.body.secondaryCategories !== undefined) {
    const val = req.body.secondaryCategories;
    if (Array.isArray(val)) {
      if (
        val.length === 1 &&
        typeof val[0] === "string" &&
        /^\s*\[/.test(val[0])
      ) {
        try {
          req.body.secondaryCategories = JSON.parse(val[0]);
        } catch (e) {
          // leave as-is
        }
      }
    } else if (typeof val === "string") {
      try {
        req.body.secondaryCategories = JSON.parse(val);
      } catch (e) {
        req.body.secondaryCategories = [val];
      }
    }
  }

  return next();
});

// @desc    Get list of products
// @route   GET /api/v1/products
// @access  Public
exports.getProducts = factory.getAll(Product, "Products");

// @desc    Get specific product by id
// @route   GET /api/v1/products/:id
// @access  Public
exports.getProduct = factory.getOne(Product, "reviews");

// @desc    Create product
// @route   POST  /api/v1/products
// @access  Private
exports.createProduct = factory.createOne(Product);
// @desc    Update specific product
// @route   PUT /api/v1/products/:id
// @access  Private
exports.updateProduct = factory.updateOne(Product);

// @desc    Delete specific product
// @route   DELETE /api/v1/products/:id
// @access  Private
exports.deleteProduct = factory.deleteOne(Product);
