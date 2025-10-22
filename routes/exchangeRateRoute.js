const express = require("express");

const {
  createExchangeRate,
  getExchangeRate,
  getExchangeRates,
  updateExchangeRate,
  deleteExchangeRate,
  getCurrentExchangeRate,
  convertPrice,
} = require("../services/exchangeRateService");
const { cacheMiddleware } = require("../utils/cache");

const {
  createExchangeRateValidator,
  getExchangeRateValidator,
  updateExchangeRateValidator,
  deleteExchangeRateValidator,
} = require("../utils/validators/exchangeRateValidator");

const authService = require("../services/authService");

const router = express.Router();

// Public routes
router.get("/current", cacheMiddleware(30), getCurrentExchangeRate);
router.get("/convert", cacheMiddleware(30), convertPrice);

// Protected routes
router.use(authService.protect);
router.use(authService.allowedTo("admin", "manager"));

router
  .route("/")
  .post(createExchangeRateValidator, createExchangeRate)
  .get(cacheMiddleware(30), getExchangeRates);

router
  .route("/:id")
  .get(getExchangeRateValidator, getExchangeRate)
  .put(updateExchangeRateValidator, updateExchangeRate)
  .delete(deleteExchangeRateValidator, deleteExchangeRate);

module.exports = router;
