const asyncHandler = require("express-async-handler");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const axios = require("axios");
const ApiError = require("../utils/apiError");

const { uploadAny } = require("../middlewares/uploadImageMiddleware");
const factory = require("./handlersFactory");
const Product = require("../models/productModel");

// Accept any files; we'll normalize and enforce limits inside the resize handler
exports.uploadProductImages = uploadAny();

exports.resizeProductImages = asyncHandler(async (req, res, next) => {
  // Normalize files whether multer provided an array (any()) or object (fields())
  let imageCoverFiles = [];
  let imagesFiles = [];
  let variantImageFiles = [];

  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach((f) => {
        if (f.fieldname === "imageCover") imageCoverFiles.push(f);
        else if (f.fieldname === "images") imagesFiles.push(f);
        else if (f.fieldname === "variantImages") variantImageFiles.push(f);
      });
    } else {
      imageCoverFiles = req.files.imageCover || [];
      imagesFiles = req.files.images || [];
      variantImageFiles = req.files.variantImages || [];
    }
  }

  // Enforce soft limits to mimic previous multer field limits
  if (imageCoverFiles.length > 1) {
    imageCoverFiles = imageCoverFiles.slice(0, 1);
  }
  if (imagesFiles.length > 10) {
    // Allow up to 10 images for the product (not counting cover)
    imagesFiles = imagesFiles.slice(0, 10);
  }
  if (variantImageFiles.length > 30) {
    // Allow up to 30 images total for all variants
    variantImageFiles = variantImageFiles.slice(0, 30);
  }

  // 1- Image processing for imageCover
  if (imageCoverFiles.length > 0) {
    const imageCoverFileName = `product-${uuidv4()}-${Date.now()}-cover.jpeg`;

    await sharp(imageCoverFiles[0].buffer)
      .resize(2000, 1333)
      .toFormat("jpeg")
      .jpeg({ quality: 95 })
      .toFile(`uploads/products/${imageCoverFileName}`);

    // Save image into our db
    req.body.imageCover = imageCoverFileName;
  }

  // 2- Image processing for images
  if (imagesFiles.length > 0) {
    req.body.images = [];
    await Promise.all(
      imagesFiles.map(async (img, index) => {
        const imageName = `product-${uuidv4()}-${Date.now()}-${index + 1}.jpeg`;
        await sharp(img.buffer)
          .resize(2000, 1333)
          .toFormat("jpeg")
          .jpeg({ quality: 95 })
          .toFile(`uploads/products/${imageName}`);
        req.body.images.push(imageName);
      })
    );
  }

  // 3- Variant images and mapping to variants JSON
  if (variantImageFiles.length > 0) {
    const processedVariantImages = [];
    await Promise.all(
      variantImageFiles.map(async (img, index) => {
        const imageName = `product-${uuidv4()}-${Date.now()}-variant-${
          index + 1
        }.jpeg`;
        await sharp(img.buffer)
          .resize(600, 600, { fit: "inside", withoutEnlargement: true })
          .toFormat("jpeg")
          .jpeg({ quality: 95 })
          .toFile(`uploads/products/${imageName}`);
        processedVariantImages.push(imageName);
      })
    );

    // Parse variants JSON structure (if provided)
    if (req.body.variants && typeof req.body.variants === "string") {
      try {
        req.body.variants = JSON.parse(req.body.variants);
      } catch (e) {
        req.body.variants = [];
      }
    }
    if (!Array.isArray(req.body.variants)) req.body.variants = [];

    // variantImageMap indicates how many images per variant (JSON array)
    let imageMap = [];
    if (
      req.body.variantImageMap &&
      typeof req.body.variantImageMap === "string"
    ) {
      try {
        imageMap = JSON.parse(req.body.variantImageMap);
      } catch (e) {
        imageMap = [];
      }
    } else if (Array.isArray(req.body.variantImageMap)) {
      imageMap = req.body.variantImageMap;
    }

    if (
      req.body.variants.length > 0 &&
      imageMap.length === req.body.variants.length
    ) {
      let cursor = 0;
      req.body.variants = req.body.variants.map((v, i) => {
        const count = Number(imageMap[i]) || 0;
        const slice = processedVariantImages.slice(cursor, cursor + count);
        cursor += count;
        return {
          ...v,
          images: slice,
        };
      });
    }
  }

  // Normalize subcategories if sent via multipart/form-data
  if (req.body && req.body.subcategories !== undefined) {
    const val = req.body.subcategories;
    if (Array.isArray(val)) {
      if (
        val.length === 1 &&
        typeof val[0] === "string" &&
        /^\s*\[/.test(val[0])
      ) {
        try {
          req.body.subcategories = JSON.parse(val[0]);
        } catch (e) {
          // leave as-is
        }
      }
    } else if (typeof val === "string") {
      try {
        req.body.subcategories = JSON.parse(val);
      } catch (e) {
        req.body.subcategories = [val];
      }
    }
  }

  // Normalize secondaryCategories if sent via multipart/form-data
  if (req.body && req.body.secondaryCategories !== undefined) {
    const val = req.body.secondaryCategories;
    if (Array.isArray(val)) {
      if (
        val.length === 1 &&
        typeof val[0] === "string" &&
        /^\s*\[/.test(val[0])
      ) {
        try {
          req.body.secondaryCategories = JSON.parse(val[0]);
        } catch (e) {
          // leave as-is
        }
      }
    } else if (typeof val === "string") {
      try {
        req.body.secondaryCategories = JSON.parse(val);
      } catch (e) {
        req.body.secondaryCategories = [val];
      }
    }
  }

  return next();
});

// @desc    Get list of products
// @route   GET /api/v1/products
// @access  Public
exports.getProducts = factory.getAll(Product, "Products");

// @desc    Get specific product by id
// @route   GET /api/v1/products/:id
// @access  Public
exports.getProduct = factory.getOne(Product, "reviews");

// @desc    Create product
// @route   POST  /api/v1/products
// @access  Private
exports.createProduct = factory.createOne(Product);
// @desc    Update specific product
// @route   PUT /api/v1/products/:id
// @access  Private
exports.updateProduct = factory.updateOne(Product);

// @desc    Delete specific product
// @route   DELETE /api/v1/products/:id
// @access  Private
exports.deleteProduct = factory.deleteOne(Product);

// @desc    Extract product data from URL
// @route   POST /api/v1/products/extract
// @access  Private
exports.extractProductFromUrl = asyncHandler(async (req, res, next) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return next(new ApiError("URL is required", 400));
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (error) {
    return next(new ApiError("Invalid URL format", 400));
  }

  try {
    // Try to fetch HTML from the URL
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 30000,
      maxRedirects: 5,
    });

    const html = response.data;

    // Try to call Flask AI server for extraction
    const aiServerUrl = process.env.AI_SERVER_URL || "http://localhost:3001";
    let extractedData = null;

    try {
      const aiResponse = await axios.post(
        `${aiServerUrl}/api/ai/extract-product`,
        {
          url: url,
          html: html.substring(0, 50000), // Limit HTML size
        },
        {
          timeout: 60000,
        }
      );
      extractedData = aiResponse.data;
    } catch (aiError) {
      console.warn("AI server not available, using basic extraction:", aiError.message);
      // Fallback to basic extraction
      extractedData = basicExtractProductData(html, url);
    }

    // If AI extraction failed, use basic extraction
    if (!extractedData || !extractedData.title) {
      extractedData = basicExtractProductData(html, url);
    }

    res.status(200).json({
      status: "success",
      data: extractedData,
    });
  } catch (error) {
    console.error("Error extracting product:", error);
    return next(
      new ApiError(
        `Failed to extract product data: ${error.message}`,
        error.response?.status || 500
      )
    );
  }
});

// Basic product data extraction (fallback)
function basicExtractProductData(html, url) {
  const data = {
    source_url: url,
    title: "",
    clean_title: "",
    images: [],
    colors: [],
    sizes: [],
    price: "",
    description_raw: "",
    description_clean: "",
    my_custom_description: "",
    seo_keywords: [],
    tags: [],
  };

  try {
    const isShein = url.includes("shein.com") || url.includes("shein.");
    
    if (isShein) {
      // Special extraction for Shein
      return extractSheinProductData(html, url);
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      data.title = titleMatch[1].trim();
      data.clean_title = data.title
        .replace(/\s*[-|]\s*.*$/, "")
        .trim()
        .substring(0, 100);
    }

    // Extract meta description
    const descMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
    );
    if (descMatch) {
      data.description_raw = descMatch[1].trim();
    }

    // Extract images (common patterns)
    const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
    const images = [];
    for (const match of imgMatches) {
      const imgUrl = match[1];
      if (
        imgUrl &&
        !imgUrl.includes("logo") &&
        !imgUrl.includes("icon") &&
        (imgUrl.includes("product") ||
          imgUrl.includes("item") ||
          imgUrl.match(/\.(jpg|jpeg|png|webp)/i))
      ) {
        // Convert relative URLs to absolute
        if (imgUrl.startsWith("//")) {
          images.push(`https:${imgUrl}`);
        } else if (imgUrl.startsWith("/")) {
          const urlObj = new URL(url);
          images.push(`${urlObj.origin}${imgUrl}`);
        } else if (imgUrl.startsWith("http")) {
          images.push(imgUrl);
        }
      }
    }
    data.images = [...new Set(images)].slice(0, 10); // Remove duplicates and limit

    // Extract price (common patterns)
    const pricePatterns = [
      /["']price["']\s*:\s*["']?([\d,]+\.?\d*)/i,
      /<span[^>]*class=["'][^"']*price[^"']*["'][^>]*>([^<]+)<\/span>/i,
      /\$[\s]*([\d,]+\.?\d*)/g,
      /([\d,]+\.?\d*)\s*USD/gi,
    ];

    for (const pattern of pricePatterns) {
      const matches = html.match(pattern);
      if (matches) {
        const priceStr = matches[1] || matches[0];
        const priceNum = parseFloat(priceStr.replace(/,/g, ""));
        if (priceNum && priceNum > 0 && priceNum < 100000) {
          data.price = priceNum.toString();
          break;
        }
      }
    }

    // Generate basic description if missing
    if (!data.description_raw) {
      data.description_raw = `منتج ${data.title || "مميز"} من ${new URL(url).hostname}`;
    }

    // Generate clean description
    data.description_clean = data.description_raw
      .replace(/<[^>]+>/g, "")
      .trim()
      .substring(0, 500);

    // Generate custom description
    data.my_custom_description = generateCustomDescription(
      data.title,
      data.description_clean,
      data.price
    );

    // Extract keywords from title
    if (data.title) {
      const words = data.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      data.seo_keywords = [...new Set(words)].slice(0, 10);
      data.tags = [...new Set(words)].slice(0, 5);
    }
  } catch (error) {
    console.error("Error in basic extraction:", error);
  }

  return data;
}

// Special extraction for Shein products
function extractSheinProductData(html, url) {
  const data = {
    source_url: url,
    title: "",
    clean_title: "",
    images: [],
    colors: [],
    sizes: [],
    price: "",
    description_raw: "",
    description_clean: "",
    my_custom_description: "",
    seo_keywords: [],
    tags: [],
  };

  try {
    // Extract JSON data from script tags (like Chrome extension does)
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    const seenUrls = new Set();
    
    if (scriptMatches) {
      for (const scriptTag of scriptMatches) {
        const scriptContent = scriptTag.replace(/<script[^>]*>|<\/script>/gi, "");
        
        // Look for product data in JSON
        if (
          scriptContent.includes("goodsDetail") ||
          scriptContent.includes("productDetail") ||
          scriptContent.includes("goodsInfo") ||
          scriptContent.includes("productInfo") ||
          scriptContent.includes("goods_id") ||
          scriptContent.includes("product_id")
        ) {
          try {
            // Try to extract JSON objects
            const jsonMatches = scriptContent.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
            if (jsonMatches) {
              for (const jsonStr of jsonMatches) {
                try {
                  const jsonObj = JSON.parse(jsonStr);
                  extractDataFromJson(jsonObj, data, seenUrls);
                } catch (e) {
                  // Try to find nested JSON
                  const nestedMatches = jsonStr.match(/\{[^{}]*"goodsDetail"[^{}]*\{[^}]*\}[^}]*\}/g);
                  if (nestedMatches) {
                    for (const nested of nestedMatches) {
                      try {
                        const nestedObj = JSON.parse(nested);
                        extractDataFromJson(nestedObj, data, seenUrls);
                      } catch (e2) {
                        // Continue
                      }
                    }
                  }
                }
              }
            }
            
            // Also try to extract from window.__INITIAL_STATE__ or similar
            const initialStateMatch = scriptContent.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
            if (initialStateMatch) {
              try {
                const initialState = JSON.parse(initialStateMatch[1]);
                extractDataFromJson(initialState, data, seenUrls);
              } catch (e) {
                // Continue
              }
            }
            
            // Try to extract from window.goodsDetailInfo
            const goodsDetailMatch = scriptContent.match(/window\.goodsDetailInfo\s*=\s*(\{[\s\S]*?\});/);
            if (goodsDetailMatch) {
              try {
                const goodsDetail = JSON.parse(goodsDetailMatch[1]);
                extractDataFromJson(goodsDetail, data, seenUrls);
              } catch (e) {
                // Continue
              }
            }
          } catch (e) {
            // Continue searching
          }
        }
      }
    }

    // Extract from HTML attributes and data attributes
    // Look for product images in data attributes
    const dataImageMatches = html.matchAll(/data-[^=]*image[^=]*=["']([^"']+)["']/gi);
    for (const match of dataImageMatches) {
      const imgUrl = match[1];
      if (imgUrl && imgUrl.includes("shein") && !seenUrls.has(imgUrl)) {
        if (imgUrl.startsWith("//")) {
          data.images.push(`https:${imgUrl}`);
          seenUrls.add(`https:${imgUrl}`);
        } else if (imgUrl.startsWith("http")) {
          data.images.push(imgUrl);
          seenUrls.add(imgUrl);
        }
      }
    }

    // Extract images from img tags with specific Shein patterns
    const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
    for (const match of imgMatches) {
      const imgUrl = match[1];
      if (
        imgUrl &&
        (imgUrl.includes("shein") || imgUrl.includes("s7d9")) &&
        !imgUrl.includes("logo") &&
        !imgUrl.includes("icon") &&
        !seenUrls.has(imgUrl)
      ) {
        if (imgUrl.startsWith("//")) {
          const fullUrl = `https:${imgUrl}`;
          data.images.push(fullUrl);
          seenUrls.add(fullUrl);
        } else if (imgUrl.startsWith("http")) {
          data.images.push(imgUrl);
          seenUrls.add(imgUrl);
        }
      }
    }

    // Extract price from various patterns
    const pricePatterns = [
      /"salePrice"\s*:\s*"?([\d.]+)/i,
      /"price"\s*:\s*"?([\d.]+)/i,
      /"retailPrice"\s*:\s*"?([\d.]+)/i,
      /<span[^>]*class=["'][^"']*price[^"']*["'][^>]*>([^<]+)<\/span>/i,
      /<div[^>]*class=["'][^"']*price[^"']*["'][^>]*>([^<]+)<\/div>/i,
    ];

    for (const pattern of pricePatterns) {
      const matches = html.match(pattern);
      if (matches) {
        const priceStr = matches[1];
        const priceNum = parseFloat(priceStr.replace(/,/g, ""));
        if (priceNum && priceNum > 0 && priceNum < 100000) {
          data.price = priceNum.toString();
          break;
        }
      }
    }

    // Extract title from h1 or specific selectors
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match && h1Match[1].trim() && !h1Match[1].includes("شي إن")) {
      data.title = h1Match[1].trim();
      data.clean_title = data.title.substring(0, 100);
    } else {
      // Fallback to title tag
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        let title = titleMatch[1].trim();
        // Remove Shein branding
        title = title.replace(/\s*[-|]\s*شي إن.*$/i, "");
        title = title.replace(/\s*[-|]\s*SHEIN.*$/i, "");
        data.title = title;
        data.clean_title = title.substring(0, 100);
      }
    }

    // Remove duplicates from images
    data.images = [...new Set(data.images)].slice(0, 20);

    // Generate description if not found
    if (!data.description_raw) {
      data.description_raw = `منتج ${data.title || "مميز"} من Shein`;
    }

    data.description_clean = data.description_raw
      .replace(/<[^>]+>/g, "")
      .trim()
      .substring(0, 500);

    data.my_custom_description = generateCustomDescription(
      data.title,
      data.description_clean,
      data.price
    );

    // Extract keywords
    if (data.title) {
      const words = data.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3 && !w.includes("shein"));
      data.seo_keywords = [...new Set(words)].slice(0, 10);
      data.tags = [...new Set(words)].slice(0, 5);
    }
  } catch (error) {
    console.error("Error extracting Shein product:", error);
  }

  return data;
}

// Recursive function to extract data from JSON objects
function extractDataFromJson(obj, data, seenUrls) {
  if (!obj || typeof obj !== "object") return;

  try {
    // Extract title
    if (!data.title && (obj.goodsName || obj.productName || obj.title || obj.name)) {
      data.title = obj.goodsName || obj.productName || obj.title || obj.name;
      data.clean_title = data.title.substring(0, 100);
    }

    // Extract price
    if (!data.price && (obj.salePrice || obj.price || obj.retailPrice)) {
      const price = obj.salePrice || obj.price || obj.retailPrice;
      if (typeof price === "number" && price > 0) {
        data.price = price.toString();
      } else if (typeof price === "string") {
        const priceNum = parseFloat(price.replace(/,/g, ""));
        if (priceNum > 0) {
          data.price = priceNum.toString();
        }
      }
    }

    // Extract images
    if (obj.goodsImgs || obj.productImages || obj.images || obj.gallery) {
      const images = obj.goodsImgs || obj.productImages || obj.images || obj.gallery;
      if (Array.isArray(images)) {
        images.forEach((img) => {
          if (typeof img === "string" && img.startsWith("http") && !seenUrls.has(img)) {
            data.images.push(img);
            seenUrls.add(img);
          } else if (typeof img === "object" && img.originImage) {
            const imgUrl = img.originImage;
            if (!seenUrls.has(imgUrl)) {
              data.images.push(imgUrl);
              seenUrls.add(imgUrl);
            }
          }
        });
      }
    }

    // Extract colors/variants
    if (obj.goodsColorList || obj.variants || obj.colors) {
      const colors = obj.goodsColorList || obj.variants || obj.colors;
      if (Array.isArray(colors)) {
        colors.forEach((color) => {
          if (typeof color === "string") {
            if (!data.colors.includes(color)) {
              data.colors.push(color);
            }
          } else if (color.colorName || color.name) {
            const colorName = color.colorName || color.name;
            if (!data.colors.includes(colorName)) {
              data.colors.push(colorName);
            }
          }
        });
      }
    }

    // Extract sizes
    if (obj.goodsSizeList || obj.sizes || obj.sizeList) {
      const sizes = obj.goodsSizeList || obj.sizes || obj.sizeList;
      if (Array.isArray(sizes)) {
        sizes.forEach((size) => {
          if (typeof size === "string") {
            if (!data.sizes.includes(size)) {
              data.sizes.push(size);
            }
          } else if (size.sizeName || size.name) {
            const sizeName = size.sizeName || size.name;
            if (!data.sizes.includes(sizeName)) {
              data.sizes.push(sizeName);
            }
          }
        });
      }
    }

    // Extract description
    if (!data.description_raw && (obj.goodsDesc || obj.description || obj.desc)) {
      data.description_raw = obj.goodsDesc || obj.description || obj.desc;
    }

    // Recursively search nested objects
    for (const key in obj) {
      if (obj[key] && typeof obj[key] === "object") {
        extractDataFromJson(obj[key], data, seenUrls);
      }
    }
  } catch (error) {
    // Continue silently
  }
}

// Generate custom Arabic description
function generateCustomDescription(title, rawDesc, price) {
  let desc = `اكتشف ${title || "هذا المنتج المميز"} الآن! `;

  if (rawDesc) {
    desc += rawDesc.substring(0, 200) + " ";
  }

  if (price) {
    desc += `بسعر مميز ${price}$ فقط. `;
  }

  desc +=
    "جودة عالية وتصميم أنيق. اطلبه الآن واستمتع بأفضل تجربة تسوق!";

  return desc.substring(0, 500);
}
