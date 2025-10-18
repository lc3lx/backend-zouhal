const { check, body } = require("express-validator");
const validatorMiddleware = require("../../middlewares/validatorMiddleware");

exports.getExchangeRateValidator = [
  check("id").isMongoId().withMessage("Invalid exchange rate id format"),
  validatorMiddleware,
];

exports.createExchangeRateValidator = [
  check("fromCurrency")
    .notEmpty()
    .withMessage("From currency is required")
    .isLength({ min: 3, max: 3 })
    .withMessage("Currency code must be 3 characters")
    .isAlpha()
    .withMessage("Currency code must contain only letters"),

  check("toCurrency")
    .notEmpty()
    .withMessage("To currency is required")
    .isLength({ min: 3, max: 3 })
    .withMessage("Currency code must be 3 characters")
    .isAlpha()
    .withMessage("Currency code must contain only letters"),

  check("rate")
    .notEmpty()
    .withMessage("Exchange rate is required")
    .isFloat({ min: 0 })
    .withMessage("Exchange rate must be a positive number"),

  body("fromCurrency").custom((val, { req }) => {
    if (
      val &&
      req.body.toCurrency &&
      val.toUpperCase() === req.body.toCurrency.toUpperCase()
    ) {
      throw new Error("From currency and to currency cannot be the same");
    }
    return true;
  }),

  validatorMiddleware,
];

exports.updateExchangeRateValidator = [
  check("id").isMongoId().withMessage("Invalid exchange rate id format"),

  body("rate")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Exchange rate must be a positive number"),

  validatorMiddleware,
];

exports.deleteExchangeRateValidator = [
  check("id").isMongoId().withMessage("Invalid exchange rate id format"),
  validatorMiddleware,
];
