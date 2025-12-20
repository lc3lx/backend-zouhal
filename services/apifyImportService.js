const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');
const { fetchProductsFromApify, fetchMultiplePages } = require('./apifyService');
const { mapApifyProductToProduct } = require('./apifyProductMapper');
const Product = require('../models/productModel');
const Category = require('../models/categoryModel');
const Brand = require('../models/brandModel');
const Store = require('../models/storeModel');
const slugify = require('slugify');

// Cache for categories, brands, and stores
const categoryCache = new Map();
const brandCache = new Map();
const storeCache = new Map();

/**
 * Get or create category by name
 */
async function getOrCreateCategory(categoryName, defaultCategoryId = null) {
  if (defaultCategoryId && mongoose.Types.ObjectId.isValid(defaultCategoryId)) {
    return defaultCategoryId;
  }

  if (!categoryName) {
    return defaultCategoryId;
  }

  const normalizedName = categoryName.trim();
  if (categoryCache.has(normalizedName)) {
    return categoryCache.get(normalizedName);
  }

  // Try to find existing category
  let category = await Category.findOne({ 
    $or: [
      { name: new RegExp(`^${normalizedName}$`, 'i') },
      { slug: slugify(normalizedName, { lower: true, strict: true }) }
    ]
  });

  if (!category) {
    // Create new category
    try {
      category = await Category.create({
        name: normalizedName,
        slug: slugify(normalizedName, { lower: true, strict: true }),
      });
    } catch (createError) {
      // If creation fails (e.g., duplicate), try to find again
      category = await Category.findOne({ 
        $or: [
          { name: new RegExp(`^${normalizedName}$`, 'i') },
          { slug: slugify(normalizedName, { lower: true, strict: true }) }
        ]
      });
      if (!category) {
        throw new Error(`Failed to create or find category: ${normalizedName}`);
      }
    }
  }

  if (!category || !category._id) {
    throw new Error(`Category is null after create/find: ${normalizedName}`);
  }

  categoryCache.set(normalizedName, category._id);
  return category._id;
}

/**
 * Get or create brand by name
 */
async function getOrCreateBrand(brandName, defaultBrandId = null) {
  if (defaultBrandId && mongoose.Types.ObjectId.isValid(defaultBrandId)) {
    return defaultBrandId;
  }

  if (!brandName) {
    return defaultBrandId;
  }

  const normalizedName = brandName.trim();
  if (brandCache.has(normalizedName)) {
    return brandCache.get(normalizedName);
  }

  // Try to find existing brand
  let brand = await Brand.findOne({ 
    $or: [
      { name: new RegExp(`^${normalizedName}$`, 'i') },
      { slug: slugify(normalizedName, { lower: true, strict: true }) }
    ]
  });

  if (!brand) {
    // Create new brand
    try {
      brand = await Brand.create({
        name: normalizedName,
        slug: slugify(normalizedName, { lower: true, strict: true }),
      });
    } catch (createError) {
      // If creation fails (e.g., duplicate), try to find again
      brand = await Brand.findOne({ 
        $or: [
          { name: new RegExp(`^${normalizedName}$`, 'i') },
          { slug: slugify(normalizedName, { lower: true, strict: true }) }
        ]
      });
      if (!brand) {
        throw new Error(`Failed to create or find brand: ${normalizedName}`);
      }
    }
  }

  if (!brand || !brand._id) {
    throw new Error(`Brand is null after create/find: ${normalizedName}`);
  }

  brandCache.set(normalizedName, brand._id);
  return brand._id;
}

/**
 * Get or create store by name
 */
async function getOrCreateStore(storeName, defaultStoreId = null) {
  if (defaultStoreId && mongoose.Types.ObjectId.isValid(defaultStoreId)) {
    return defaultStoreId;
  }

  if (!storeName) {
    storeName = 'AliExpress'; // Default store name
  }

  const normalizedName = storeName.trim();
  if (storeCache.has(normalizedName)) {
    return storeCache.get(normalizedName);
  }

  // Try to find existing store
  let store = await Store.findOne({ 
    $or: [
      { name: new RegExp(`^${normalizedName}$`, 'i') },
      { slug: slugify(normalizedName, { lower: true, strict: true }) }
    ]
  });

  if (!store) {
    // Create new store
    try {
      store = await Store.create({
        name: normalizedName,
        slug: slugify(normalizedName, { lower: true, strict: true }),
      });
    } catch (createError) {
      // If creation fails (e.g., duplicate), try to find again
      store = await Store.findOne({ 
        $or: [
          { name: new RegExp(`^${normalizedName}$`, 'i') },
          { slug: slugify(normalizedName, { lower: true, strict: true }) }
        ]
      });
      if (!store) {
        throw new Error(`Failed to create or find store: ${normalizedName}`);
      }
    }
  }

  if (!store || !store._id) {
    throw new Error(`Store is null after create/find: ${normalizedName}`);
  }

  storeCache.set(normalizedName, store._id);
  return store._id;
}

/**
 * Import single product from Apify data
 */
async function importProduct(apifyProduct, options = {}) {
  const {
    defaultCategoryId = null,
    defaultBrandId = null,
    defaultStoreId = null,
    categoryName = null,
    brandName = null,
    storeName = null,
    upsert = true,
  } = options;

  try {
    // Validate apifyProduct
    if (!apifyProduct || typeof apifyProduct !== 'object') {
      throw new Error('Invalid product data: apifyProduct is null or not an object');
    }

    // Get or create category, brand, store
    const categoryId = await getOrCreateCategory(categoryName || 'General', defaultCategoryId);
    const brandId = apifyProduct.brand 
      ? await getOrCreateBrand(String(apifyProduct.brand), defaultBrandId)
      : defaultBrandId;
    const storeId = await getOrCreateStore(storeName || 'AliExpress', defaultStoreId);

    // Map Apify product to our format
    const productDoc = mapApifyProductToProduct(apifyProduct, {
      defaultCategoryId: categoryId,
      defaultBrandId: brandId,
      defaultStoreId: storeId,
    });

    // Validate required fields
    if (!productDoc.title || productDoc.title.trim() === '') {
      throw new Error('Missing required field: title');
    }
    if (!productDoc.description || productDoc.description.trim() === '') {
      throw new Error('Missing required field: description');
    }
    if (!productDoc.price || productDoc.price <= 0) {
      throw new Error('Missing or invalid required field: price');
    }
    if (!productDoc.category || !mongoose.Types.ObjectId.isValid(productDoc.category)) {
      throw new Error('Missing or invalid required field: category');
    }
    if (!productDoc.imageCover || productDoc.imageCover.trim() === '') {
      // Set a default placeholder image if missing
      productDoc.imageCover = 'https://via.placeholder.com/500?text=No+Image';
    }

    if (upsert) {
      // Upsert product (update if exists, insert if new)
      const filter = productDoc.productUrl 
        ? { productUrl: productDoc.productUrl }
        : { slug: productDoc.slug };

      await Product.findOneAndUpdate(
        filter,
        { $set: productDoc },
        { upsert: true, new: true, runValidators: true }
      );
    } else {
      // Just insert new product
      await Product.create(productDoc);
    }

    return { success: true, product: productDoc };
  } catch (error) {
    console.error('Error importing product:', error.message);
    console.error('Product data:', JSON.stringify(apifyProduct, null, 2).substring(0, 500));
    return { 
      success: false, 
      error: error.message || 'Unknown error',
      product: apifyProduct?.title || apifyProduct?.productName || apifyProduct?.name || 'Unknown',
    };
  }
}

/**
 * Import multiple products from Apify
 */
async function importProducts(apifyProducts, options = {}) {
  const results = {
    total: apifyProducts.length,
    imported: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < apifyProducts.length; i++) {
    const result = await importProduct(apifyProducts[i], options);
    
    if (result.success) {
      results.imported++;
    } else {
      results.failed++;
      results.errors.push({
        index: i,
        product: result.product,
        error: result.error,
      });
    }

    // Progress logging
    if ((i + 1) % 10 === 0) {
      console.log(`Imported ${i + 1}/${apifyProducts.length} products...`);
    }
  }

  return results;
}

/**
 * Fetch and import products from Apify
 */
async function fetchAndImportProducts(options = {}) {
  const {
    searchKeyword = 'phone',
    page = 1,
    maxProducts = 50,
    defaultCategoryId = null,
    defaultBrandId = null,
    defaultStoreId = null,
    categoryName = null,
    brandName = null,
    storeName = null,
  } = options;

  console.log(`Fetching products from Apify: keyword="${searchKeyword}", page=${page}, max=${maxProducts}`);

  // Fetch products from Apify
  const apifyProducts = await fetchProductsFromApify({
    searchKeyword,
    page,
    maxProducts,
  });

  if (apifyProducts.length === 0) {
    return {
      total: 0,
      imported: 0,
      failed: 0,
      errors: [],
      message: 'No products found from Apify',
    };
  }

  console.log(`Importing ${apifyProducts.length} products to database...`);

  // Import products
  const results = await importProducts(apifyProducts, {
    defaultCategoryId,
    defaultBrandId,
    defaultStoreId,
    categoryName,
    brandName,
    storeName,
    upsert: true,
  });

  return results;
}

/**
 * Fetch and import multiple pages of products
 */
async function fetchAndImportMultiplePages(options = {}) {
  const {
    searchKeyword = 'phone',
    totalProducts = 1000,
    productsPerPage = 50,
    defaultCategoryId = null,
    defaultBrandId = null,
    defaultStoreId = null,
    categoryName = null,
    brandName = null,
    storeName = null,
  } = options;

  console.log(`Starting bulk import: ${totalProducts} products in batches of ${productsPerPage}`);

  // Fetch all products
  const apifyProducts = await fetchMultiplePages({
    searchKeyword,
    totalProducts,
    productsPerPage,
  });

  if (apifyProducts.length === 0) {
    return {
      total: 0,
      imported: 0,
      failed: 0,
      errors: [],
      message: 'No products found from Apify',
    };
  }

  console.log(`Importing ${apifyProducts.length} products to database...`);

  // Import all products
  const results = await importProducts(apifyProducts, {
    defaultCategoryId,
    defaultBrandId,
    defaultStoreId,
    categoryName,
    brandName,
    storeName,
    upsert: true,
  });

  return results;
}

module.exports = {
  importProduct,
  importProducts,
  fetchAndImportProducts,
  fetchAndImportMultiplePages,
  getOrCreateCategory,
  getOrCreateBrand,
  getOrCreateStore,
};

