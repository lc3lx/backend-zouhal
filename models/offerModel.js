const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Offer title is required"],
      trim: true,
      maxlength: [100, "Title too long"],
    },
    description: {
      type: String,
      required: [true, "Offer description is required"],
      trim: true,
      maxlength: [200, "Description too long"],
    },
    discount: {
      type: String,
      required: [true, "Offer discount is required"],
      trim: true,
      maxlength: [20, "Discount too long"],
    },
    icon: {
      type: String,
      required: [true, "Offer icon is required"],
      trim: true,
    },
    color: {
      primary: {
        type: String,
        required: [true, "Primary color is required"],
        trim: true,
      },
      secondary: {
        type: String,
        required: [true, "Secondary color is required"],
        trim: true,
      },
    },
    image: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: [true, "Created by is required"],
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
offerSchema.index({ isActive: 1, priority: -1 });
offerSchema.index({ startDate: 1, endDate: 1 });

// Virtual for checking if offer is currently active
offerSchema.virtual("isCurrentlyActive").get(function () {
  const now = new Date();
  return this.isActive && now >= this.startDate && now <= this.endDate;
});

// Ensure virtual fields are serialized
offerSchema.set("toJSON", { virtuals: true });
offerSchema.set("toObject", { virtuals: true });

// Set image URL
const setImageURL = (doc) => {
  if (doc.image) {
    const imageUrl = `${process.env.BASE_URL}/uploads/offers/${doc.image}`;
    doc.image = imageUrl;
  }
};

// findOne, findAll and update
offerSchema.post("init", (doc) => {
  setImageURL(doc);
});

// create
offerSchema.post("save", (doc) => {
  setImageURL(doc);
});

// update
offerSchema.post("findOneAndUpdate", (doc) => {
  setImageURL(doc);
});

const Offer = mongoose.model("Offer", offerSchema);

module.exports = Offer;
