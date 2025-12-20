/**
 * Script to import products from Apify AliExpress API
 * Usage: node scripts/import-apify-products.js [options]
 * 
 * Options:
 *   --keyword=<keyword>     Search keyword (default: "phone")
 *   --total=<number>        Total products to import (default: 1000)
 *   --categoryId=<id>       Category ID to assign products
 *   --categoryName=<name>   Category name (will be created if doesn't exist)
 *   --storeName=<name>      Store name (default: "AliExpress")
 */

require('dotenv').config();
const mongoose = require('mongoose');
const dbConnection = require('../config/database');
const { fetchAndImportMultiplePages } = require('../services/apifyImportService');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    keyword: 'phone',
    total: 1000,
    categoryId: null,
    categoryName: null,
    brandId: null,
    brandName: null,
    storeName: 'AliExpress',
  };

  args.forEach(arg => {
    if (arg.startsWith('--keyword=')) {
      options.keyword = arg.split('=')[1];
    } else if (arg.startsWith('--total=')) {
      options.total = parseInt(arg.split('=')[1]) || 1000;
    } else if (arg.startsWith('--categoryId=')) {
      options.categoryId = arg.split('=')[1];
    } else if (arg.startsWith('--categoryName=')) {
      options.categoryName = arg.split('=')[1];
    } else if (arg.startsWith('--brandId=')) {
      options.brandId = arg.split('=')[1];
    } else if (arg.startsWith('--brandName=')) {
      options.brandName = arg.split('=')[1];
    } else if (arg.startsWith('--storeName=')) {
      options.storeName = arg.split('=')[1];
    }
  });

  return options;
}

async function main() {
  const options = parseArgs();

  console.log('='.repeat(60));
  console.log('Apify Products Import Script');
  console.log('='.repeat(60));
  console.log('Options:');
  console.log(`  Keyword: ${options.keyword}`);
  console.log(`  Total Products: ${options.total}`);
  console.log(`  Category ID: ${options.categoryId || 'None'}`);
  console.log(`  Category Name: ${options.categoryName || 'None (will use "General")'}`);
  console.log(`  Store Name: ${options.storeName}`);
  console.log('='.repeat(60));
  console.log('');

  // Connect to database
  if (!process.env.DB_URI) {
    console.error('ERROR: DB_URI is not set. Please set it in your .env file.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  dbConnection();

  // Wait for connection
  await new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      mongoose.connection.off('open', onOpen);
      mongoose.connection.off('error', onError);
    };
    mongoose.connection.once('open', onOpen);
    mongoose.connection.once('error', onError);
    setTimeout(() => onError(new Error('DB connection timeout')), 30000);
  });

  console.log('✓ Database connected\n');

  try {
    const startTime = Date.now();
    
    console.log(`Starting import of ${options.total} products...`);
    console.log('This may take several minutes...\n');

    const results = await fetchAndImportMultiplePages({
      searchKeyword: options.keyword,
      totalProducts: options.total,
      productsPerPage: 50,
      defaultCategoryId: options.categoryId,
      defaultBrandId: options.brandId,
      categoryName: options.categoryName || 'General',
      brandName: options.brandName,
      storeName: options.storeName,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('Import Completed!');
    console.log('='.repeat(60));
    console.log(`Total products processed: ${results.total}`);
    console.log(`Successfully imported: ${results.imported}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Duration: ${duration} seconds`);
    
    if (results.errors.length > 0) {
      console.log(`\nErrors (showing first 10):`);
      results.errors.slice(0, 10).forEach(err => {
        console.log(`  - ${err.product}: ${err.error}`);
      });
      if (results.errors.length > 10) {
        console.log(`  ... and ${results.errors.length - 10} more errors`);
      }
    }
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\nERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

