const mongoose = require("mongoose");

// Store Schema
const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Store name is required"],
      unique: [true, "Store name must be unique"],
      minlength: [2, "Too short store name"],
      maxlength: [100, "Too long store name"],
      trim: true,
    },
    logo: {
      type: String,
      // Store logo image
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const setImageURL = (doc) => {
  if (doc.logo) {
    const isAbsolute = /^(http|https):\/\//i.test(doc.logo);
    if (!isAbsolute) {
      const imageUrl = `${process.env.BASE_URL}/uploads/stores/${doc.logo}`;
      doc.logo = imageUrl;
    }
  }
};

// findOne, findAll and update
storeSchema.post("init", (doc) => {
  setImageURL(doc);
});

// create
storeSchema.post("save", (doc) => {
  setImageURL(doc);
});

storeSchema.post("findOneAndUpdate", (doc) => {
  setImageURL(doc);
});

// Create model
module.exports = mongoose.model("Store", storeSchema);

// Indexes
storeSchema.index({ name: 1 });
storeSchema.index({ isActive: 1 });
