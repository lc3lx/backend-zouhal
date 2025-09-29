const express = require("express");
const {
  getOffers,
  getActiveOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
  toggleOfferStatus,
} = require("../services/offerService");
const { protect, allowedTo } = require("../services/authService");
const { uploadSingleImage } = require("../middlewares/uploadImageMiddleware");
const { resizeImage } = require("../utils/resizeImage");

const router = express.Router();

// Public routes
router.get("/", getOffers);
router.get("/active", getActiveOffers);
router.get("/:id", getOffer);

// Protected routes (Admin only)
router.use(protect, allowedTo("admin"));

router.post(
  "/",
  uploadSingleImage("image"),
  resizeImage("offers"),
  createOffer
);

router.put(
  "/:id",
  uploadSingleImage("image"),
  resizeImage("offers"),
  updateOffer
);

router.delete("/:id", deleteOffer);
router.patch("/:id/toggle", toggleOfferStatus);

module.exports = router;
