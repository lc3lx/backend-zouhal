const slugify = require("slugify");
const { check, body } = require("express-validator");
const validatorMiddleware = require("../../middlewares/validatorMiddleware");

exports.getStoreValidator = [
  check("id").isMongoId().withMessage("Invalid Store id format"),
  validatorMiddleware,
];

exports.createStoreValidator = [
  check("name")
    .notEmpty()
    .withMessage("Store name is required")
    .isLength({ min: 2 })
    .withMessage("Too short Store name")
    .isLength({ max: 100 })
    .withMessage("Too long Store name"),
  validatorMiddleware,
];

exports.updateStoreValidator = [
  check("id").isMongoId().withMessage("Invalid Store id format"),
  body("name")
    .optional()
    .isLength({ min: 2 })
    .withMessage("Too short Store name")
    .isLength({ max: 100 })
    .withMessage("Too long Store name"),
  validatorMiddleware,
];

exports.deleteStoreValidator = [
  check("id").isMongoId().withMessage("Invalid Store id format"),
  validatorMiddleware,
];

