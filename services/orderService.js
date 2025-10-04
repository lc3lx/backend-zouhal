const stripe = require("stripe")(process.env.STRIPE_SECRET);
const asyncHandler = require("express-async-handler");
const factory = require("./handlersFactory");
const ApiError = require("../utils/apiError");

const User = require("../models/userModel");
const Product = require("../models/productModel");
const Cart = require("../models/cartModel");
const Order = require("../models/orderModel");
const Wallet = require("../models/walletModel");

// @desc    create cash order
// @route   POST /api/v1/orders/cartId
// @access  Protected/User
exports.createCashOrder = asyncHandler(async (req, res, next) => {
  // app settings
  const taxPrice = 0;
  const shippingPrice = 0;
  const deliveryFee = 2; // 2 USD delivery fee for cash on delivery

  // 1) Get cart depend on cartId
  const cart = await Cart.findById(req.params.cartId);
  if (!cart) {
    return next(
      new ApiError(`There is no such cart with id ${req.params.cartId}`, 404)
    );
  }

  // 2) Get order price depend on cart price "Check if coupon apply"
  const cartPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalCartPrice;

  const totalOrderPrice = cartPrice + taxPrice + shippingPrice + deliveryFee;

  // 3) Create order with default paymentMethodType cash
  const order = await Order.create({
    user: req.user._id,
    cartItems: cart.cartItems,
    shippingAddress: req.body.shippingAddress,
    totalOrderPrice,
    deliveryFee,
    paymentMethodType: "cash",
  });

  // 4) After creating order, decrement product quantity, increment product sold
  if (order) {
    const bulkOption = cart.cartItems.map((item) => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { quantity: -item.quantity, sold: +item.quantity } },
      },
    }));
    await Product.bulkWrite(bulkOption, {});

    // 5) Clear cart depend on cartId
    await Cart.findByIdAndDelete(req.params.cartId);
  }

  res.status(201).json({
    status: "success",
    message: "تم إنشاء الطلب بنجاح. رسوم التوصيل: 2 دولار",
    data: order,
  });
});

// @desc    create ShamCash order
// @route   POST /api/v1/orders/shamcash/:cartId
// @access  Protected/User
exports.createShamCashOrder = asyncHandler(async (req, res, next) => {
  const { phoneNumber, transactionId } = req.body;

  if (!phoneNumber || !transactionId) {
    return next(
      new ApiError(
        "Phone number and transaction ID are required for ShamCash payment",
        400
      )
    );
  }

  // app settings
  const taxPrice = 0;
  const shippingPrice = 0;
  const deliveryFee = 0; // No delivery fee for ShamCash

  // 1) Get cart depend on cartId
  const cart = await Cart.findById(req.params.cartId);
  if (!cart) {
    return next(
      new ApiError(`There is no such cart with id ${req.params.cartId}`, 404)
    );
  }

  // 2) Get order price depend on cart price "Check if coupon apply"
  const cartPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalCartPrice;

  const totalOrderPrice = cartPrice + taxPrice + shippingPrice + deliveryFee;

  // 3) Create order with ShamCash payment method
  const order = await Order.create({
    user: req.user._id,
    cartItems: cart.cartItems,
    shippingAddress: req.body.shippingAddress,
    totalOrderPrice,
    deliveryFee,
    paymentMethodType: "shamcash",
    shamCashDetails: {
      phoneNumber,
      transactionId,
      amount: totalOrderPrice,
    },
    paymentStatus: "pending",
  });

  // 4) After creating order, decrement product quantity, increment product sold
  if (order) {
    const bulkOption = cart.cartItems.map((item) => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { quantity: -item.quantity, sold: +item.quantity } },
      },
    }));
    await Product.bulkWrite(bulkOption, {});

    // 5) Clear cart depend on cartId
    await Cart.findByIdAndDelete(req.params.cartId);
  }

  res.status(201).json({
    status: "success",
    message: "تم إرسال طلب الدفع عبر شام كاش. في انتظار موافقة الإدارة.",
    data: order,
  });
});

// @desc    create wallet order
// @route   POST /api/v1/orders/wallet/:cartId
// @access  Protected/User
exports.createWalletOrder = asyncHandler(async (req, res, next) => {
  // app settings
  const taxPrice = 0;
  const shippingPrice = 0;
  const deliveryFee = 0; // No delivery fee for wallet payment

  // 1) Get cart depend on cartId
  const cart = await Cart.findById(req.params.cartId);
  if (!cart) {
    return next(
      new ApiError(`There is no such cart with id ${req.params.cartId}`, 404)
    );
  }

  // 2) Get order price depend on cart price "Check if coupon apply"
  const cartPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalCartPrice;

  const totalOrderPrice = cartPrice + taxPrice + shippingPrice + deliveryFee;

  // 3) Get user wallet
  const wallet = await Wallet.findOne({ user: req.user._id });
  if (!wallet) {
    return next(
      new ApiError(
        "لم يتم العثور على محفظة لهذا المستخدم. يرجى إنشاء محفظة أولاً",
        404
      )
    );
  }

  // 4) Check if wallet has sufficient balance
  if (!wallet.hasSufficientBalance(totalOrderPrice)) {
    return next(
      new ApiError(
        `رصيد المحفظة غير كافٍ. الرصيد الحالي: ${wallet.balance} دولار، المبلغ المطلوب: ${totalOrderPrice} دولار`,
        400
      )
    );
  }

  // 5) Create order with wallet payment method
  const order = await Order.create({
    user: req.user._id,
    cartItems: cart.cartItems,
    shippingAddress: req.body.shippingAddress,
    totalOrderPrice,
    deliveryFee,
    paymentMethodType: "wallet",
    isPaid: true,
    paidAt: Date.now(),
  });

  // 6) After creating order, decrement product quantity, increment product sold
  if (order) {
    const bulkOption = cart.cartItems.map((item) => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { quantity: -item.quantity, sold: +item.quantity } },
      },
    }));
    await Product.bulkWrite(bulkOption, {});

    // 7) Deduct amount from wallet
    await wallet.addTransaction(
      "debit",
      totalOrderPrice,
      `Payment for order #${order._id}`,
      order._id
    );

    // 8) Clear cart depend on cartId
    await Cart.findByIdAndDelete(req.params.cartId);
  }

  res.status(201).json({
    status: "success",
    message: "تم إنشاء الطلب ودفع المبلغ من المحفظة بنجاح",
    data: order,
  });
});

// @desc    approve ShamCash payment
// @route   PUT /api/v1/orders/:orderId/approve-payment
// @access  Protected/Admin
exports.approveShamCashPayment = asyncHandler(async (req, res, next) => {
  const { adminNotes } = req.body;

  const order = await Order.findById(req.params.orderId);
  if (!order) {
    return next(new ApiError("Order not found", 404));
  }

  if (order.paymentMethodType !== "shamcash") {
    return next(new ApiError("This order is not a ShamCash payment", 400));
  }

  order.paymentStatus = "approved";
  order.isPaid = true;
  order.paidAt = Date.now();
  order.adminNotes = adminNotes || "";

  await order.save();

  res.status(200).json({
    status: "success",
    message: "تم الموافقة على الدفع بنجاح",
    data: order,
  });
});

// @desc    reject ShamCash payment
// @route   PUT /api/v1/orders/:orderId/reject-payment
// @access  Protected/Admin
exports.rejectShamCashPayment = asyncHandler(async (req, res, next) => {
  const { adminNotes } = req.body;

  const order = await Order.findById(req.params.orderId);
  if (!order) {
    return next(new ApiError("Order not found", 404));
  }

  if (order.paymentMethodType !== "shamcash") {
    return next(new ApiError("This order is not a ShamCash payment", 400));
  }

  order.paymentStatus = "rejected";
  order.adminNotes = adminNotes || "";

  await order.save();

  // Return products to inventory
  const bulkOption = order.cartItems.map((item) => ({
    updateOne: {
      filter: { _id: item.product },
      update: { $inc: { quantity: +item.quantity, sold: -item.quantity } },
    },
  }));
  await Product.bulkWrite(bulkOption, {});

  res.status(200).json({
    status: "success",
    message: "تم رفض الدفع",
    data: order,
  });
});

// @desc    Get pending ShamCash payments
// @route   GET /api/v1/orders/shamcash/pending
// @access  Protected/Admin
exports.getPendingShamCashPayments = asyncHandler(async (req, res) => {
  const pendingOrders = await Order.find({
    paymentMethodType: "shamcash",
    paymentStatus: "pending",
  })
    .populate("user", "name email phone")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: pendingOrders.length,
    data: pendingOrders,
  });
});

exports.filterOrderForLoggedUser = asyncHandler(async (req, res, next) => {
  if (req.user.role === "user") req.filterObj = { user: req.user._id };
  next();
});
// @desc    Get all orders
// @route   POST /api/v1/orders
// @access  Protected/User-Admin-Manager
exports.findAllOrders = factory.getAll(Order);

// @desc    Get all orders
// @route   POST /api/v1/orders
// @access  Protected/User-Admin-Manager
exports.findSpecificOrder = factory.getOne(Order);

// @desc    Update order paid status to paid
// @route   PUT /api/v1/orders/:id/pay
// @access  Protected/Admin-Manager
exports.updateOrderToPaid = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(
      new ApiError(
        `There is no such a order with this id:${req.params.id}`,
        404
      )
    );
  }

  // update order to paid
  order.isPaid = true;
  order.paidAt = Date.now();

  const updatedOrder = await order.save();

  res.status(200).json({ status: "success", data: updatedOrder });
});

// @desc    Update order delivered status
// @route   PUT /api/v1/orders/:id/deliver
// @access  Protected/Admin-Manager
exports.updateOrderToDelivered = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    return next(
      new ApiError(
        `There is no such a order with this id:${req.params.id}`,
        404
      )
    );
  }

  // update order to paid
  order.isDelivered = true;
  order.deliveredAt = Date.now();

  const updatedOrder = await order.save();

  res.status(200).json({ status: "success", data: updatedOrder });
});

// @desc    Get checkout session from stripe and send it as response
// @route   GET /api/v1/orders/checkout-session/cartId
// @access  Protected/User
exports.checkoutSession = asyncHandler(async (req, res, next) => {
  // app settings
  const taxPrice = 0;
  const shippingPrice = 0;
  const deliveryFee = 0; // No delivery fee for card payment

  // 1) Get cart depend on cartId
  const cart = await Cart.findById(req.params.cartId);
  if (!cart) {
    return next(
      new ApiError(`There is no such cart with id ${req.params.cartId}`, 404)
    );
  }

  // 2) Get order price depend on cart price "Check if coupon apply"
  const cartPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalCartPrice;

  const totalOrderPrice = cartPrice + taxPrice + shippingPrice + deliveryFee;

  // 3) Create stripe checkout session
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        name: req.user.name,
        amount: totalOrderPrice * 100,
        currency: "egp",
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${req.protocol}://${req.get("host")}/orders`,
    cancel_url: `${req.protocol}://${req.get("host")}/cart`,
    customer_email: req.user.email,
    client_reference_id: req.params.cartId,
    metadata: req.body.shippingAddress,
  });

  // 4) send session to response
  res.status(200).json({ status: "success", session });
});

const createCardOrder = async (session) => {
  const cartId = session.client_reference_id;
  const shippingAddress = session.metadata;
  const oderPrice = session.amount_total / 100;

  const cart = await Cart.findById(cartId);
  const user = await User.findOne({ email: session.customer_email });

  // 3) Create order with default paymentMethodType card
  const order = await Order.create({
    user: user._id,
    cartItems: cart.cartItems,
    shippingAddress,
    totalOrderPrice: oderPrice,
    deliveryFee: 0, // No delivery fee for card payment
    isPaid: true,
    paidAt: Date.now(),
    paymentMethodType: "card",
  });

  // 4) After creating order, decrement product quantity, increment product sold
  if (order) {
    const bulkOption = cart.cartItems.map((item) => ({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { quantity: -item.quantity, sold: +item.quantity } },
      },
    }));
    await Product.bulkWrite(bulkOption, {});

    // 5) Clear cart depend on cartId
    await Cart.findByIdAndDelete(cartId);
  }
};

// @desc    This webhook will run when stripe payment success paid
// @route   POST /webhook-checkout
// @access  Protected/User
exports.webhookCheckout = asyncHandler(async (req, res, next) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    //  Create order
    createCardOrder(event.data.object);
  }

  res.status(200).json({ received: true });
});
