const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: [3, "Too short product title"],
      maxlength: [100, "Too long product title"],
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, "Product description is required"],
      minlength: [20, "Too short product description"],
    },
    quantity: {
      type: Number,
    },
    sold: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: [true, "Product price is required"],
      trim: true,
      max: [200000, "Too long product price"],
    },
    priceAfterDiscount: {
      type: Number,
    },
    colors: [String],

    // Product variants: each color may have its own images and sizes with stock
    variants: [
      {
        color: {
          name: { type: String, trim: true },
          hex: { type: String, trim: true },
        },
        images: [String],
        sizes: [
          {
            label: { type: String, trim: true },
            stock: { type: Number, default: 0 },
          },
        ],
        sku: { type: String, trim: true },
        price: { type: Number },
      },
    ],

    imageCover: {
      type: String,
      required: [true, "Product Image cover is required"],
    },
    images: [String],
    category: {
      type: mongoose.Schema.ObjectId,
      ref: "Category",
      required: [true, "Product must be belong to category"],
    },
    subcategories: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "SubCategory",
      },
    ],
    secondaryCategories: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "SecondaryCategory",
      },
    ],
    brand: {
      type: mongoose.Schema.ObjectId,
      ref: "Brand",
    },
    store: {
      type: mongoose.Schema.ObjectId,
      ref: "Store",
      // Store that this product belongs to
    },
    ratingsAverage: {
      type: Number,
      min: [1, "Rating must be above or equal 1.0"],
      max: [5, "Rating must be below or equal 5.0"],
      // set: (val) => Math.round(val * 10) / 10, // 3.3333 * 10 => 33.333 => 33 => 3.3
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    productUrl: {
      type: String,
      trim: true,
      // URL للمنتج من المتجر الخارجي - للأدمن فقط
    },
    // New fields
    season: {
      type: String,
      enum: ["summer", "autumn", "spring", "winter"],
      // Optional field for seasonal products
    },
    fabricType: {
      type: String,
      trim: true,
      // Optional field for fabric type
    },
    deliveryTime: {
      type: String,
      trim: true,
      // Delivery time information
    },
    deliveryStartDate: {
      type: Date,
      // Start date for delivery period
    },
    deliveryEndDate: {
      type: Date,
      // End date for delivery period
    },
    deliveryDays: {
      type: Number,
      // Number of delivery days (for offers)
    },
    // Sizes without colors (for products that don't have color variants)
    sizes: [
      {
        label: { type: String, trim: true },
        stock: { type: Number, default: 0 },
      },
    ],
    // Currency settings
    currency: {
      type: String,
      enum: ["USD", "SYP"],
      default: "USD",
    },
  },
  {
    timestamps: true,
    // to enable virtual populate
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.virtual("reviews", {
  ref: "Review",
  foreignField: "product",
  localField: "_id",
});

// Mongoose query middleware
productSchema.pre(/^find/, function (next) {
  this.populate({
    path: "category",
    select: "name -_id",
  })
    .populate({
      path: "brand",
      select: "name -_id",
    })
    .populate({
      path: "store",
      select: "name logo -_id",
    });
  next();
});

const setImageURL = (doc) => {
  if (doc.imageCover) {
    const isAbsolute = /^(http|https):\/\//i.test(doc.imageCover);
    doc.imageCover = isAbsolute
      ? doc.imageCover
      : `${process.env.BASE_URL}/uploads/products/${doc.imageCover}`;
  }
  if (doc.images) {
    const imagesList = [];
    doc.images.forEach((image) => {
      const isAbsolute = /^(http|https):\/\//i.test(image);
      const imageUrl = isAbsolute
        ? image
        : `${process.env.BASE_URL}/uploads/products/${image}`;
      imagesList.push(imageUrl);
    });
    doc.images = imagesList;
  }
  // Map variant images to absolute URLs as well
  if (doc.variants && Array.isArray(doc.variants)) {
    doc.variants = doc.variants.map((v) => {
      const variant = v.toObject ? v.toObject() : { ...v };
      if (variant.images && Array.isArray(variant.images)) {
        variant.images = variant.images.map((img) => {
          const isAbsolute = /^(http|https):\/\//i.test(img);
          return isAbsolute
            ? img
            : `${process.env.BASE_URL}/uploads/products/${img}`;
        });
      }
      return variant;
    });
  }
};
// findOne, findAll and update
productSchema.post("init", (doc) => {
  setImageURL(doc);
});

// create
productSchema.post("save", (doc) => {
  setImageURL(doc);
});

module.exports = mongoose.model("Product", productSchema);
// Useful indexes for common queries and sorts
productSchema.index({ slug: 1 });
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ price: 1 });
productSchema.index({ sold: -1 });
productSchema.index({ ratingsAverage: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ category: 1, price: 1, ratingsAverage: -1 });
