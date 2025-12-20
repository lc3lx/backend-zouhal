"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mongoose = require("mongoose");
const slugify = require("slugify");
const dotenv = require("dotenv");

// Load env from backend/.env if present
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const dbConnection = require("../config/database");
const Product = require("../models/productModel");
const Brand = require("../models/brandModel");
const Category = require("../models/categoryModel");
const Store = require("../models/storeModel");

// Simple caches to avoid repeated DB lookups
const brandCache = new Map();
const categoryCache = new Map();
const storeCache = new Map();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dryRun: false, limit: 0, skip: 0 };
  for (const a of args) {
    const [k, v] = a.startsWith("--") ? a.substring(2).split("=") : [a, ""];
    switch (k) {
      case "file":
        out.file = v || null;
        break;
      case "db":
        out.db = v || null;
        break;
      case "category":
        out.category = v || null;
        break;
      case "store":
        out.store = v || null;
        break;
      case "categoryName":
        out.categoryName = v || null;
        break;
      case "storeName":
        out.storeName = v || null;
        break;
      case "categoryAuto":
        out.categoryAuto = true;
        break;
      case "defaultCategoryName":
        out.defaultCategoryName = v || null;
        break;
      case "limit":
        out.limit = Number(v) || 0;
        break;
      case "skip":
        out.skip = Number(v) || 0;
        break;
      case "dry":
      case "dryRun":
        out.dryRun = true;
        break;
      case "brandFallback":
        out.brandFallback = v || "SHEIN";
        break;
      default:
        break;
    }
  }
  return out;
}

function toJSONishArray(str) {
  if (!str) return [];
  let s = String(str).trim();
  s = s.replace(/,+\s*$/, "");
  if (!s) return [];
  try {
    // replace single quotes surrounding tokens with double quotes (naive)
    const jsonified = s.replace(/'([^']*)'/g, '"$1"');
    const parsed = JSON.parse(jsonified);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (e) {
    return [];
  }
}

function parseImagesCell(str) {
  const arr = toJSONishArray(str);
  return arr
    .map((u) => String(u).trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .filter((v, i, a) => a.indexOf(v) === i);
}

function parseDescriptionCell(str) {
  let text = "";
  const attrs = [];
  const arr = toJSONishArray(str);
  for (const el of arr) {
    if (el && typeof el === "object") {
      const k = Object.keys(el)[0];
      const v = el[k];
      if (k && v !== undefined) {
        attrs.push({ key: String(k), value: String(v) });
      }
    }
  }
  if (attrs.length) {
    text = attrs.map((p) => `${p.key}: ${p.value}`).join(" | ");
  } else {
    text = String(str || "").trim();
  }
  return { text, attrs };
}

function parsePrice(str) {
  if (str == null) return null;
  let s = String(str).trim();
  if (s === "") return null;

  // Normalize: remove currency symbols and spaces
  s = s.replace(/[^\d,.\-]/g, "");

  // If pattern like 1.234,56 (dot thousands, comma decimal) -> convert to 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // If pattern like 1,234.56 (comma thousands, dot decimal) -> remove commas
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) {
    s = s.replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // If only commas and single comma like 1234,56 -> treat comma as decimal
  if (/^\d+,\d+$/.test(s) && !s.includes(".")) {
    s = s.replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Otherwise remove commas and parse
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function extractColor(attrs) {
  const found = attrs.find((a) => /color/i.test(a.key));
  return found ? String(found.value).trim() : null;
}

async function ensureBrand(name) {
  if (!name) return null;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (brandCache.has(clean)) return brandCache.get(clean);
  const existing = await Brand.findOne({ name: clean }).lean();
  if (existing) {
    brandCache.set(clean, existing._id);
    return existing._id;
  }
  const slug = slugify(clean, { lower: true, strict: true });
  const created = await Brand.create({ name: clean, slug });
  brandCache.set(clean, created._id);
  return created._id;
}

async function ensureCategoryByName(name) {
  if (!name) return null;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (categoryCache.has(clean)) return categoryCache.get(clean);
  const exist = await Category.findOne({ name: clean }).lean();
  if (exist) {
    categoryCache.set(clean, exist._id);
    return exist._id;
  }
  const slug = slugify(clean, { lower: true, strict: true });
  const created = await Category.create({ name: clean, slug });
  categoryCache.set(clean, created._id);
  return created._id;
}

async function ensureStoreByName(name) {
  if (!name) return null;
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (storeCache.has(clean)) return storeCache.get(clean);
  const exist = await Store.findOne({ name: clean }).lean();
  if (exist) {
    storeCache.set(clean, exist._id);
    return exist._id;
  }
  const created = await Store.create({ name: clean });
  storeCache.set(clean, created._id);
  return created._id;
}

function validObjectId(s) {
  return mongoose.Types.ObjectId.isValid(String(s));
}

async function upsertProduct(doc) {
  const filter = {};
  if (doc.productUrl) filter.productUrl = doc.productUrl;
  else filter.slug = doc.slug;

  // Build $set only with defined keys (prevent setting undefined)
  const setObj = {};
  if (doc.title !== undefined) setObj.title = doc.title;
  if (doc.slug !== undefined) setObj.slug = doc.slug;
  if (doc.description !== undefined) setObj.description = doc.description;
  setObj.quantity = doc.quantity ?? 99;
  if (doc.price !== undefined) setObj.price = doc.price;
  if (doc.priceAfterDiscount !== undefined) setObj.priceAfterDiscount = doc.priceAfterDiscount;
  if (doc.imageCover !== undefined) setObj.imageCover = doc.imageCover;
  if (doc.category !== undefined) setObj.category = doc.category;
  if (doc.brand !== undefined) setObj.brand = doc.brand;
  if (doc.store !== undefined) setObj.store = doc.store;
  if (doc.productUrl !== undefined) setObj.productUrl = doc.productUrl;
  if (doc.sizes !== undefined) setObj.sizes = doc.sizes;
  setObj.currency = doc.currency || "USD";

  const update = {
    $set: setObj,
    $addToSet: {},
  };
  if (Array.isArray(doc.images) && doc.images.length) update.$addToSet.images = { $each: doc.images };
  if (Array.isArray(doc.colors) && doc.colors.length) update.$addToSet.colors = { $each: doc.colors };

  const options = { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, context: "query" };
  const result = await Product.findOneAndUpdate(filter, update, options);
  return !!result;
}

async function main() {
  const args = parseArgs();
  if (!args.file) {
    console.error("--file is required (path to CSV)");
    process.exit(1);
  }
  // DB URI
  const inputPath = path.resolve(args.file);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  let doWrite = !args.dryRun;
  if (doWrite) {
    if (args.db) {
      process.env.DB_URI = args.db;
    }
    if (!process.env.DB_URI) {
      console.error("DB_URI is not set. Provide it via backend/.env or --db=... argument.");
      process.exit(1);
    }
    dbConnection();
    if (mongoose.connection.readyState !== 1) {
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
          mongoose.connection.off("open", onOpen);
          mongoose.connection.off("error", onError);
        };
        mongoose.connection.once("open", onOpen);
        mongoose.connection.once("error", onError);
        setTimeout(() => onError(new Error("DB connection timeout")), 30000);
      });
    }
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let lineNo = 0;
  let headers = [];
  let headerMap = null; // indices per logical column
  let processed = 0; // number of rows we "count" for skip/limit
  let inserted = 0;
  let errors = 0;

  let categoryId = args.category && validObjectId(args.category) ? args.category : null;
  let storeId = args.store && validObjectId(args.store) ? args.store : null;
  if (doWrite) {
    const effectiveStoreName = storeId ? null : (args.storeName || "SHEIN");
    if (!storeId && effectiveStoreName) {
      storeId = await ensureStoreByName(effectiveStoreName);
    }
    if (!args.categoryAuto) {
      if (!categoryId && args.categoryName) {
        categoryId = await ensureCategoryByName(args.categoryName);
      }
      if (!categoryId) {
        console.error("Category is required. Use --category=<ObjectId> or --categoryName=<name>, or enable --categoryAuto.");
        process.exit(1);
      }
    }
  }

  const defaultCategoryName = args.defaultCategoryName || "General";

  function guessCategoryNameFromText(name, brandStr, descText) {
    const txt = `${name} ${brandStr || ""} ${descText || ""}`.toLowerCase();
    const checks = [
      { re: /\b(skirt|mini\s*skirt|bodycon\s*skirt)\b/, cat: "Skirts" },
      { re: /\b(shorts|bermuda)\b/, cat: "Shorts" },
      { re: /\b(dress|gown|maxi\s*dress|mini\s*dress)\b/, cat: "Dresses" },
      { re: /\b(jeans|denim)\b/, cat: "Jeans" },
      { re: /\b(pants|trousers)\b/, cat: "Pants" },
      { re: /\b(shirt|t-?shirt|blouse|top)\b/, cat: "Tops" },
      { re: /\b(hoodie|sweater|jumper|cardigan)\b/, cat: "Knitwear" },
      { re: /\b(jacket|coat|outerwear|blazer)\b/, cat: "Outerwear" },
      { re: /\b(bag|handbag|backpack|tote)\b/, cat: "Bags" },
      { re: /\b(shoe|sneaker|heels|boots|sandals)\b/, cat: "Shoes" },
      { re: /\b(accessor(y|ies)|chain|ring|necklace|bracelet|earring)\b/, cat: "Accessories" },
      { re: /\b(swim|bikini)\b/, cat: "Swimwear" },
      { re: /\b(lingerie|bra|panties)\b/, cat: "Lingerie" },
    ];
    for (const c of checks) {
      if (c.re.test(txt)) return c.cat;
    }
    if (brandStr) {
      const b = brandStr.toLowerCase();
      if (b.includes("accessories")) return "Accessories";
    }
    return defaultCategoryName;
  }

  function normalizeHeaderName(h) {
    return String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function locateIndexes(rawHeaders) {
    const cleaned = rawHeaders.map((h) => String(h || "").trim());
    const norms = cleaned.map(normalizeHeaderName);
    const findIdx = (cands) => {
      const targets = Array.isArray(cands) ? cands : [cands];
      for (const t of targets) {
        const n = normalizeHeaderName(t);
        const i = norms.indexOf(n);
        if (i !== -1) return i;
      }
      return -1;
    };
    const map = {
      url: findIdx(["url", "link", "href"]),
      name: findIdx(["name", "title"]),
      sku: findIdx(["sku", "id", "code"]),
      price: findIdx(["price", "amount"]),
      size: findIdx(["size", "sizes"]),
      brand: findIdx(["brand", "maker"]),
      description: findIdx(["description", "desc", "details"]),
      images: findIdx(["images", "image", "pics", "pictures"]),
    };
    const defaults = { url: 0, name: 1, sku: 2, price: 3, size: 4, brand: 5, description: 6, images: 7 };
    for (const k of Object.keys(map)) {
      if (map[k] === -1 && defaults[k] < rawHeaders.length) map[k] = defaults[k];
    }
    return map;
  }

  // rowIndex counts physical rows after header (used for skip logic independently)
  let rowIndex = 0;

  for await (const line of rl) {
    lineNo += 1;
    if (lineNo === 1) {
      headers = line.split(";").map((h) => (h || "").trim());
      headerMap = locateIndexes(headers);
      continue;
    }

    rowIndex += 1;

    // implement skip/limit using rowIndex (physical rows)
    if (args.skip && rowIndex <= args.skip) {
      if (rowIndex % 1000 === 0) console.log(`Skipping till ${args.skip}, at row ${rowIndex}`);
      continue;
    }
    if (args.limit && (processed >= args.limit)) break;

    const parts = line.split(";");
    const pick = (idx) => (idx >= 0 && idx < parts.length ? parts[idx] : "");

    try {
      const url = String(pick(headerMap.url)).trim();
      const name = String(pick(headerMap.name)).trim();
      const priceNum = parsePrice(pick(headerMap.price));
      const sizeStr = String(pick(headerMap.size)).trim();
      const brandStr = String(pick(headerMap.brand)).trim();
      const images = parseImagesCell(pick(headerMap.images));
      const { text: descText, attrs } = parseDescriptionCell(pick(headerMap.description));
      const colorName = extractColor(attrs);

      if (!name || !priceNum || !images.length) {
        errors += 1;
        console.error(`Skip line ${lineNo}: missing required fields (name=${Boolean(name)}, price=${priceNum}, images=${images.length})`);
        // Do not increment `processed` here; processed counts imported/attempted rows
        continue;
      }

      const imageCover = images[0];
      const restImages = images.slice(1);

      let description = descText && descText.length >= 20
        ? descText
        : `Imported product: ${name}. ${descText}`.slice(0, 3000);

      const colors = colorName ? [colorName] : [];

      const sizes = [];
      if (sizeStr) {
        const tokens = sizeStr.split(/[|,\/\s]+/).map((t) => t.trim()).filter(Boolean);
        const uniq = Array.from(new Set(tokens));
        if (uniq.length) {
          for (const s of uniq) sizes.push({ label: s, stock: 0 });
        }
      }

      const brandName = brandStr || args.brandFallback || "SHEIN";
      let brandId = null;
      if (doWrite) {
        brandId = await ensureBrand(brandName);
      }

      const slug = slugify(name, { lower: true, strict: true });

      let rowCategoryId = categoryId;
      let rowCategoryName = null;
      if (doWrite && args.categoryAuto) {
        rowCategoryName = guessCategoryNameFromText(name, brandStr, descText);
        rowCategoryId = await ensureCategoryByName(rowCategoryName);
      } else if (!doWrite && args.categoryAuto) {
        rowCategoryName = guessCategoryNameFromText(name, brandStr, descText);
      }
      if (!doWrite && !args.categoryAuto && !categoryId) {
        rowCategoryName = defaultCategoryName;
      }

      const doc = {
        title: name,
        slug,
        description,
        price: priceNum,
        imageCover,
        images: restImages,
        category: rowCategoryId,
        brand: brandId,
        store: storeId,
        productUrl: url || undefined,
        sizes,
        colors,
        currency: "USD",
      };

      if (doWrite) {
        await upsertProduct(doc);
        inserted += 1;
        console.log(
          `Upserted line ${lineNo}: title="${doc.title}", price=${doc.price}, url=${doc.productUrl || "N/A"}, images=${doc.images.length}, category=${rowCategoryId || rowCategoryName || defaultCategoryName}`
        );
      }

      processed += 1;

      if (args.dryRun) {
        const preview = {
          line: lineNo,
          title: doc.title,
          price: doc.price,
          productUrl: doc.productUrl || null,
          imagesCount: doc.images.length,
          category: rowCategoryName || (categoryId ? "[fixed category id]" : defaultCategoryName),
          store: storeId ? "[fixed store id]" : (args.storeName || "SHEIN"),
          brand: brandName || null,
          sizesCount: Array.isArray(doc.sizes) ? doc.sizes.length : 0,
          colorsCount: Array.isArray(doc.colors) ? doc.colors.length : 0,
        };
        console.log("Row:", JSON.stringify(preview));
      }

      if (processed % 500 === 0) {
        console.log(`Processed ${processed} lines... Inserted/Updated: ${inserted}, Errors/Skipped: ${errors}`);
      }
    } catch (e) {
      errors += 1;
      console.error(`Error at line ${lineNo}: ${e && e.stack ? e.stack : e && e.message ? e.message : e}`);
    }
  }

  console.log(`\nDone. Lines processed: ${processed}. Inserted/Updated: ${inserted}. Errors/Skipped: ${errors}.`);
  if (doWrite) {
    await mongoose.disconnect();
  }
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
