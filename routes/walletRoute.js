const express = require("express");
const {
  getUserWallet,
  createUserWallet,
  rechargeWallet,
  getWalletTransactions,
  checkWalletBalance,
  getAllWallets,
  getWalletByUserId,
  adjustWalletBalance,
} = require("../services/walletService");

const authService = require("../services/authService");

const router = express.Router();

// All routes require authentication
router.use(authService.protect);

// User routes
router.route("/").get(authService.allowedTo("user"), getUserWallet);
router.route("/create").post(authService.allowedTo("user"), createUserWallet);
router.route("/recharge").post(authService.allowedTo("user"), rechargeWallet);
router
  .route("/transactions")
  .get(authService.allowedTo("user"), getWalletTransactions);
router.route("/balance").get(authService.allowedTo("user"), checkWalletBalance);

// Admin routes
router
  .route("/admin/all")
  .get(authService.allowedTo("admin", "manager"), getAllWallets);
router
  .route("/admin/:userId")
  .get(authService.allowedTo("admin", "manager"), getWalletByUserId);
router
  .route("/admin/:userId/adjust")
  .put(authService.allowedTo("admin"), adjustWalletBalance);

module.exports = router;
