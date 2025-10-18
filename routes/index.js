const categoryRoute = require("./categoryRoute");
const subCategoryRoute = require("./subCategoryRoute");
const secondaryCategoryRoute = require("./secondaryCategoryRoute");
const brandRoute = require("./brandRoute");
const productRoute = require("./productRoute");
const userRoute = require("./userRoute");
const authRoute = require("./authRoute");
const reviewRoute = require("./reviewRoute");
const wishlistRoute = require("./wishlistRoute");
const addressRoute = require("./addressRoute");
const couponRoute = require("./couponRoute");
const cartRoute = require("./cartRoute");
const orderRoute = require("./orderRoute");
const offerRoute = require("./offerRoute");
const walletRoute = require("./walletRoute");
const rechargeCodeRoute = require("./rechargeCodeRoute");
const exchangeRateRoute = require("./exchangeRateRoute");

const mountRoutes = (app) => {
  app.use("/api/v1/categories", categoryRoute);
  app.use("/api/v1/subcategories", subCategoryRoute);
  app.use("/api/v1/secondary-categories", secondaryCategoryRoute);
  app.use("/api/v1/brands", brandRoute);
  app.use("/api/v1/products", productRoute);
  app.use("/api/v1/users", userRoute);
  app.use("/api/v1/auth", authRoute);
  app.use("/api/v1/reviews", reviewRoute);
  app.use("/api/v1/wishlist", wishlistRoute);
  app.use("/api/v1/addresses", addressRoute);
  app.use("/api/v1/coupons", couponRoute);
  app.use("/api/v1/cart", cartRoute);
  app.use("/api/v1/orders", orderRoute);
  app.use("/api/v1/offers", offerRoute);
  app.use("/api/v1/wallet", walletRoute);
  app.use("/api/v1/recharge-codes", rechargeCodeRoute);
  app.use("/api/v1/exchange-rates", exchangeRateRoute);
};

module.exports = mountRoutes;
