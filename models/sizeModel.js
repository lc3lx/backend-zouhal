const mongoose = require("mongoose");

// Size Schema
const sizeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Size name is required"],
      trim: true,
      minlength: [1, "Too short size name"],
      maxlength: [20, "Too long size name"],
    },
    type: {
      type: String,
      required: [true, "Size type is required"],
      enum: [
        "Clothing", // ملابس
        "Shoes", // أحذية
        "Rings", // خواتم
        "Watches", // ساعات
        "Bags", // حقائب
        "Accessories", // إكسسوارات
        "Other", // أخرى
      ],
      default: "Clothing",
    },
    categoryIds: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "Category",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
sizeSchema.index({ name: 1, type: 1 }, { unique: true });
sizeSchema.index({ type: 1 });
sizeSchema.index({ categoryIds: 1 });

// Populate categories when querying
sizeSchema.pre(/^find/, function (next) {
  this.populate({
    path: "categoryIds",
    select: "name _id",
  });
  next();
});

// Create model
const SizeModel = mongoose.model("Size", sizeSchema);

module.exports = SizeModel;
