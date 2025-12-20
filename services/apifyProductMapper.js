const slugify = require('slugify');

/**
 * Map Apify AliExpress product data to our Product model format
 * @param {Object} apifyProduct - Product data from Apify API
 * @param {Object} options - Mapping options
 * @returns {Object} Product document ready for database
 */
function mapApifyProductToProduct(apifyProduct, options = {}) {
  const {
    defaultCategoryId = null,
    defaultBrandId = null,
    defaultStoreId = null,
  } = options;

  // Extract basic info
  const title = apifyProduct.title || apifyProduct.productName || apifyProduct.name || 'Untitled Product';
  const slug = slugify(title, { lower: true, strict: true });

  // Extract price - handle different formats
  let price = 0;
  if (apifyProduct.price) {
    if (typeof apifyProduct.price === 'number') {
      price = apifyProduct.price;
    } else if (typeof apifyProduct.price === 'string') {
      // Remove currency symbols and parse
      price = parseFloat(apifyProduct.price.replace(/[^0-9.]/g, '')) || 0;
    }
  } else if (apifyProduct.priceRange) {
    // Use minimum price from range
    const minPrice = apifyProduct.priceRange.min || apifyProduct.priceRange[0];
    if (typeof minPrice === 'number') {
      price = minPrice;
    } else if (typeof minPrice === 'string') {
      price = parseFloat(minPrice.replace(/[^0-9.]/g, '')) || 0;
    }
  } else if (apifyProduct.salePrice) {
    price = typeof apifyProduct.salePrice === 'number' 
      ? apifyProduct.salePrice 
      : parseFloat(String(apifyProduct.salePrice).replace(/[^0-9.]/g, '')) || 0;
  }

  // Extract images
  let images = [];
  if (apifyProduct.images && Array.isArray(apifyProduct.images)) {
    images = apifyProduct.images
      .filter(img => img && (typeof img === 'string' || img.url))
      .map(img => typeof img === 'string' ? img : img.url)
      .filter(url => /^https?:\/\//i.test(url));
  } else if (apifyProduct.imageUrl) {
    images = [apifyProduct.imageUrl];
  } else if (apifyProduct.mainImage) {
    images = [apifyProduct.mainImage];
  }

  // Get cover image (first image or main image)
  const imageCover = images[0] || apifyProduct.imageUrl || apifyProduct.mainImage || '';

  // Extract description
  let description = '';
  if (apifyProduct.description) {
    description = typeof apifyProduct.description === 'string' 
      ? apifyProduct.description 
      : JSON.stringify(apifyProduct.description);
  } else if (apifyProduct.detail) {
    description = typeof apifyProduct.detail === 'string' 
      ? apifyProduct.detail 
      : JSON.stringify(apifyProduct.detail);
  } else if (apifyProduct.productDetails) {
    description = Array.isArray(apifyProduct.productDetails)
      ? apifyProduct.productDetails.join('\n')
      : String(apifyProduct.productDetails);
  }

  // Ensure minimum description length
  if (description.length < 20) {
    description = `${title}. ${description || 'High quality product with excellent features.'}`;
  }

  // Extract colors/variants
  const colors = [];
  if (apifyProduct.variants && Array.isArray(apifyProduct.variants)) {
    apifyProduct.variants.forEach(variant => {
      if (variant && variant.color) {
        const colorName = typeof variant.color === 'string' 
          ? variant.color 
          : (variant.color && (variant.color.name || variant.color.value)) || null;
        if (colorName && !colors.includes(colorName)) {
          colors.push(colorName);
        }
      }
    });
  } else if (apifyProduct.colors && Array.isArray(apifyProduct.colors)) {
    apifyProduct.colors.forEach(color => {
      if (color) {
        const colorName = typeof color === 'string' 
          ? color 
          : (color && (color.name || color.value)) || null;
        if (colorName && !colors.includes(colorName)) {
          colors.push(colorName);
        }
      }
    });
  }

  // Extract sizes
  const sizes = [];
  if (apifyProduct.sizes && Array.isArray(apifyProduct.sizes)) {
    apifyProduct.sizes.forEach(size => {
      if (size) {
        const sizeLabel = typeof size === 'string' 
          ? size 
          : (size && (size.label || size.name || size.value)) || null;
        if (sizeLabel) {
          sizes.push({
            label: sizeLabel,
            stock: typeof size === 'object' && size && size.stock ? size.stock : 99,
          });
        }
      }
    });
  } else if (apifyProduct.sizeList && Array.isArray(apifyProduct.sizeList)) {
    apifyProduct.sizeList.forEach(size => {
      if (size) {
        const sizeLabel = typeof size === 'string' 
          ? size 
          : (size && (size.label || size.name || size.value)) || null;
        if (sizeLabel) {
          sizes.push({
            label: sizeLabel,
            stock: 99,
          });
        }
      }
    });
  }

  // Extract product URL
  const productUrl = apifyProduct.url || apifyProduct.productUrl || apifyProduct.link || '';

  // Extract brand name (if available)
  let brandId = defaultBrandId;
  if (apifyProduct.brand && typeof apifyProduct.brand === 'string') {
    // Brand will be handled separately in the import process
  }

  // Extract rating
  let ratingsAverage = null;
  if (apifyProduct.rating) {
    ratingsAverage = typeof apifyProduct.rating === 'number' 
      ? apifyProduct.rating 
      : parseFloat(apifyProduct.rating) || null;
    
    // Normalize to 1-5 scale if needed
    if (ratingsAverage && ratingsAverage > 5) {
      ratingsAverage = 5;
    }
  }

  let ratingsQuantity = 0;
  if (apifyProduct.reviewCount || apifyProduct.reviewsCount || apifyProduct.reviewCount) {
    ratingsQuantity = parseInt(apifyProduct.reviewCount || apifyProduct.reviewsCount || apifyProduct.reviewCount) || 0;
  }

  // Build product document
  const productDoc = {
    title: title.substring(0, 100), // Enforce max length
    slug: slug.substring(0, 100),
    description: description.substring(0, 2000), // Reasonable limit
    quantity: apifyProduct.stock || apifyProduct.quantity || 99,
    price: Math.max(0.01, price), // Minimum price
    priceAfterDiscount: null,
    colors: colors.slice(0, 10), // Limit colors
    imageCover: imageCover,
    images: images.slice(0, 10), // Limit images
    category: defaultCategoryId,
    brand: brandId,
    store: defaultStoreId,
    productUrl: productUrl,
    sizes: sizes.length > 0 ? sizes : [],
    ratingsAverage: ratingsAverage,
    ratingsQuantity: ratingsQuantity,
    currency: 'USD',
    sold: apifyProduct.sold || apifyProduct.ordersCount || 0,
  };

  // Add variants if we have color-specific images
  if (apifyProduct.variants && Array.isArray(apifyProduct.variants) && apifyProduct.variants.length > 0) {
    productDoc.variants = apifyProduct.variants
      .filter(v => v && v.color && (v.image || v.images))
      .slice(0, 10)
      .map(variant => {
        const colorName = typeof variant.color === 'string' 
          ? variant.color 
          : (variant.color && variant.color.name) || 'Default';
        const colorHex = typeof variant.color === 'object' && variant.color && variant.color.hex 
          ? variant.color.hex 
          : null;
        
        return {
          color: {
            name: colorName,
            hex: colorHex,
          },
          images: Array.isArray(variant.images) 
            ? variant.images.slice(0, 5)
            : variant.image 
              ? [variant.image] 
              : [],
          sizes: sizes.length > 0 ? sizes : [],
          price: variant.price || price,
        };
      });
  }

  return productDoc;
}

module.exports = {
  mapApifyProductToProduct,
};

