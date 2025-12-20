const axios = require('axios');
const asyncHandler = require('express-async-handler');
const ApiError = require('../utils/apiError');

const APIFY_ACTOR_ID = 'pintostudio~aliexpress-product-search';
const APIFY_TOKEN = 'apify_api_M6xcavjprJvkLpbogfKicBOo7gVffU477FAE';
const APIFY_API_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

/**
 * Fetch products from Apify AliExpress API
 * @param {Object} options - Search options
 * @param {string} options.searchKeyword - Search keyword
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.maxProducts - Maximum products to fetch (default: 50)
 * @returns {Promise<Array>} Array of products
 */
async function fetchProductsFromApify(options = {}) {
  const { searchKeyword = 'phone', page = 1, maxProducts = 50 } = options;

  try {
    console.log(`Fetching products from Apify: keyword="${searchKeyword}", page=${page}`);

    const response = await axios.post(
      APIFY_API_URL,
      {
        searchKeyword,
        page,
        maxProducts,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 300000, // 5 minutes timeout for sync API
      }
    );

    if (!Array.isArray(response.data)) {
      throw new Error('Invalid response format from Apify API');
    }

    console.log(`Successfully fetched ${response.data.length} products from Apify`);
    return response.data;
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
 * @returns {Promise<Array>} Array of all products
 */
async function fetchMultiplePages(options = {}) {
  const {
    searchKeyword = 'phone',
    totalProducts = 1000,
    productsPerPage = 50,
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
};

