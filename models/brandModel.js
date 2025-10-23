const mongoose = require("mongoose");

// 1- Create Schema
const brandSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Brand required"],
      unique: [true, "Brand must be unique"],
      minlength: [3, "Too short Brand name"],
      maxlength: [32, "Too long Brand name"],
    },
    slug: {
      type: String,
      lowercase: true,
    },
    image: String,
  },
  { timestamps: true }
);

const setImageURL = (doc) => {
  if (doc.image) {
    // تحقق إذا كان الـ URL مطلق (يبدأ بـ http)
    const isAbsolute = /^(http|https):\/\//i.test(doc.image);
    if (!isAbsolute) {
      const imageUrl = `${process.env.BASE_URL}/uploads/brands/${doc.image}`;
      doc.image = imageUrl;
    }
  }
};

// findOne, findAll and update
brandSchema.post("init", (doc) => {
  setImageURL(doc);
});

// create
brandSchema.post("save", (doc) => {
  setImageURL(doc);
});

brandSchema.post("findOneAndUpdate", (doc) => {
  setImageURL(doc);
});

// 2- Create model
module.exports = mongoose.model("Brand", brandSchema);

// Indexes
brandSchema.index({ slug: 1 });
