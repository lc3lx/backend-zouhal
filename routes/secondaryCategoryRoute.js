const express = require("express");

const {
  createSecondaryCategory,
  getSecondaryCategory,
  getSecondaryCategories,
  updateSecondaryCategory,
  deleteSecondaryCategory,
  setSubCategoryIdToBody,
  setCategoryIdToBody,
  createFilterObj,
  uploadSecondaryCategoryImage,
  resizeImage,
} = require("../services/secondaryCategoryService");

const {
  createSecondaryCategoryValidator,
  getSecondaryCategoryValidator,
  updateSecondaryCategoryValidator,
  deleteSecondaryCategoryValidator,
} = require("../utils/validators/secondaryCategoryValidator");

const authService = require("../services/authService");

// mergeParams: Allow us to access parameters on other routers
// ex: We need to access subCategoryId from subcategory router
const router = express.Router({ mergeParams: true });

router
  .route("/")
  .post(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    uploadSecondaryCategoryImage,
    resizeImage,
    setSubCategoryIdToBody,
    setCategoryIdToBody,
    createSecondaryCategoryValidator,
    createSecondaryCategory
  )
  .get(createFilterObj, getSecondaryCategories);

router
  .route("/:id")
  .get(getSecondaryCategoryValidator, getSecondaryCategory)
  .put(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    uploadSecondaryCategoryImage,
    resizeImage,
    updateSecondaryCategoryValidator,
    updateSecondaryCategory
  )
  .delete(
    authService.protect,
    authService.allowedTo("admin"),
    deleteSecondaryCategoryValidator,
    deleteSecondaryCategory
  );

module.exports = router;
