const express = require("express");
const {
  createRechargeCodes,
  getAllRechargeCodes,
  getRechargeCode,
  deleteRechargeCode,
  getRechargeCodeStats,
  bulkDeleteUnusedCodes,
} = require("../services/rechargeCodeService");

const authService = require("../services/authService");

const router = express.Router();

// All routes require authentication and admin access
router.use(authService.protect);
router.use(authService.allowedTo("admin", "manager"));

router.route("/").get(getAllRechargeCodes).post(createRechargeCodes);

router.route("/stats").get(getRechargeCodeStats);
router.route("/bulk-delete").delete(bulkDeleteUnusedCodes);

router.route("/:id").get(getRechargeCode).delete(deleteRechargeCode);

module.exports = router;
