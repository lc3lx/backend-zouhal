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

const {
  createExchangeRateValidator,
  getExchangeRateValidator,
  updateExchangeRateValidator,
  deleteExchangeRateValidator,
} = require("../utils/validators/exchangeRateValidator");

const authService = require("../services/authService");

const router = express.Router();

// Public routes
router.get("/current", getCurrentExchangeRate);
router.get("/convert", convertPrice);

// Protected routes
router.use(authService.protect);
router.use(authService.allowedTo("admin", "manager"));

router
  .route("/")
  .post(createExchangeRateValidator, createExchangeRate)
  .get(getExchangeRates);

router
  .route("/:id")
  .get(getExchangeRateValidator, getExchangeRate)
  .put(updateExchangeRateValidator, updateExchangeRate)
  .delete(deleteExchangeRateValidator, deleteExchangeRate);

module.exports = router;
