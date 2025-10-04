const express = require("express");
const {
  createCashOrder,
  createShamCashOrder,
  createWalletOrder,
  approveShamCashPayment,
  rejectShamCashPayment,
  getPendingShamCashPayments,
  findAllOrders,
  findSpecificOrder,
  filterOrderForLoggedUser,
  updateOrderToPaid,
  updateOrderToDelivered,
  checkoutSession,
} = require("../services/orderService");

const authService = require("../services/authService");

const router = express.Router();

router.use(authService.protect);

router.get(
  "/checkout-session/:cartId",
  authService.allowedTo("user"),
  checkoutSession
);

router.route("/:cartId").post(authService.allowedTo("user"), createCashOrder);

// ShamCash payment routes
router
  .route("/shamcash/:cartId")
  .post(authService.allowedTo("user"), createShamCashOrder);

// Wallet payment route
router
  .route("/wallet/:cartId")
  .post(authService.allowedTo("user"), createWalletOrder);
router.get(
  "/shamcash/pending",
  authService.allowedTo("admin", "manager"),
  getPendingShamCashPayments
);
router.put(
  "/:orderId/approve-payment",
  authService.allowedTo("admin", "manager"),
  approveShamCashPayment
);
router.put(
  "/:orderId/reject-payment",
  authService.allowedTo("admin", "manager"),
  rejectShamCashPayment
);

router.get(
  "/",
  authService.allowedTo("user", "admin", "manager"),
  filterOrderForLoggedUser,
  findAllOrders
);
router.get("/:id", findSpecificOrder);

router.put(
  "/:id/pay",
  authService.allowedTo("admin", "manager"),
  updateOrderToPaid
);
router.put(
  "/:id/deliver",
  authService.allowedTo("admin", "manager"),
  updateOrderToDelivered
);

module.exports = router;
