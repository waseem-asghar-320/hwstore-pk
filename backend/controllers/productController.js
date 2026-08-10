const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const { uploadProductImages, deleteProductImage, isCloudinaryUrl } = require('../utils/cloudinaryUpload');

function parseImagesField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseColorsField(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Removes a single product image, whichever storage it lives in:
 *  - Cloudinary URL (current system) -> deleted via the Cloudinary Admin API.
 *  - Legacy local "/uploads/xxx.jpg" path (pre-Cloudinary products) -> removed
 *    from disk when possible. This is wrapped in try/catch and never throws,
 *    both because the asset may already be gone and because the deployment
 *    filesystem may be read-only (Vercel) — a failed cleanup must never break
 *    the surrounding create/update/delete request.
 */
async function deleteImageFile(imagePath) {
  if (!imagePath) return;

  if (isCloudinaryUrl(imagePath)) {
    await deleteProductImage(imagePath);
    return;
  }

  if (!imagePath.startsWith('/uploads/')) return;

  try {
    const filePath = path.join(__dirname, '..', imagePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(`⚠️ Could not remove legacy local image (${imagePath}):`, error.message);
  }
}

exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: products.length, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const uploadedImages = await uploadProductImages(req.files);

    if (uploadedImages.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one product image is required' });
    }

    const product = await Product.create({
      name: req.body.name,
      brand: req.body.brand,
      category: req.body.category,
      price: Number(req.body.price),
      discountPrice: Number(req.body.discountPrice || 0),
      rating: Number(req.body.rating || 0),
      description: req.body.description,
      stock: Number(req.body.stock) || 1,
      colors: parseColorsField(req.body.colors),
      images: uploadedImages,
    });

    res.status(201).json({ success: true, message: 'Product created successfully', data: product });
  } catch (error) {
    if (error.name === 'ConfigurationError') {
      return res.status(500).json({ success: false, message: error.message });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const existingImages = parseImagesField(req.body.existingImages);
    const uploadedImages = await uploadProductImages(req.files);
    const images = [...existingImages, ...uploadedImages];

    if (images.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one product image is required' });
    }

    const removedImages = product.images.filter((img) => !existingImages.includes(img));
    await Promise.all(removedImages.map(deleteImageFile));

    product.name = req.body.name;
    product.brand = req.body.brand;
    product.category = req.body.category;
    product.price = Number(req.body.price);
    product.discountPrice = Number(req.body.discountPrice || 0);
    product.rating = Number(req.body.rating || 0);
    product.description = req.body.description;
    product.stock = Number(req.body.stock) || 1;
    product.colors = parseColorsField(req.body.colors);
    product.images = images;

    await product.save();

    res.status(200).json({ success: true, message: 'Product updated successfully', data: product });
  } catch (error) {
    if (error.name === 'ConfigurationError') {
      return res.status(500).json({ success: false, message: error.message });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await Promise.all(product.images.map(deleteImageFile));
    await Product.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
