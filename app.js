const path = require("path");

const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const compression = require("compression");
const hpp = require("hpp");
const crypto = require("crypto");
const mongoose = require("mongoose");

dotenv.config();
const ApiError = require("./utils/apiError");
const globalError = require("./middlewares/errorMiddleware");
const dbConnection = require("./config/database");
// Routes
const mountRoutes = require("./routes");
const { webhookCheckout } = require("./services/orderService");

// Connect with db (skip if already connected in tests)
if (mongoose.connection.readyState === 0) {
  dbConnection();
}

// express app
const app = express();

// Enable other domains to access your application
app.use(cors());
app.options("*", cors());

// compress all responses
app.use(compression());

// Checkout webhook
app.post(
  "/webhook-checkout",
  express.raw({ type: "application/json" }),
  webhookCheckout
);

// Middlewares
app.use(express.json({ limit: "20kb" }));
// Serve static files from uploads under '/uploads' prefix
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Middleware to protect against HTTP Parameter Pollution attacks
app.use(
  hpp({
    whitelist: [
      "price",
      "sold",
      "quantity",
      "ratingsAverage",
      "ratingsQuantity",
    ],
  })
);

// Mount Routes
mountRoutes(app);

// Health check
app.get("/healthz", async (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 connected, 2 connecting, 0 disconnected
  res.set("Cache-Control", "no-store");
  return res.status(200).json({ status: "ok", db: dbState });
});

// Lightweight caching headers for public GETs
app.use((req, res, next) => {
  if (req.method === "GET" && req.path.startsWith("/api/v1/")) {
    // ETag using weak hash of URL + query
    const tag = crypto
      .createHash("md5")
      .update(`${req.path}|${JSON.stringify(req.query || {})}`)
      .digest("hex");
    res.set("ETag", `W/"${tag}"`);
    res.set("Cache-Control", "public, max-age=30, s-maxage=30");
  }
  next();
});

app.all("*", (req, res, next) => {
  next(new ApiError(`Can't find this route: ${req.originalUrl}`, 400));
});

// Global error handling middleware for express
app.use(globalError);

module.exports = app;
