const express = require("express");

const {
  getColorValidator,
  createColorValidator,
  updateColorValidator,
  deleteColorValidator,
  getColorsByCategoryValidator,
} = require("../utils/validators/colorValidator");

const {
  getColors,
  getColor,
  createColor,
  updateColor,
  deleteColor,
  getColorsByCategory,
} = require("../services/colorService");

const authService = require("../services/authService");

const router = express.Router();

// Routes
router
  .route("/")
  .get(getColors)
  .post(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    createColorValidator,
    createColor
  );

router
  .route("/category/:categoryId")
  .get(getColorsByCategoryValidator, getColorsByCategory);

router
  .route("/:id")
  .get(getColorValidator, getColor)
  .put(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    updateColorValidator,
    updateColor
  )
  .delete(
    authService.protect,
    authService.allowedTo("admin"),
    deleteColorValidator,
    deleteColor
  );

module.exports = router;
