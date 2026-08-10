const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discountPrice: {
      type: Number,
      default: 0,
      min: [0, 'Discount price cannot be negative'],
    },
    rating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be negative'],
      max: [5, 'Rating cannot exceed 5'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    brand: {
      type: String,
      required: [true, 'Brand is required'],
      trim: true,
    },
    images: {
      type: [String],
      required: [true, 'At least one product image is required'],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one product image is required',
      },
    },
    stock: {
      type: Number,
      default: 1,
      min: [0, 'Stock cannot be negative'],
    },
    colors: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => Array.isArray(v),
        message: 'Colors must be an array of strings',
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Product', productSchema);
