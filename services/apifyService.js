const axios = require('axios');
const asyncHandler = require('express-async-handler');
const ApiError = require('../utils/apiError');

const APIFY_ACTOR_ID = 'pintostudio~aliexpress-product-search';
const APIFY_TOKEN = 'apify_api_M6xcavjprJvkLpbogfKicBOo7gVffU477FAE';

// Base URL للـ API
const APIFY_BASE_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`;

// إنشاء URL كامل مع الـ token والمعاملات الإضافية
function buildApifyUrl(params = {}) {
  const url = new URL(APIFY_BASE_URL);
  url.searchParams.set('token', APIFY_TOKEN);

  // إضافة معاملات التحكم في التشغيل
  if (params.timeout) url.searchParams.set('timeout', params.timeout);
  if (params.memory) url.searchParams.set('memory', params.memory);
  if (params.maxItems) url.searchParams.set('maxItems', params.maxItems);
  if (params.maxTotalChargeUsd) url.searchParams.set('maxTotalChargeUsd', params.maxTotalChargeUsd);
  if (params.restartOnError !== undefined) url.searchParams.set('restartOnError', params.restartOnError);
  if (params.build) url.searchParams.set('build', params.build);

  // إضافة معاملات تنسيق البيانات
  if (params.format) url.searchParams.set('format', params.format);
  if (params.clean !== undefined) url.searchParams.set('clean', params.clean);
  if (params.offset !== undefined) url.searchParams.set('offset', params.offset);
  if (params.limit !== undefined) url.searchParams.set('limit', params.limit);
  if (params.fields) url.searchParams.set('fields', params.fields);
  if (params.omit) url.searchParams.set('omit', params.omit);
  if (params.unwind) url.searchParams.set('unwind', params.unwind);
  if (params.flatten) url.searchParams.set('flatten', params.flatten);
  if (params.desc !== undefined) url.searchParams.set('desc', params.desc);
  if (params.attachment !== undefined) url.searchParams.set('attachment', params.attachment);
  if (params.delimiter) url.searchParams.set('delimiter', params.delimiter);
  if (params.bom !== undefined) url.searchParams.set('bom', params.bom);
  if (params.xmlRoot) url.searchParams.set('xmlRoot', params.xmlRoot);
  if (params.xmlRow) url.searchParams.set('xmlRow', params.xmlRow);
  if (params.skipHeaderRow !== undefined) url.searchParams.set('skipHeaderRow', params.skipHeaderRow);
  if (params.skipHidden !== undefined) url.searchParams.set('skipHidden', params.skipHidden);
  if (params.skipEmpty !== undefined) url.searchParams.set('skipEmpty', params.skipEmpty);
  if (params.simplified !== undefined) url.searchParams.set('simplified', params.simplified);
  if (params.skipFailedPages !== undefined) url.searchParams.set('skipFailedPages', params.skipFailedPages);

  return url.toString();
}

/**
 * Fetch products from Apify AliExpress API
 * @param {Object} options - Search and API options
 * @param {string} options.searchKeyword - Search keyword
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.maxProducts - Maximum products to fetch (default: 50)
 * @param {Object} options.apiParams - Additional API parameters (timeout, memory, format, etc.)
 * @returns {Promise<Array>} Array of products
 */
async function fetchProductsFromApify(options = {}) {
  const {
    searchKeyword = 'phone',
    page = 1,
    maxProducts = 50,
    apiParams = {}
  } = options;

  try {
    console.log(`Fetching products from Apify: keyword="${searchKeyword}", page=${page}`);

    // بناء URL مع المعاملات الإضافية
    const apiUrl = buildApifyUrl({
      // معاملات تحكم التشغيل
      timeout: apiParams.timeout || 300, // 5 minutes default
      memory: apiParams.memory || 1024, // 1GB default
      maxItems: apiParams.maxItems,
      maxTotalChargeUsd: apiParams.maxTotalChargeUsd,
      restartOnError: apiParams.restartOnError,

      // معاملات تنسيق البيانات
      format: apiParams.format || 'json',
      clean: apiParams.clean !== undefined ? apiParams.clean : true,
      limit: apiParams.limit || maxProducts,
      fields: apiParams.fields,
      skipHidden: apiParams.skipHidden !== undefined ? apiParams.skipHidden : true,
      skipEmpty: apiParams.skipEmpty !== undefined ? apiParams.skipEmpty : true,
    });

    const response = await axios.post(
      apiUrl,
      {
        searchKeyword,
        page,
        maxProducts,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: (apiParams.timeout || 300) * 1000, // تحويل إلى مللي ثانية
      }
    );

    if (!Array.isArray(response.data)) {
      console.error('Invalid response format from Apify API:', typeof response.data);
      console.error('Response data sample:', JSON.stringify(response.data, null, 2).substring(0, 1000));
      throw new Error('Invalid response format from Apify API - expected array');
    }

    // Filter out null/undefined products
    const validProducts = response.data.filter(product => product && typeof product === 'object');
    
    if (validProducts.length !== response.data.length) {
      console.warn(`Filtered out ${response.data.length - validProducts.length} invalid products`);
    }

    console.log(`Successfully fetched ${validProducts.length} products from Apify`);
    return validProducts;
  } catch (error) {
    console.error('Error fetching products from Apify:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      throw new ApiError(
        `Apify API error: ${error.response.data?.error?.message || error.message}`,
        error.response.status
      );
    }
    throw new ApiError(`Failed to fetch products from Apify: ${error.message}`, 500);
  }
}

/**
 * Fetch multiple pages of products
 * @param {Object} options - Search options
 * @param {string} options.searchKeyword - Search keyword
 * @param {number} options.totalProducts - Total number of products to fetch
 * @param {number} options.productsPerPage - Products per page (default: 50)
 * @param {Object} options.apiParams - Additional API parameters
 * @returns {Promise<Array>} Array of all products
 */
async function fetchMultiplePages(options = {}) {
  const {
    searchKeyword = 'phone',
    totalProducts = 1000,
    productsPerPage = 50,
    apiParams = {},
  } = options;

  const totalPages = Math.ceil(totalProducts / productsPerPage);
  const allProducts = [];
  const errors = [];

  console.log(`Fetching ${totalProducts} products in ${totalPages} pages...`);

  for (let page = 1; page <= totalPages; page++) {
    try {
      console.log(`Fetching page ${page}/${totalPages}...`);
      const products = await fetchProductsFromApify({
        searchKeyword,
        page,
        maxProducts: productsPerPage,
        apiParams,
      });

      if (products.length === 0) {
        console.log(`No more products found at page ${page}, stopping...`);
        break;
      }

      allProducts.push(...products);

      // If we've got enough products, stop
      if (allProducts.length >= totalProducts) {
        allProducts.splice(totalProducts);
        break;
      }

      // Add delay between requests to avoid rate limiting
      if (page < totalPages) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
      }
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error.message);
      errors.push({ page, error: error.message });
      // Continue with next page even if one fails
    }
  }

  console.log(`Total products fetched: ${allProducts.length}`);
  if (errors.length > 0) {
    console.warn(`Errors occurred in ${errors.length} pages:`, errors);
  }

  return allProducts;
}

module.exports = {
  fetchProductsFromApify,
  fetchMultiplePages,
  buildApifyUrl,
};

