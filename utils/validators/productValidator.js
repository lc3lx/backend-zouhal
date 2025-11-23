const slugify = require("slugify");
const { check, body } = require("express-validator");
const validatorMiddleware = require("../../middlewares/validatorMiddleware");
const Category = require("../../models/categoryModel");
const SubCategory = require("../../models/subCategoryModel");
const SecondaryCategory = require("../../models/secondaryCategoryModel");

exports.createProductValidator = [
  check("title")
    .isLength({ min: 3 })
    .withMessage("must be at least 3 chars")
    .notEmpty()
    .withMessage("Product required")
    .custom((val, { req }) => {
      req.body.slug = slugify(val);
      return true;
    }),
  check("description")
    .notEmpty()
    .withMessage("Product description is required")
    .isLength({ max: 2000 })
    .withMessage("Too long description"),
  check("quantity")
    .optional()

    .isNumeric()
    .withMessage("Product quantity must be a number"),
  check("sold")
    .optional()
    .isNumeric()
    .withMessage("Product quantity must be a number"),
  check("price")
    .notEmpty()
    .withMessage("Product price is required")
    .isNumeric()
    .withMessage("Product price must be a number")
    .isLength({ max: 32 })
    .withMessage("To long price"),
  check("priceAfterDiscount")
    .optional()
    .isNumeric()
    .withMessage("Product priceAfterDiscount must be a number")
    .toFloat()
    .custom((value, { req }) => {
      if (req.body.price <= value) {
        throw new Error("priceAfterDiscount must be lower than price");
      }
      return true;
    }),

  check("colors")
    .optional()
    .customSanitizer((val) => {
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return parsed;
        } catch (e) {
          return [val];
        }
      }
      return val;
    })
    .isArray()
    .withMessage("availableColors should be array of string"),
  check("imageCover").notEmpty().withMessage("Product imageCover is required"),
  check("images")
    .optional()
    .isArray()
    .withMessage("images should be array of string"),
  check("category")
    .notEmpty()
    .withMessage("Product must be belong to a category")
    .isMongoId()
    .withMessage("Invalid ID formate")
    .custom((categoryId) =>
      Category.findById(categoryId).then((category) => {
        if (!category) {
          return Promise.reject(
            new Error(`No category for this id: ${categoryId}`)
          );
        }
      })
    ),

  check("subcategories")
    .optional()
    .customSanitizer((val) => {
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return parsed;
        } catch (e) {
          return [val];
        }
      }
      return val;
    })
    .isArray()
    .withMessage("Subcategories must be an array of IDs"),
  check("subcategories.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid ID formate"),
  body("subcategories")
    .optional()
    .custom((subcategoriesIds) => {
      let arr = subcategoriesIds;
      if (typeof arr === "string") {
        try {
          arr = JSON.parse(arr);
        } catch (e) {
          arr = [arr];
        }
      }
      if (!Array.isArray(arr)) arr = [];
      return SubCategory.find({ _id: { $exists: true, $in: arr } }).then(
        (result) => {
          if (
            arr.length > 0 &&
            (result.length < 1 || result.length !== arr.length)
          ) {
            return Promise.reject(new Error(`Invalid subcategories Ids`));
          }
        }
      );
    })
    .custom((val, { req }) => {
      let target = val;
      if (typeof target === "string") {
        try {
          target = JSON.parse(target);
        } catch (e) {
          target = [target];
        }
      }
      if (!Array.isArray(target) || target.length === 0) return true;
      return SubCategory.find({ category: req.body.category }).then(
        (subcategories) => {
          const subCategoriesIdsInDB = [];
          subcategories.forEach((subCategory) => {
            subCategoriesIdsInDB.push(subCategory._id.toString());
          });
          // check if subcategories ids in db include subcategories in req.body (true)
          const checker = (t, arr) => t.every((v) => arr.includes(v));
          if (!checker(target, subCategoriesIdsInDB)) {
            return Promise.reject(
              new Error(`subcategories not belong to category`)
            );
          }
        }
      );
    }),

  // secondaryCategories: allow string JSON or single string, and validate IDs
  check("secondaryCategories")
    .optional()
    .customSanitizer((val) => {
      // Normalize to array of IDs
      if (Array.isArray(val)) {
        if (
          val.length === 1 &&
          typeof val[0] === "string" &&
          /^\s*\[/.test(val[0])
        ) {
          try {
            return JSON.parse(val[0]);
          } catch (e) {
            return val;
          }
        }
        return val;
      }
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return parsed;
        } catch (e) {
          return [val];
        }
      }
      return val;
    })
    .isArray()
    .withMessage("secondaryCategories must be an array of IDs"),
  check("secondaryCategories.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid ID formate"),
  body("secondaryCategories")
    .optional()
    .custom((ids) => {
      let arr = ids;
      if (typeof arr === "string") {
        try {
          arr = JSON.parse(arr);
        } catch (e) {
          arr = [arr];
        }
      } else if (
        Array.isArray(arr) &&
        arr.length === 1 &&
        typeof arr[0] === "string" &&
        /^\s*\[/.test(arr[0])
      ) {
        try {
          arr = JSON.parse(arr[0]);
        } catch (e) {
          // keep as-is
        }
      }
      if (!Array.isArray(arr) || arr.length === 0) return true;
      return SecondaryCategory.find({ _id: { $exists: true, $in: arr } }).then(
        (result) => {
          if (
            arr.length > 0 &&
            (result.length < 1 || result.length !== arr.length)
          ) {
            return Promise.reject(new Error(`Invalid secondaryCategories Ids`));
          }
        }
      );
    }),

  check("brand").optional().isMongoId().withMessage("Invalid ID formate"),
  check("store").optional().isMongoId().withMessage("Invalid Store ID format"),
  check("ratingsAverage")
    .optional()
    .isNumeric()
    .withMessage("ratingsAverage must be a number")
    .isLength({ min: 1 })
    .withMessage("Rating must be above or equal 1.0")
    .isLength({ max: 5 })
    .withMessage("Rating must be below or equal 5.0"),
  check("ratingsQuantity")
    .optional()
    .isNumeric()
    .withMessage("ratingsQuantity must be a number"),

  // New fields validation
  check("season")
    .optional()
    .isIn(["summer", "autumn", "spring", "winter"])
    .withMessage("Season must be one of: summer, autumn, spring, winter"),

  check("fabricType")
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage("Fabric type must be between 2 and 100 characters"),

  check("deliveryTime")
    .optional()
    .isLength({ min: 2, max: 200 })
    .withMessage("Delivery time must be between 2 and 200 characters"),

  check("deliveryStartDate")
    .optional()
    .isISO8601()
    .withMessage("Delivery start date must be a valid date")
    .toDate(),

  check("deliveryEndDate")
    .optional()
    .isISO8601()
    .withMessage("Delivery end date must be a valid date")
    .toDate()
    .custom((value, { req }) => {
      if (
        req.body.deliveryStartDate &&
        value < new Date(req.body.deliveryStartDate)
      ) {
        throw new Error("Delivery end date must be after start date");
      }
      return true;
    }),

  check("deliveryDays")
    .optional()
    .isNumeric()
    .withMessage("Delivery days must be a number")
    .isInt({ min: 0 })
    .withMessage("Delivery days must be a positive integer"),

  check("currency")
    .optional()
    .isIn(["USD", "SYP"])
    .withMessage("Currency must be either USD or SYP"),

  check("sizes")
    .optional()
    .customSanitizer((val) => {
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch (e) {
          return [];
        }
      }
      return val;
    })
    .isArray()
    .withMessage("Sizes should be array of objects"),

  validatorMiddleware,
];

exports.getProductValidator = [
  check("id").isMongoId().withMessage("Invalid ID formate"),
  validatorMiddleware,
];

exports.updateProductValidator = [
  check("id").isMongoId().withMessage("Invalid ID formate"),
  body("title")
    .optional()
    .custom((val, { req }) => {
      req.body.slug = slugify(val);
      return true;
    }),
  // Normalize subcategories if sent as JSON string
  check("subcategories")
    .optional()
    .customSanitizer((val) => {
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return parsed;
        } catch (e) {
          return [val];
        }
      }
      if (Array.isArray(val)) {
        if (
          val.length === 1 &&
          typeof val[0] === "string" &&
          /^\s*\[/.test(val[0])
        ) {
          try {
            return JSON.parse(val[0]);
          } catch (e) {
            return val;
          }
        }
        return val;
      }
      return val;
    })
    .isArray()
    .withMessage("Subcategories must be an array of IDs"),
  check("subcategories.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid ID formate"),
  // Normalize secondaryCategories if sent as JSON string
  check("secondaryCategories")
    .optional()
    .customSanitizer((val) => {
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return parsed;
        } catch (e) {
          return [val];
        }
      }
      if (Array.isArray(val)) {
        if (
          val.length === 1 &&
          typeof val[0] === "string" &&
          /^\s*\[/.test(val[0])
        ) {
          try {
            return JSON.parse(val[0]);
          } catch (e) {
            return val;
          }
        }
        return val;
      }
      return val;
    })
    .isArray()
    .withMessage("secondaryCategories must be an array of IDs"),
  check("secondaryCategories.*")
    .optional()
    .isMongoId()
    .withMessage("Invalid ID formate"),
  validatorMiddleware,
];

exports.deleteProductValidator = [
  check("id").isMongoId().withMessage("Invalid ID formate"),
  validatorMiddleware,
];
