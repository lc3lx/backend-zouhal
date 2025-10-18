const mongoose = require("mongoose");

const subCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      unique: [true, "SubCategory must be unique"],
      minlength: [2, "To short SubCategory name"],
      maxlength: [32, "To long SubCategory name"],
    },
    slug: {
      type: String,
      lowercase: true,
    },
    image: String,
    category: {
      type: mongoose.Schema.ObjectId,
      ref: "Category",
      required: [true, "SubCategory must be belong to parent category"],
    },
  },
  { timestamps: true }
);

const setImageURL = (doc) => {
  if (doc.image) {
    const imageUrl = `${process.env.BASE_URL}/uploads/subcategories/${doc.image}`;
    doc.image = imageUrl;
  }
};

// findOne, findAll and update
subCategorySchema.post("init", (doc) => {
  setImageURL(doc);
});

// create
subCategorySchema.post("save", (doc) => {
  setImageURL(doc);
});

module.exports = mongoose.model("SubCategory", subCategorySchema);
