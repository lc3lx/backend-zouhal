const { check, body } = require("express-validator");
const ApiError = require("../apiError");

exports.createOfferValidator = [
  check("title")
    .notEmpty()
    .withMessage("Offer title is required")
    .isLength({ min: 3, max: 100 })
    .withMessage("Title must be between 3 and 100 characters"),

  check("description")
    .notEmpty()
    .withMessage("Offer description is required")
    .isLength({ min: 10, max: 200 })
    .withMessage("Description must be between 10 and 200 characters"),

  check("discount")
    .notEmpty()
    .withMessage("Offer discount is required")
    .isLength({ min: 1, max: 20 })
    .withMessage("Discount must be between 1 and 20 characters"),

  check("icon").notEmpty().withMessage("Offer icon is required"),

  check("image")
    .optional()
    .custom((value, { req }) => {
      if (!req.file && !value) {
        throw new Error("Offer image is required");
      }
      return true;
    }),

  check("color.primary")
    .notEmpty()
    .withMessage("Primary color is required")
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage("Primary color must be a valid hex color"),

  check("color.secondary")
    .notEmpty()
    .withMessage("Secondary color is required")
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage("Secondary color must be a valid hex color"),

  check("startDate")
    .notEmpty()
    .withMessage("Start date is required")
    .isISO8601()
    .withMessage("Start date must be a valid date")
    .custom((value) => {
      if (new Date(value) < new Date()) {
        throw new Error("Start date cannot be in the past");
      }
      return true;
    }),

  check("endDate")
    .notEmpty()
    .withMessage("End date is required")
    .isISO8601()
    .withMessage("End date must be a valid date")
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.startDate)) {
        throw new Error("End date must be after start date");
      }
      return true;
    }),

  check("priority")
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage("Priority must be between 0 and 100"),

  check("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean value"),
];

exports.updateOfferValidator = [
  check("title")
    .optional()
    .isLength({ min: 3, max: 100 })
    .withMessage("Title must be between 3 and 100 characters"),

  check("description")
    .optional()
    .isLength({ min: 10, max: 200 })
    .withMessage("Description must be between 10 and 200 characters"),

  check("discount")
    .optional()
    .isLength({ min: 1, max: 20 })
    .withMessage("Discount must be between 1 and 20 characters"),

  check("color.primary")
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage("Primary color must be a valid hex color"),

  check("color.secondary")
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage("Secondary color must be a valid hex color"),

  check("image")
    .optional()
    .custom((value, { req }) => {
      // Allow update without new image if existing offer has image
      return true;
    }),

  check("startDate")
    .optional()
    .isISO8601()
    .withMessage("Start date must be a valid date")
    .custom((value, { req }) => {
      if (value && new Date(value) < new Date()) {
        throw new Error("Start date cannot be in the past");
      }
      return true;
    }),

  check("endDate")
    .optional()
    .isISO8601()
    .withMessage("End date must be a valid date")
    .custom((value, { req }) => {
      if (
        value &&
        req.body.startDate &&
        new Date(value) <= new Date(req.body.startDate)
      ) {
        throw new Error("End date must be after start date");
      }
      return true;
    }),

  check("priority")
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage("Priority must be between 0 and 100"),

  check("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean value"),
];
