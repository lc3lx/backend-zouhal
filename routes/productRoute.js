const express = require("express");
const {
  getProductValidator,
  createProductValidator,
  updateProductValidator,
  deleteProductValidator,
} = require("../utils/validators/productValidator");

const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  resizeProductImages,
} = require("../services/productService");

const { scrapeProductFromUrl } = require("../services/productScraperService");
const authService = require("../services/authService");
const reviewsRoute = require("./reviewRoute");

const router = express.Router();

// POST   /products/jkshjhsdjh2332n/reviews
// GET    /products/jkshjhsdjh2332n/reviews
// GET    /products/jkshjhsdjh2332n/reviews/87487sfww3
router.use("/:productId/reviews", reviewsRoute);

router
  .route("/")
  .get(getProducts)
  .post(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    uploadProductImages,
    resizeProductImages,
    createProductValidator,
    createProduct
  );

// Route to scrape product data from URL
router.post(
  "/scrape",
  authService.protect,
  authService.allowedTo("admin", "manager"),
  async (req, res, next) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({
          status: "error",
          message: "الرابط مطلوب",
        });
      }

      const productData = await scrapeProductFromUrl(url);
      res.status(200).json({
        status: "success",
        data: productData,
      });
    } catch (error) {
      res.status(400).json({
        status: "error",
        message: error.message || "حدث خطأ أثناء استخراج البيانات",
      });
    }
  }
);
router
  .route("/:id")
  .get(getProductValidator, getProduct)
  .put(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    uploadProductImages,
    resizeProductImages,
    updateProductValidator,
    updateProduct
  )
  .delete(
    authService.protect,
    authService.allowedTo("admin"),
    deleteProductValidator,
    deleteProduct
  );

module.exports = router;
