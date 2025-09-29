const Offer = require("../models/offerModel");
const ApiError = require("../utils/apiError");
const { asyncHandler } = require("./handlersFactory");

// @desc    Get all offers
// @route   GET /api/v1/offers
// @access  Public
exports.getOffers = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, isActive } = req.query;
  const skip = (page - 1) * limit;

  // Build query
  let query = {};

  // Filter by active status
  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  }

  // Get offers with pagination
  const offers = await Offer.find(query)
    .populate("createdBy", "name email")
    .sort({ priority: -1, createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await Offer.countDocuments(query);

  res.status(200).json({
    status: "success",
    results: offers.length,
    data: offers,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
    },
  });
});

// @desc    Get active offers
// @route   GET /api/v1/offers/active
// @access  Public
exports.getActiveOffers = asyncHandler(async (req, res, next) => {
  const now = new Date();

  const offers = await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .populate("createdBy", "name email")
    .sort({ priority: -1, createdAt: -1 })
    .limit(10);

  res.status(200).json({
    status: "success",
    results: offers.length,
    data: offers,
  });
});

// @desc    Get single offer
// @route   GET /api/v1/offers/:id
// @access  Public
exports.getOffer = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const offer = await Offer.findById(id).populate("createdBy", "name email");

  if (!offer) {
    return next(new ApiError(`No offer found for this id ${id}`, 404));
  }

  res.status(200).json({
    status: "success",
    data: offer,
  });
});

// @desc    Create new offer
// @route   POST /api/v1/offers
// @access  Private/Admin
exports.createOffer = asyncHandler(async (req, res, next) => {
  // Add createdBy to request body
  req.body.createdBy = req.user._id;

  const offer = await Offer.create(req.body);

  res.status(201).json({
    status: "success",
    data: offer,
  });
});

// @desc    Update offer
// @route   PUT /api/v1/offers/:id
// @access  Private/Admin
exports.updateOffer = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const offer = await Offer.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!offer) {
    return next(new ApiError(`No offer found for this id ${id}`, 404));
  }

  res.status(200).json({
    status: "success",
    data: offer,
  });
});

// @desc    Delete offer
// @route   DELETE /api/v1/offers/:id
// @access  Private/Admin
exports.deleteOffer = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const offer = await Offer.findByIdAndDelete(id);

  if (!offer) {
    return next(new ApiError(`No offer found for this id ${id}`, 404));
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// @desc    Toggle offer status
// @route   PATCH /api/v1/offers/:id/toggle
// @access  Private/Admin
exports.toggleOfferStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const offer = await Offer.findById(id);

  if (!offer) {
    return next(new ApiError(`No offer found for this id ${id}`, 404));
  }

  offer.isActive = !offer.isActive;
  await offer.save();

  res.status(200).json({
    status: "success",
    data: offer,
  });
});
