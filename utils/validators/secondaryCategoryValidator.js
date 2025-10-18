const slugify = require("slugify");
const { check, body } = require("express-validator");
const validatorMiddleware = require("../../middlewares/validatorMiddleware");

exports.getSecondaryCategoryValidator = [
  check("id").isMongoId().withMessage("Invalid Secondary category id format"),
  validatorMiddleware,
];

exports.createSecondaryCategoryValidator = [
  check("name")
    .notEmpty()
    .withMessage("Secondary Category required")
    .isLength({ min: 3 })
    .withMessage("Too short Secondary Category name")
    .isLength({ max: 32 })
    .withMessage("Too long Secondary Category name")
    .custom((val, { req }) => {
      req.body.slug = slugify(val);
      return true;
    }),

  check("subCategory")
    .notEmpty()
    .withMessage("Secondary category must be belong to subcategory")
    .isMongoId()
    .withMessage("Invalid SubCategory id format"),

  check("category")
    .notEmpty()
    .withMessage("Secondary category must be belong to category")
    .isMongoId()
    .withMessage("Invalid Category id format"),

  validatorMiddleware,
];

exports.updateSecondaryCategoryValidator = [
  check("id").isMongoId().withMessage("Invalid Secondary category id format"),
  body("name")
    .optional()
    .custom((val, { req }) => {
      req.body.slug = slugify(val);
      return true;
    }),
  validatorMiddleware,
];

exports.deleteSecondaryCategoryValidator = [
  check("id").isMongoId().withMessage("Invalid Secondary category id format"),
  validatorMiddleware,
];
