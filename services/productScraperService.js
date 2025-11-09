const asyncHandler = require("express-async-handler");
const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Extract product data from Shein product URL
 * @param {string} url - Product URL from Shein
 * @returns {Promise<Object>} - Extracted product data
 */
exports.scrapeProductFromUrl = asyncHandler(async (url) => {
  if (!url || typeof url !== "string") {
    throw new Error("الرابط غير صحيح");
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (error) {
    throw new Error("الرابط غير صحيح");
  }

  // Check if it's a Shein URL
  if (!url.includes("shein")) {
    throw new Error("الرابط يجب أن يكون من موقع Shein");
  }

  try {
    // Fetch the page with proper headers to avoid blocking
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      timeout: 30000, // 30 seconds timeout
    });

    const $ = cheerio.load(response.data);
    const productData = {
      title: "",
      description: "",
      images: [],
      colors: [],
      price: null,
      priceAfterDiscount: null,
    };

    // Extract title - try multiple selectors
    const titleSelectors = [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      "h1.product-intro__head-name",
      ".product-intro__head-name",
      "h1",
      ".product-title",
    ];

    for (const selector of titleSelectors) {
      const title = $(selector).attr("content") || $(selector).text().trim();
      if (title) {
        productData.title = title;
        break;
      }
    }

    // Extract description - try multiple selectors
    const descSelectors = [
      'meta[property="og:description"]',
      'meta[name="description"]',
      ".product-intro__head-description",
      ".product-description",
      ".product-detail",
    ];

    for (const selector of descSelectors) {
      const desc = $(selector).attr("content") || $(selector).text().trim();
      if (desc && desc.length > 20) {
        productData.description = desc;
        break;
      }
    }

    // Extract images - try multiple methods
    // Method 1: Look for JSON-LD structured data
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((i, elem) => {
      try {
        const jsonData = JSON.parse($(elem).html());
        if (jsonData.image) {
          if (Array.isArray(jsonData.image)) {
            productData.images.push(...jsonData.image);
          } else {
            productData.images.push(jsonData.image);
          }
        }
        if (jsonData.offers && jsonData.offers.price) {
          productData.price = parseFloat(jsonData.offers.price);
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    });

    // Method 2: Look for meta tags with images
    $('meta[property="og:image"]').each((i, elem) => {
      const imageUrl = $(elem).attr("content");
      if (imageUrl && !productData.images.includes(imageUrl)) {
        productData.images.push(imageUrl);
      }
    });

    // Method 3: Look for product image galleries
    $("img").each((i, elem) => {
      const src = $(elem).attr("src") || $(elem).attr("data-src");
      if (src && src.includes("shein") && src.match(/\.(jpg|jpeg|png|webp)/i)) {
        // Clean up the URL (remove size parameters)
        let cleanUrl = src.split("?")[0];
        if (cleanUrl && !productData.images.includes(cleanUrl)) {
          productData.images.push(cleanUrl);
        }
      }
    });

    // Method 4: Look for data attributes with image URLs
    $("[data-src], [data-image], [data-img]").each((i, elem) => {
      const imageUrl =
        $(elem).attr("data-src") ||
        $(elem).attr("data-image") ||
        $(elem).attr("data-img");
      if (
        imageUrl &&
        imageUrl.includes("shein") &&
        imageUrl.match(/\.(jpg|jpeg|png|webp)/i) &&
        !productData.images.includes(imageUrl)
      ) {
        productData.images.push(imageUrl);
      }
    });

    // Extract colors - look for color swatches or options
    $(".product-intro__color-item, .color-item, [data-color]").each(
      (i, elem) => {
        const colorName = $(elem).attr("title") || $(elem).attr("data-color");
        const colorHex =
          $(elem).attr("data-hex") || $(elem).css("background-color");
        if (colorName) {
          productData.colors.push({
            name: colorName,
            hex: colorHex || null,
          });
        }
      }
    );

    // Extract price - try multiple selectors
    const priceSelectors = [
      ".product-intro__head-price",
      ".product-price",
      "[data-price]",
      ".price",
    ];

    for (const selector of priceSelectors) {
      const priceText = $(selector).text().trim();
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[0].replace(/,/g, ""));
        if (price && !productData.price) {
          productData.price = price;
        }
      }
    }

    // Look for discount price
    $(".product-intro__head-price--discount, .price-discount").each(
      (i, elem) => {
        const discountText = $(elem).text().trim();
        const discountMatch = discountText.match(/[\d,]+\.?\d*/);
        if (discountMatch) {
          productData.priceAfterDiscount = parseFloat(
            discountMatch[0].replace(/,/g, "")
          );
        }
      }
    );

    // Try to extract from JavaScript variables in the page
    const pageScripts = $("script").html();
    if (pageScripts) {
      // Look for price in JavaScript
      const priceMatch = pageScripts.match(/price["\s]*:["\s]*([\d.]+)/i);
      if (priceMatch && !productData.price) {
        productData.price = parseFloat(priceMatch[1]);
      }

      // Look for images array in JavaScript
      const imagesMatch = pageScripts.match(/images["\s]*:["\s]*\[(.*?)\]/i);
      if (imagesMatch) {
        try {
          const imagesArray = JSON.parse(`[${imagesMatch[1]}]`);
          imagesArray.forEach((img) => {
            if (
              img &&
              typeof img === "string" &&
              !productData.images.includes(img)
            ) {
              productData.images.push(img);
            }
          });
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    // Remove duplicates from images array
    productData.images = [...new Set(productData.images)].slice(0, 20); // Limit to 20 images

    // If no images found, try to get from og:image
    if (productData.images.length === 0) {
      const ogImage = $('meta[property="og:image"]').attr("content");
      if (ogImage) {
        productData.images.push(ogImage);
      }
    }

    // Validate extracted data
    if (!productData.title) {
      throw new Error("لم يتم العثور على اسم المنتج في الرابط");
    }

    if (productData.images.length === 0) {
      throw new Error("لم يتم العثور على صور المنتج في الرابط");
    }

    return productData;
  } catch (error) {
    if (error.response) {
      throw new Error(
        `فشل في جلب البيانات من الرابط: ${error.response.status} ${error.response.statusText}`
      );
    } else if (error.message) {
      throw error;
    } else {
      throw new Error("حدث خطأ أثناء استخراج البيانات من الرابط");
    }
  }
});
