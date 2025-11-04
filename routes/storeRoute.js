const express = require("express");
const {
  getStoreValidator,
  createStoreValidator,
  updateStoreValidator,
  deleteStoreValidator,
} = require("../utils/validators/storeValidator");

const authService = require("../services/authService");

const {
  getStores,
  getStore,
  createStore,
  updateStore,
  deleteStore,
  uploadStoreImage,
  resizeImage,
} = require("../services/storeService");

const router = express.Router();

router
  .route("/")
  .get(getStores)
  .post(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    uploadStoreImage,
    resizeImage,
    createStoreValidator,
    createStore
  );
router
  .route("/:id")
  .get(getStoreValidator, getStore)
  .put(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    uploadStoreImage,
    resizeImage,
    updateStoreValidator,
    updateStore
  )
  .delete(
    authService.protect,
    authService.allowedTo("admin"),
    deleteStoreValidator,
    deleteStore
  );

module.exports = router;

