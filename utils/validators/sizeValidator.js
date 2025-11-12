const { check, body } = require("express-validator");
const validatorMiddleware = require("../../middlewares/validatorMiddleware");

exports.getSizeValidator = [
  check("id").isMongoId().withMessage("Invalid size id format"),
  validatorMiddleware,
];

exports.createSizeValidator = [
  check("name")
    .notEmpty()
    .withMessage("Size name is required")
    .isLength({ min: 1 })
    .withMessage("Too short size name")
    .isLength({ max: 20 })
    .withMessage("Too long size name"),
  check("type")
    .optional()
    .isIn([
      "Clothing",
      "Shoes",
      "Rings",
      "Watches",
      "Bags",
      "Accessories",
      "Other",
    ])
    .withMessage("Invalid size type"),
  check("categoryIds")
    .optional()
    .isArray()
    .withMessage("categoryIds must be an array"),
  check("categoryIds.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid category id format"),
  validatorMiddleware,
];

exports.updateSizeValidator = [
  check("id").isMongoId().withMessage("Invalid size id format"),
  body("name")
    .optional()
    .isLength({ min: 1 })
    .withMessage("Too short size name")
    .isLength({ max: 20 })
    .withMessage("Too long size name"),
  body("type")
    .optional()
    .isIn([
      "Clothing",
      "Shoes",
      "Rings",
      "Watches",
      "Bags",
      "Accessories",
      "Other",
    ])
    .withMessage("Invalid size type"),
  body("categoryIds")
    .optional()
    .isArray()
    .withMessage("categoryIds must be an array"),
  body("categoryIds.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid category id format"),
  validatorMiddleware,
];

exports.deleteSizeValidator = [
  check("id").isMongoId().withMessage("Invalid size id format"),
  validatorMiddleware,
];

exports.getSizesByCategoryValidator = [
  check("categoryId").isMongoId().withMessage("Invalid category id format"),
  validatorMiddleware,
];

exports.getSizesByTypeValidator = [
  check("type")
    .isIn([
      "Clothing",
      "Shoes",
      "Rings",
      "Watches",
      "Bags",
      "Accessories",
      "Other",
    ])
    .withMessage("Invalid size type"),
  validatorMiddleware,
];
