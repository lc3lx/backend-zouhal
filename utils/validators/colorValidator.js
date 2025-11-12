const { check, body } = require("express-validator");
const validatorMiddleware = require("../../middlewares/validatorMiddleware");

exports.getColorValidator = [
  check("id").isMongoId().withMessage("Invalid color id format"),
  validatorMiddleware,
];

exports.createColorValidator = [
  check("name")
    .notEmpty()
    .withMessage("Color name is required")
    .isLength({ min: 1 })
    .withMessage("Too short color name")
    .isLength({ max: 50 })
    .withMessage("Too long color name"),
  check("hex")
    .notEmpty()
    .withMessage("Color hex code is required")
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage("Invalid hex color code"),
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

exports.updateColorValidator = [
  check("id").isMongoId().withMessage("Invalid color id format"),
  body("name")
    .optional()
    .isLength({ min: 1 })
    .withMessage("Too short color name")
    .isLength({ max: 50 })
    .withMessage("Too long color name"),
  body("hex")
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage("Invalid hex color code"),
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

exports.deleteColorValidator = [
  check("id").isMongoId().withMessage("Invalid color id format"),
  validatorMiddleware,
];

exports.getColorsByCategoryValidator = [
  check("categoryId").isMongoId().withMessage("Invalid category id format"),
  validatorMiddleware,
];
