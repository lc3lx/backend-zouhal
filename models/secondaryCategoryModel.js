const mongoose = require('mongoose');

const secondaryCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: [true, 'Secondary category name is required'],
      unique: [true, 'Secondary category must be unique'],
      minlength: [2, 'Too short secondary category name'],
      maxlength: [32, 'Too long secondary category name'],
    },
    slug: {
      type: String,
      lowercase: true,
    },
    image: String,
    subCategory: {
      type: mongoose.Schema.ObjectId,
      ref: 'SubCategory',
      required: [true, 'Secondary category must belong to a subcategory'],
    },
    category: {
      type: mongoose.Schema.ObjectId,
      ref: 'Category',
      required: [true, 'Secondary category must belong to a category'],
    },
  },
  { timestamps: true }
);

const setImageURL = (doc) => {
  if (doc.image) {
    const imageUrl = `${process.env.BASE_URL}/uploads/secondary-categories/${doc.image}`;
    doc.image = imageUrl;
  }
};

// findOne, findAll and update
secondaryCategorySchema.post('init', (doc) => {
  setImageURL(doc);
});

// create
secondaryCategorySchema.post('save', (doc) => {
  setImageURL(doc);
});

module.exports = mongoose.model('SecondaryCategory', secondaryCategorySchema);
