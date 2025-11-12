const express = require("express");

const {
  getSizeValidator,
  createSizeValidator,
  updateSizeValidator,
  deleteSizeValidator,
  getSizesByCategoryValidator,
  getSizesByTypeValidator,
} = require("../utils/validators/sizeValidator");

const {
  getSizes,
  getSize,
  createSize,
  updateSize,
  deleteSize,
  getSizesByCategory,
  getSizesByType,
} = require("../services/sizeService");

const authService = require("../services/authService");

const router = express.Router();

// Routes
router
  .route("/")
  .get(getSizes)
  .post(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    createSizeValidator,
    createSize
  );

router
  .route("/category/:categoryId")
  .get(getSizesByCategoryValidator, getSizesByCategory);

router.route("/type/:type").get(getSizesByTypeValidator, getSizesByType);

router
  .route("/:id")
  .get(getSizeValidator, getSize)
  .put(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    updateSizeValidator,
    updateSize
  )
  .delete(
    authService.protect,
    authService.allowedTo("admin"),
    deleteSizeValidator,
    deleteSize
  );

module.exports = router;
