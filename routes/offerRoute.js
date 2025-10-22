const express = require("express");
const {
  getOffers,
  getActiveOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
  resizeImage,
  toggleOfferStatus,
} = require("../services/offerService");
const { cacheMiddleware } = require("../utils/cache");
const { protect, allowedTo } = require("../services/authService");
const { uploadSingleImage } = require("../middlewares/uploadImageMiddleware");
const {
  createOfferValidator,
  updateOfferValidator,
} = require("../utils/validators/offerValidator");
const validationMiddleware = require("../middlewares/validatorMiddleware");

const router = express.Router();

// Public routes
router.get("/", cacheMiddleware(60), getOffers);
router.get("/active", cacheMiddleware(60), getActiveOffers);
router.get("/:id", getOffer);

// Protected routes (Admin only)
router.use(protect, allowedTo("admin"));

router.post(
  "/",
  uploadSingleImage("image"),
  resizeImage,
  createOfferValidator,
  validationMiddleware,
  createOffer
);

router.put(
  "/:id",
  uploadSingleImage("image"),
  resizeImage,
  updateOfferValidator,
  validationMiddleware,
  updateOffer
);

router.delete("/:id", deleteOffer);
router.patch("/:id/toggle", toggleOfferStatus);

module.exports = router;
