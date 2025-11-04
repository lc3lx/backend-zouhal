from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoModelForCausalLM, AutoTokenizer
from transformers import BitsAndBytesConfig
import torch
import json
import os
import logging
import redis
from langdetect import detect
import requests
from datetime import datetime
import re
import time

# إعداد التسجيل
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=['http://localhost:3000', 'http://localhost:3001', 'https://www.zuhall.com', 'https://zuhall.com'])

# إعداد Redis للتخزين المؤقت (آمن مع منفذ افتراضي 6379)
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
try:
    cache = redis.Redis(host=os.getenv('REDIS_HOST', 'localhost'), port=REDIS_PORT, db=0)
except Exception as e:
    logger.warning(f"Redis init failed: {e}")
    cache = None

# إعدادات النموذج وAPI
DEFAULT_MODEL = os.getenv('AI_MODEL', 'Qwen/Qwen2.5-14B-Instruct')  # نموذج قوي لأداء خارق
ZUHALL_BASE = os.getenv('ZUHALL_BASE', 'https://www.zuhall.com')

# كاش للمتجر داخل العملية لتقليل نداءات الشبكة
SHOP_CACHE = None
SHOP_CACHE_TS = 0.0
SHOP_CACHE_TTL = int(os.getenv('SHOP_CACHE_TTL', '60'))

# فحص توفر مكتبة bitsandbytes للاستخدام 4-بت
try:
    import bitsandbytes as _bnb  # type: ignore
    HAS_BNB = True
except Exception:
    HAS_BNB = False

# تحميل النموذج مع سلال فشل ذكية + 4-بت اختياري على GPU
def load_model():
    try:
        use_gpu = torch.cuda.is_available()
        device_map = 'auto' if use_gpu else 'cpu'
        dtype = torch.float16 if use_gpu else torch.float32
        quantization_config = BitsAndBytesConfig(load_in_4bit=True) if (use_gpu and HAS_BNB) else None

        candidates = []
        env_model = os.getenv('AI_MODEL')
        if env_model:
            candidates.append(env_model)
        if use_gpu:
            candidates += [
                'Qwen/Qwen2.5-14B-Instruct',
                'Qwen/Qwen2.5-7B-Instruct',
                'Qwen/Qwen2.5-3B-Instruct',
                'Qwen/Qwen2.5-1.5B-Instruct',
            ]
        else:
            candidates += [
                os.getenv('AI_MODEL_CPU', 'Qwen/Qwen2.5-1.5B-Instruct'),
                'Qwen/Qwen2.5-0.5B-Instruct',
            ]

        last_err = None
        for mid in candidates:
            try:
                logger.info(f"Loading model: {mid} on {device_map} (4-bit={'on' if quantization_config else 'off'})")
                tok = AutoTokenizer.from_pretrained(mid, use_fast=True)
                mdl = AutoModelForCausalLM.from_pretrained(
                    mid,
                    device_map=device_map,
                    torch_dtype=dtype,
                    quantization_config=quantization_config,
                    low_cpu_mem_usage=True,
                )
                mdl.eval()
                logger.info(f"Model loaded successfully: {mid}")
                return tok, mdl
            except Exception as e:
                last_err = e
                logger.warning(f"Failed to load model {mid}: {e}")
                continue
        logger.error(f"All candidate models failed to load: {last_err}")
        return None, None
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return None, None

tokenizer, model = load_model()
MODEL_NAME = DEFAULT_MODEL if model else "None"

# Enhanced System Prompt for intelligent sales assistant
ZUHALL_SALES_SYSTEM_PROMPT = """
أنت زحل AI، مساعد مبيعات ذكي وخارق في متجر Zuhall الإلكتروني. أنت خبير في فهم طلبات العملاء وتقديم حلول ذكية.

القواعد الأساسية:
1. **الذكاء السياقي**: فهم الطلبات الضمنية والصريحة، تذكر تفضيلات العميل
2. **عدم الإزعاج**: لا تعرض منتجات إلا عند الطلب أو الإشارة الواضحة
3. **الردود الذكية**: عند عدم وجود نتائج، اقترح بدائل ذكية
4. **الأسلوب الطبيعي**: لهجة سعودية ودودة، تجنب العبارات الآلية

أنواع الطلبات:
- **صريح**: "ابحث عن", "أرني", "عرض لي" → اعرض المنتجات مباشرة
- **ضمني**: "بدي موبايل", "محتاج لابتوب" → اعرض المنتجات مع توضيح
- **عام**: "شو عندكم؟" → اسأل توضيحي أو اعرض الأكثر شعبية
- **مقارنة**: "قارن بين" → اطلب أرقام المنتجات للمقارنة

عند عدم وجود نتائج:
- اقترح منتجات مشابهة من نفس التصنيف
- اقترح منتجات بسعر قريب
- اسأل توضيحي: "قصدك [X] ولا [Y]؟"

أمثلة ذكية:
المستخدم: "بدي موبايل رخيص"
أنت: "على عيني! إليك أفضل الخيارات:\n1) موبايل A — 150$، تقييم 4.5⭐\n2) موبايل B — 120$، خصم 25%\nتحب نركّز على الكاميرا ولا البطارية؟"

المستخدم: "شو رأيك فيه؟" (بعد عرض منتج)
أنت: "هذا المنتج ممتاز! تقييم عالي ومراجعات إيجابية. تحب تشوف منتجات مشابهة؟"

المستخدم: "ما في شي بهالسعر"
أنت: "للأسف ما لقيت بهالسعر. بس عندنا خيارات قريبة:\n1) منتج A — 180$ (بدل 200$)\n2) منتج B — 220$ (خصم 15%)\nتبغى تزيد الميزانية شوية؟"
"""

# English system prompt for international users
ENG_SALES_SYSTEM_PROMPT = """
You are Zuhall AI, an intelligent sales assistant for Zuhall e-commerce store. You're an expert at understanding customer requests and providing smart solutions.

Core Rules:
1. **Contextual Intelligence**: Understand implicit and explicit requests, remember customer preferences
2. **No Spam**: Only show products when requested or clearly indicated
3. **Smart Responses**: When no results, suggest smart alternatives
4. **Natural Style**: Friendly tone, avoid robotic phrases

Request Types:
- **Explicit**: "search for", "show me", "find" → show products directly
- **Implicit**: "need phone", "want laptop" → show products with explanation
- **General**: "what do you have?" → ask clarifying questions or show popular items
- **Comparison**: "compare" → ask for product numbers to compare

When no results:
- Suggest similar products from same category
- Suggest products with similar price
- Ask clarifying: "Did you mean [X] or [Y]?"

Smart Examples:
User: "need cheap phone"
You: "Got you! Here are the best options:\n1) Phone A — $150, 4.5⭐ rating\n2) Phone B — $120, 25% off\nWant to focus on camera or battery?"

User: "what do you think?" (after showing product)
You: "This product is excellent! High ratings and positive reviews. Want to see similar products?"

User: "nothing at this price"
You: "Sorry, nothing at that price. But here are close alternatives:\n1) Product A — $180 (instead of $200)\n2) Product B — $220 (15% off)\nWant to increase budget slightly?"
"""

# جلب سياق المتجر
def _fetch_shop_safe(url: str):
    try:
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.error(f"Failed to fetch {url}: {e}")
        return None

def get_shop_context_zuhall():
    global SHOP_CACHE, SHOP_CACHE_TS
    now = time.time()
    if SHOP_CACHE and (now - SHOP_CACHE_TS) < SHOP_CACHE_TTL:
        return SHOP_CACHE
    products = _fetch_shop_safe(f"{ZUHALL_BASE}/api/v1/products?limit=50")
    categories = _fetch_shop_safe(f"{ZUHALL_BASE}/api/v1/categories?limit=100")
    brands = _fetch_shop_safe(f"{ZUHALL_BASE}/api/v1/brands?limit=100")
    data = {
        "products": products.get("data", []) if isinstance(products, dict) else [],
        "categories": categories.get("data", []) if isinstance(categories, dict) else [],
        "brands": brands.get("data", []) if isinstance(brands, dict) else [],
    }
    SHOP_CACHE, SHOP_CACHE_TS = data, now
    return data

# Enhanced intent detection with implicit/explicit request detection
def detect_sales_intent(message: str) -> tuple[str, dict]:
    m = message.strip().lower()
    intent = "info"
    preferences = {}
    
    # Explicit request indicators
    explicit_indicators = ["ابحث", "أرني", "عرض", "أظهر", "أريد", "بدي", "محتاج", "search", "show", "find", "want", "need"]
    implicit_indicators = ["موبايل", "جوال", "لابتوب", "سماعات", "هاتف", "phone", "laptop", "headphones"]
    
    # Check for explicit requests
    is_explicit = any(indicator in m for indicator in explicit_indicators)
    is_implicit = any(indicator in m for indicator in implicit_indicators)
    
    # Price-related intent
    if any(w in m for w in ["ميزانية", "سعر", "كم", "رخيص", "غالي", "price", "cheap", "expensive", "cost"]):
        intent, preferences["focus"] = "prices", "price"
        nums = re.findall(r"\d{2,6}", m)
        if nums:
            try:
                preferences["budget"] = int(nums[0])
            except Exception:
                pass
    # Deals and offers
    elif any(w in m for w in ["عرض", "عروض", "خصم", "تخفيض", "offer", "deals", "discount", "sale"]):
        intent, preferences["focus"] = "deals", "discount"
    # Categories
    elif any(w in m for w in ["تصنيف", "تصنيفات", "فئات", "قسم", "category", "categories"]):
        intent = "categories"
    # Brands
    elif any(w in m for w in ["ماركة", "ماركات", "براند", "brand", "brands"]):
        intent = "brands"
    # Product browsing (implicit or explicit)
    elif is_implicit or is_explicit:
        intent, preferences["focus"] = "browse", "product"
        # Extract product type
        if any(w in m for w in ["موبايل", "جوال", "هاتف", "phone", "mobile"]):
            preferences["product_type"] = "phone"
        elif any(w in m for w in ["لابتوب", "كمبيوتر", "laptop", "computer"]):
            preferences["product_type"] = "laptop"
        elif any(w in m for w in ["سماعات", "سماعة", "headphones", "earbuds"]):
            preferences["product_type"] = "headphones"
    # Complaints
    elif any(w in m for w in ["مشكلة", "شكوى", "سيء", "غلط", "مش عاجبني", "complaint", "problem", "bad"]):
        intent = "complaint"
    # Comparison requests
    elif any(w in m for w in ["قارن", "مقارنة", "فرق", "compare", "comparison", "difference"]):
        intent = "compare"
    
    # Set request type
    preferences["request_type"] = "explicit" if is_explicit else "implicit" if is_implicit else "general"
    
    return intent, preferences

# Check if message is an implicit product request
def is_implicit_product_request(message: str) -> bool:
    m = message.strip().lower()
    implicit_indicators = [
        "بدي", "محتاج", "أريد", "أبحث عن", "أرني", "عرض", "أظهر",
        "موبايل", "جوال", "لابتوب", "سماعات", "هاتف",
        "phone", "laptop", "headphones", "mobile"
    ]
    return any(indicator in m for indicator in implicit_indicators)

# Extract user preferences from message
def extract_preferences(message: str) -> dict:
    m = message.strip().lower()
    preferences = {}
    
    # Extract budget
    budget_patterns = [
        r"ميزانية\s*(\d+)", r"سعر\s*(\d+)", r"بدي\s*(\d+)", r"محتاج\s*(\d+)",
        r"budget\s*(\d+)", r"price\s*(\d+)", r"under\s*(\d+)", r"less\s*than\s*(\d+)"
    ]
    for pattern in budget_patterns:
        match = re.search(pattern, m)
        if match:
            preferences["budget"] = int(match.group(1))
            break
    
    # Extract brand preferences
    brand_indicators = ["سامسونج", "أبل", "هواوي", "شاومي", "samsung", "apple", "huawei", "xiaomi"]
    for brand in brand_indicators:
        if brand in m:
            preferences["brand"] = brand
            break
    
    # Extract product specifications
    if "كاميرا" in m or "camera" in m:
        preferences["specs"] = preferences.get("specs", []) + ["camera"]
    if "بطارية" in m or "battery" in m:
        preferences["specs"] = preferences.get("specs", []) + ["battery"]
    if "شاشة" in m or "screen" in m:
        preferences["specs"] = preferences.get("specs", []) + ["screen"]
    
    return preferences

# Advanced intelligent search engine
def extract_search_criteria(message: str) -> dict:
    """Extract search criteria from user message using NLP"""
    m = message.lower()
    criteria = {
        "keywords": [],
        "price_range": None,
        "brand": None,
        "category": None,
        "specs": []
    }
    
    # Extract keywords with synonyms
    synonyms = {
        "موبايل": ["جوال", "هاتف", "موبايل", "phone", "mobile", "smartphone"],
        "لابتوب": ["لابتوب", "كمبيوتر", "laptop", "computer", "notebook"],
        "سماعات": ["سماعات", "سماعة", "headphones", "earbuds", "earphones"],
        "كاميرا": ["كاميرا", "camera", "تصوير", "photo"],
        "بطارية": ["بطارية", "battery", "شحن", "charge"],
        "شاشة": ["شاشة", "screen", "عرض", "display"]
    }
    
    for main_word, word_list in synonyms.items():
        if any(word in m for word in word_list):
            criteria["keywords"].extend(word_list)
    
    # Extract price range
    price_patterns = [
        r"(\d+)\s*-\s*(\d+)",  # range like "100-200"
        r"تحت\s*(\d+)", r"under\s*(\d+)",  # under X
        r"أقل\s*من\s*(\d+)", r"less\s*than\s*(\d+)",  # less than X
        r"أكثر\s*من\s*(\d+)", r"more\s*than\s*(\d+)"  # more than X
    ]
    
    for pattern in price_patterns:
        match = re.search(pattern, m)
        if match:
            if "تحت" in pattern or "under" in pattern or "أقل" in pattern or "less" in pattern:
                criteria["price_range"] = {"max": int(match.group(1))}
            elif "أكثر" in pattern or "more" in pattern:
                criteria["price_range"] = {"min": int(match.group(1))}
            else:
                criteria["price_range"] = {"min": int(match.group(1)), "max": int(match.group(2))}
            break
    
    # Extract brand
    brand_indicators = ["سامسونج", "أبل", "هواوي", "شاومي", "samsung", "apple", "huawei", "xiaomi", "sony", "lg"]
    for brand in brand_indicators:
        if brand in m:
            criteria["brand"] = brand
            break
    
    return criteria

def smart_product_search(message: str, ctx: dict) -> list:
    """Advanced semantic search with NLP"""
    criteria = extract_search_criteria(message)
    products = ctx.get("products", [])
    
    if not products:
        return []
    
    # Filter by keywords (semantic search)
    if criteria["keywords"]:
        filtered_products = []
        for product in products:
            title = product.get("title", "").lower()
            description = product.get("description", "").lower()
            
            # Check if any keyword matches title or description
            for keyword in criteria["keywords"]:
                if keyword in title or keyword in description:
                    filtered_products.append(product)
                    break
        
        if filtered_products:
            products = filtered_products
    
    # Filter by price range
    if criteria["price_range"]:
        price_filtered = []
        for product in products:
            price = product.get("priceAfterDiscount") or product.get("price", 0)
            if not price:
                continue
                
            if criteria["price_range"].get("min") and price < criteria["price_range"]["min"]:
                continue
            if criteria["price_range"].get("max") and price > criteria["price_range"]["max"]:
                continue
                
            price_filtered.append(product)
        
        if price_filtered:
            products = price_filtered
    
    # Filter by brand
    if criteria["brand"]:
        brand_filtered = []
        for product in products:
            title = product.get("title", "").lower()
            if criteria["brand"].lower() in title:
                brand_filtered.append(product)
        
        if brand_filtered:
            products = brand_filtered
    
    # Rank by relevance
    return rank_products_by_relevance(products, criteria)

def rank_products_by_relevance(products: list, criteria: dict) -> list:
    """Rank products by relevance to search criteria"""
    if not products:
        return []
    
    # Score each product
    scored_products = []
    for product in products:
        score = 0
        title = product.get("title", "").lower()
        description = product.get("description", "").lower()
        
        # Keyword matching score
        for keyword in criteria.get("keywords", []):
            if keyword in title:
                score += 3  # Title match is more important
            elif keyword in description:
                score += 1  # Description match
        
        # Price relevance (closer to budget is better)
        if criteria.get("price_range"):
            price = product.get("priceAfterDiscount") or product.get("price", 0)
            if price:
                if criteria["price_range"].get("min") and criteria["price_range"].get("max"):
                    target_price = (criteria["price_range"]["min"] + criteria["price_range"]["max"]) / 2
                    score += max(0, 2 - abs(price - target_price) / target_price)
        
        # Popularity score (sold quantity and ratings)
        sold = product.get("sold", 0)
        ratings = product.get("ratingsAverage", 0)
        score += min(2, sold / 10)  # Cap at 2 points
        score += ratings * 0.4  # Ratings contribute to score
        
        scored_products.append((product, score))
    
    # Sort by score (descending) and return top products
    scored_products.sort(key=lambda x: x[1], reverse=True)
    return [p[0] for p in scored_products[:10]]

def find_similar_products(target_product: dict, ctx: dict, limit: int = 5) -> list:
    """Find products similar to the target product"""
    if not target_product:
        return []
    
    products = ctx.get("products", [])
    if not products:
        return []
    
    # Get target product attributes
    target_title = target_product.get("title", "").lower()
    target_price = target_product.get("priceAfterDiscount") or target_product.get("price", 0)
    target_category = target_product.get("category", {})
    target_brand = target_product.get("brand", {})
    
    similar_products = []
    
    for product in products:
        if product.get("_id") == target_product.get("_id"):
            continue  # Skip the same product
        
        score = 0
        title = product.get("title", "").lower()
        price = product.get("priceAfterDiscount") or product.get("price", 0)
        
        # Category similarity
        if target_category and product.get("category"):
            if str(target_category.get("_id")) == str(product.get("category", {}).get("_id")):
                score += 3
        
        # Brand similarity
        if target_brand and product.get("brand"):
            if str(target_brand.get("_id")) == str(product.get("brand", {}).get("_id")):
                score += 2
        
        # Price similarity (±20%)
        if target_price and price:
            price_diff = abs(price - target_price) / target_price
            if price_diff <= 0.2:
                score += 2
        
        # Title keyword similarity
        target_words = set(target_title.split())
        product_words = set(title.split())
        common_words = target_words.intersection(product_words)
        if common_words:
            score += len(common_words)
        
        if score > 0:
            similar_products.append((product, score))
    
    # Sort by similarity score and return top results
    similar_products.sort(key=lambda x: x[1], reverse=True)
    return [p[0] for p in similar_products[:limit]]

# Legacy function for backward compatibility
def filter_products_by_query(message: str, ctx: dict) -> list:
    """Legacy function - now uses smart search"""
    return smart_product_search(message, ctx)

# Conversation Context Management System
class ConversationContext:
    def __init__(self):
        self.user_preferences = {}
        self.last_products = []
        self.last_categories = []
        self.last_brands = []
        self.conversation_history = []
        self.current_budget = None
        self.favorite_brands = []
        self.product_interest = []
    
    def update_context(self, message: str, intent: str, preferences: dict, products: list = None):
        """Update conversation context with new information"""
        # Update user preferences
        if preferences.get("budget"):
            self.current_budget = preferences["budget"]
        if preferences.get("brand"):
            if preferences["brand"] not in self.favorite_brands:
                self.favorite_brands.append(preferences["brand"])
        if preferences.get("product_type"):
            if preferences["product_type"] not in self.product_interest:
                self.product_interest.append(preferences["product_type"])
        
        # Update last viewed items
        if products:
            self.last_products = products[:5]  # Keep last 5 products
        if intent == "categories":
            self.last_categories = preferences.get("categories", [])
        if intent == "brands":
            self.last_brands = preferences.get("brands", [])
        
        # Add to conversation history
        self.conversation_history.append({
            "message": message,
            "intent": intent,
            "timestamp": datetime.now().isoformat()
        })
        
        # Keep only last 10 interactions
        if len(self.conversation_history) > 10:
            self.conversation_history = self.conversation_history[-10:]
    
    def get_context_info(self) -> dict:
        """Get current context information"""
        return {
            "user_preferences": self.user_preferences,
            "last_products": self.last_products,
            "current_budget": self.current_budget,
            "favorite_brands": self.favorite_brands,
            "product_interest": self.product_interest,
            "recent_intents": [h["intent"] for h in self.conversation_history[-3:]]
        }
    
    def resolve_context_references(self, message: str) -> str:
        """Resolve context references in user message"""
        m = message.lower()
        
        # Handle "شو رأيك فيه؟" (what do you think about it?)
        if "شو رأيك" in m or "what do you think" in m:
            if self.last_products:
                return f"شو رأيك في {self.last_products[0].get('title', 'هذا المنتج')}؟"
        
        # Handle "أرني غيره" (show me others)
        if "أرني غيره" in m or "show me others" in m:
            if self.last_products:
                return f"أرني منتجات مشابهة لـ {self.last_products[0].get('title', 'هذا المنتج')}"
        
        # Handle "نفس السعر" (same price)
        if "نفس السعر" in m or "same price" in m:
            if self.current_budget:
                return f"أرني منتجات بنفس السعر {self.current_budget}$"
        
        return message

# Global context storage (in production, use Redis or database)
CONVERSATION_CONTEXTS = {}

def get_or_create_context(session_id: str) -> ConversationContext:
    """Get or create conversation context for session"""
    if session_id not in CONVERSATION_CONTEXTS:
        CONVERSATION_CONTEXTS[session_id] = ConversationContext()
    return CONVERSATION_CONTEXTS[session_id]

def update_context(session_id: str, message: str, intent: str, preferences: dict, products: list = None):
    """Update conversation context"""
    context = get_or_create_context(session_id)
    context.update_context(message, intent, preferences, products)

def get_context_info(session_id: str) -> dict:
    """Get context information for session"""
    context = get_or_create_context(session_id)
    return context.get_context_info()

# تنظيف الردود
def sanitize_response(text: str) -> str:
    replacements = {
        "هل لديك أي مشكلة": "تبغى أساعدك بحل أي مشكلة؟",
        "هل تحتاج مزيد من المعلومات": "تحب أوضح لك شي معين؟",
        "قيمة أكبر": "أفضل قيمة مقابل السعر",
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)
    return text[:400].rsplit(". ", 1)[0] + "..." if len(text) > 400 else text

# بناء الـ Prompt للمبيعات
def build_sales_prompt(message: str, ctx: dict, system_prompt: str):
    cat_list = ", ".join([c.get('name', '') for c in ctx.get("categories", [])[:10]]) or "غير متاح"
    brand_list = ", ".join([b.get('name', '') for b in ctx.get("brands", [])[:10]]) or "غير متاح"
    prod_lines = [f"- {p.get('title', '')} | السعر: {_price_text(p)}" for p in ctx.get("products", [])[:10]]
    prod_list = "\n".join(prod_lines) or "غير متاح"

    system = system_prompt
    user = (
        f"سياق المتجر:\n"
        f"التصنيفات: {cat_list}\n"
        f"الماركات: {brand_list}\n"
        f"عينات منتجات:\n{prod_list}\n\n"
        f"رسالة العميل: {message}"
    )
    return system, user

# توليد رد المبيعات
def hf_generate_sales(system: str, user: str) -> str:
    if not model or not tokenizer:
        return "فيه مشكلة تقنية، بس أقدر أساعدك! قولي وش تبغى وأرشح لك أفضل الخيارات."
    
    cache_key = f"sales:{abs(hash(user))}"
    cached = None
    if cache:
        try:
            cached = cache.get(cache_key)
        except Exception as e:
            logger.warning(f"Cache get failed: {e}")
    if cached:
        logger.info("Returning cached response")
        return cached.decode('utf-8')
    
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([prompt], return_tensors="pt").to(model.device)
    
    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=60,  # قصير لسرعة وذكاء
            do_sample=False,
            repetition_penalty=1.2,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    
    gen_ids = outputs[0]
    input_len = inputs["input_ids"].shape[1]
    text = tokenizer.decode(gen_ids[input_len:], skip_special_tokens=True).strip()
    text = sanitize_response(text)
    if cache:
        try:
            cache.setex(cache_key, 7200, text)  # تخزين لمدة ساعتين
        except Exception as e:
            logger.warning(f"Cache set failed: {e}")
    return text

# Enhanced response formatting with smart no-results handling
def format_no_results_response(intent: str, preferences: dict, ctx: dict, lang: str = 'ar') -> str:
    """Generate smart response when no products are found"""
    if lang == 'ar':
        responses = {
            "browse": "للأسف ما لقيت منتجات تطابق طلبك. بس عندنا خيارات مشابهة ممكن تعجبك:",
            "prices": "ما في منتجات بهالسعر المطلوب. جرب تزيد الميزانية شوية أو شوف هالبدائل:",
            "deals": "ما في عروض حالياً تطابق طلبك. بس شوف هالمنتجات الرائجة:",
            "categories": "هالتصنيف فارغ حالياً. شوف التصنيفات التانية المتاحة:",
            "brands": "ما في منتجات من هالماركة. جرب ماركات تانية:"
        }
    else:
        responses = {
            "browse": "Sorry, no products match your request. But here are some similar options:",
            "prices": "No products at that price. Try increasing your budget or check these alternatives:",
            "deals": "No current deals match your request. But here are some popular items:",
            "categories": "This category is empty. Check other available categories:",
            "brands": "No products from that brand. Try other brands:"
        }
    
    base_response = responses.get(intent, responses["browse"])
    
    # Add alternative suggestions
    suggestions = []
    if intent in ("browse", "prices", "deals"):
        # Suggest popular products
        popular = get_popular_products(ctx, 3)
        if popular:
            suggestions.extend(popular)
        # Suggest trending deals
        trending = get_trending_deals(ctx, 2)
        if trending:
            suggestions.extend(trending)
    elif intent == "categories":
        # Suggest available categories
        categories = ctx.get("categories", [])[:5]
        suggestions = categories
    elif intent == "brands":
        # Suggest available brands
        brands = ctx.get("brands", [])[:5]
        suggestions = brands
    
    return base_response, suggestions

def compose_sales_reply(model_text: str, ctx: dict, intent: str, preferences: dict, product_candidates: list, lang: str = 'ar') -> str:
    opener = sanitize_response(model_text).splitlines()[0].strip()
    if len(opener) < 3:
        if lang == 'ar':
            opener = "هلا! جاهز أساعدك بأفضل المنتجات."
        else:
            opener = "Hi! I can help you pick great options."
    lines = [opener]
    
    # Handle different intents with smart product selection
    if intent in ("browse", "deals", "prices"):
        # Use smart search results if available
        if product_candidates:
            picks = product_candidates[:3]
        else:
            # Fallback to popular/trending products
            if intent == "deals":
                picks = get_trending_deals(ctx, 3)
            else:
                picks = get_popular_products(ctx, 3)
        
        if picks:
            lines.append("إليك أفضل الخيارات:" if lang == 'ar' else "Here are some top picks:")
            for i, p in enumerate(picks, 1):
                price_txt = _price_text(p)
                if lang == 'ar':
                    lines.append(f"{i}) {p.get('title','')} — السعر: {price_txt}")
                else:
                    lines.append(f"{i}) {p.get('title','')} — price: {price_txt}")
        else:
            # No results - provide smart alternatives
            no_results_msg, suggestions = format_no_results_response(intent, preferences, ctx, lang)
            lines.append(no_results_msg)
            if suggestions and len(suggestions) > 0:
                for i, item in enumerate(suggestions[:3], 1):
                    if isinstance(item, dict) and 'title' in item:  # Product
                        price_txt = _price_text(item)
                        lines.append(f"{i}) {item.get('title','')} — السعر: {price_txt}")
                    elif isinstance(item, dict) and 'name' in item:  # Category/Brand
                        lines.append(f"{i}) {item.get('name','')}")
    
    elif intent == "categories":
        cat_txt = ", ".join([c.get('name','') for c in ctx.get("categories", [])[:8]])
        if cat_txt:
            lines.append(("التصنيفات المتاحة: " + cat_txt) if lang == 'ar' else ("Available categories: " + cat_txt))
        else:
            lines.append("ما في تصنيفات متاحة حالياً" if lang == 'ar' else "No categories available")
    
    elif intent == "brands":
        br_txt = ", ".join([b.get('name','') for b in ctx.get("brands", [])[:8]])
        if br_txt:
            lines.append(("الماركات عندنا: " + br_txt) if lang == 'ar' else ("Available brands: " + br_txt))
        else:
            lines.append("ما في ماركات متاحة حالياً" if lang == 'ar' else "No brands available")
    
    elif intent == "compare":
        lines.append("أرسل لي أرقام المنتجات اللي تبي تقارن بينها (مثل: 1,2,3)" if lang == 'ar' else "Send me the product numbers you want to compare (like: 1,2,3)")
    
    elif intent == "complaint":
        lines.append("آسفين على أي إزعاج! قولي وش المشكلة بالضبط وأضبّطها لك فوراً." if lang == 'ar' else "Sorry for the trouble! Tell me what went wrong and I'll fix it right away.")
    
    # Add smart closing based on context
    lines.append(format_sales_closing(intent, preferences, lang))
    return "\n".join(lines)

def _price_text(p: dict) -> str:
    pad = p.get("priceAfterDiscount")
    pr = p.get("price")
    return f"{pad}$ (خصم من {pr}$)" if pad and pr and pad < pr else f"{pr}$" if pr else "غير متاح"

def get_popular_products(ctx: dict, limit: int = 5) -> list:
    """Get popular products based on sales and ratings"""
    products = ctx.get("products", [])
    if not products:
        return []
    
    # Score products by popularity
    scored_products = []
    for product in products:
        score = 0
        sold = product.get("sold", 0)
        ratings = product.get("ratingsAverage", 0)
        ratings_count = product.get("ratingsQuantity", 0)
        
        # Sales score (higher is better)
        score += min(5, sold / 5)  # Cap at 5 points
        
        # Rating score (higher ratings are better)
        if ratings > 0:
            score += ratings * 0.5
        
        # Rating count score (more reviews = more reliable)
        score += min(2, ratings_count / 10)  # Cap at 2 points
        
        scored_products.append((product, score))
    
    # Sort by popularity score
    scored_products.sort(key=lambda x: x[1], reverse=True)
    return [p[0] for p in scored_products[:limit]]

def get_trending_deals(ctx: dict, limit: int = 5) -> list:
    """Get trending deals (products with good discounts)"""
    products = ctx.get("products", [])
    if not products:
        return []
    
    trending_products = []
    for product in products:
        price = product.get("price", 0)
        discount_price = product.get("priceAfterDiscount", 0)
        
        # Only include products with actual discounts
        if discount_price and discount_price < price:
            discount_percentage = ((price - discount_price) / price) * 100
            trending_products.append((product, discount_percentage))
    
    # Sort by discount percentage (highest first)
    trending_products.sort(key=lambda x: x[1], reverse=True)
    return [p[0] for p in trending_products[:limit]]

def personalized_recommendations(ctx: dict, user_preferences: dict, limit: int = 5) -> list:
    """Get personalized recommendations based on user preferences"""
    products = ctx.get("products", [])
    if not products:
        return []
    
    # If no preferences, return popular products
    if not user_preferences:
        return get_popular_products(ctx, limit)
    
    scored_products = []
    for product in products:
        score = 0
        title = product.get("title", "").lower()
        price = product.get("priceAfterDiscount") or product.get("price", 0)
        
        # Brand preference match
        if user_preferences.get("brand"):
            if user_preferences["brand"].lower() in title:
                score += 3
        
        # Product type preference match
        if user_preferences.get("product_type"):
            product_type = user_preferences["product_type"]
            if product_type == "phone" and any(word in title for word in ["phone", "mobile", "موبايل", "جوال"]):
                score += 2
            elif product_type == "laptop" and any(word in title for word in ["laptop", "computer", "لابتوب", "كمبيوتر"]):
                score += 2
            elif product_type == "headphones" and any(word in title for word in ["headphone", "earbud", "سماعات", "سماعة"]):
                score += 2
        
        # Budget preference match
        if user_preferences.get("budget") and price:
            budget = user_preferences["budget"]
            price_diff = abs(price - budget) / budget
            if price_diff <= 0.2:  # Within 20% of budget
                score += 2
        
        # Add base popularity score
        sold = product.get("sold", 0)
        ratings = product.get("ratingsAverage", 0)
        score += min(2, sold / 10) + (ratings * 0.3)
        
        scored_products.append((product, score))
    
    # Sort by personalized score
    scored_products.sort(key=lambda x: x[1], reverse=True)
    return [p[0] for p in scored_products[:limit]]

def compare_products(product_ids: list, ctx: dict) -> dict:
    """Compare multiple products side by side"""
    products = ctx.get("products", [])
    if not products:
        return {"error": "No products available"}
    
    # Find products by IDs
    comparison_products = []
    for product in products:
        if str(product.get("_id")) in product_ids:
            comparison_products.append(product)
    
    if len(comparison_products) < 2:
        return {"error": "Need at least 2 products to compare"}
    
    # Create comparison data
    comparison_data = {
        "products": [],
        "summary": {
            "cheapest": None,
            "most_rated": None,
            "best_discount": None
        }
    }
    
    cheapest_price = float('inf')
    highest_rating = 0
    best_discount = 0
    
    for product in comparison_products:
        price = product.get("priceAfterDiscount") or product.get("price", 0)
        discount_price = product.get("priceAfterDiscount", 0)
        original_price = product.get("price", 0)
        discount_percentage = 0
        
        if discount_price and original_price:
            discount_percentage = ((original_price - discount_price) / original_price) * 100
        
        product_data = {
            "id": product.get("_id"),
            "title": product.get("title", ""),
            "price": price,
            "original_price": original_price,
            "discount_percentage": discount_percentage,
            "rating": product.get("ratingsAverage", 0),
            "ratings_count": product.get("ratingsQuantity", 0),
            "sold": product.get("sold", 0),
            "description": product.get("description", "")[:100] + "..." if len(product.get("description", "")) > 100 else product.get("description", "")
        }
        
        comparison_data["products"].append(product_data)
        
        # Track best values
        if price < cheapest_price:
            cheapest_price = price
            comparison_data["summary"]["cheapest"] = product.get("title", "")
        
        if product.get("ratingsAverage", 0) > highest_rating:
            highest_rating = product.get("ratingsAverage", 0)
            comparison_data["summary"]["most_rated"] = product.get("title", "")
        
        if discount_percentage > best_discount:
            best_discount = discount_percentage
            comparison_data["summary"]["best_discount"] = product.get("title", "")
    
    return comparison_data

def format_comparison_table(comparison_data: dict) -> str:
    """Format product comparison as a readable table"""
    if "error" in comparison_data:
        return comparison_data["error"]
    
    products = comparison_data["products"]
    if not products:
        return "لا توجد منتجات للمقارنة"
    
    # Create table header
    table = "📊 مقارنة المنتجات:\n\n"
    table += "| المنتج | السعر | التقييم | الخصم |\n"
    table += "|--------|-------|---------|-------|\n"
    
    for product in products:
        title = product["title"][:20] + "..." if len(product["title"]) > 20 else product["title"]
        price = f"${product['price']}"
        rating = f"{product['rating']:.1f}⭐" if product['rating'] > 0 else "لا يوجد"
        discount = f"{product['discount_percentage']:.0f}%" if product['discount_percentage'] > 0 else "لا يوجد"
        
        table += f"| {title} | {price} | {rating} | {discount} |\n"
    
    # Add summary
    summary = comparison_data["summary"]
    table += f"\n🏆 الأرخص: {summary['cheapest']}\n"
    table += f"⭐ الأعلى تقييماً: {summary['most_rated']}\n"
    if summary['best_discount']:
        table += f"💰 أفضل خصم: {summary['best_discount']}\n"
    
    return table

def _pick_top_products(ctx: dict, n: int, candidates: list, budget: int = None) -> list:
    prods = candidates or ctx.get("products", [])
    prods = [p for p in prods if p.get("title")]
    if budget:
        prods = [p for p in prods if isinstance(p.get("priceAfterDiscount", p.get("price")), (int, float)) and p.get("priceAfterDiscount", p.get("price")) <= budget]
    def price_of(p):
        return p.get("priceAfterDiscount", p.get("price", 10**9))
    return sorted(prods, key=price_of)[:n]

def format_sales_closing(intent: str, preferences: dict, lang: str = 'ar') -> str:
    if lang == 'ar':
        closings = {
            "browse": "تحب نركّز على المواصفات، السعر، ولا شي ثاني؟",
            "deals": "تبغى عروض أكثر ولا نختار فئة معينة؟",
            "prices": "وش ميزانيتك بالضبط عشان أرشح لك الأفضل؟",
            "categories": "تبغى أرشح لك منتجات من تصنيف معين؟",
            "brands": "أي ماركة تفضّل نشوف منتجاتها؟",
            "complaint": "قلّي وش المشكلة وأحلها لك بسرعة!",
        }
        return closings.get(intent, "وش تبغى نشوف لك الحين؟")
    else:
        closings_en = {
            "browse": "Should we focus on specs, price, or something else?",
            "deals": "Want more deals or a specific category?",
            "prices": "What’s your budget so I can tailor the picks?",
            "categories": "Want me to recommend items from a category?",
            "brands": "Which brand should we focus on?",
            "complaint": "Tell me the issue and I’ll sort it out fast!",
        }
        return closings_en.get(intent, "What would you like me to show you next?")

# اقتراحات ديناميكية
def get_dynamic_suggestions(ctx: dict, intent: str, lang: str = 'ar') -> list:
    suggestions = []
    if lang == 'ar':
        if intent == "categories":
            suggestions = [f"أرني منتجات {c.get('name')}" for c in ctx.get("categories", [])[:3]]
        elif intent in ("browse", "deals"):
            suggestions = [f"تفاصيل {p.get('title')}" for p in ctx.get("products", [])[:2]]
            suggestions.append("عروض اليوم")
        elif intent == "prices":
            suggestions = ["أرخص المنتجات", "عروض مخفّضة", "منتجات حسب ميزانيتي"]
        else:
            suggestions = ["أفضل العروض", "تصنيفات المنتجات", "أحدث الماركات"]
        return suggestions or ["عروض اليوم", "أرني التصنيفات"]
    else:
        if intent == "categories":
            suggestions = [f"Show {c.get('name')} products" for c in ctx.get("categories", [])[:3]]
        elif intent in ("browse", "deals"):
            suggestions = [f"Details: {p.get('title')}" for p in ctx.get("products", [])[:2]]
            suggestions.append("Today’s deals")
        elif intent == "prices":
            suggestions = ["Cheapest items", "Discounted deals", "Products by my budget"]
        else:
            suggestions = ["Best deals", "Browse categories", "Latest brands"]
        return suggestions or ["Today’s deals", "Show categories"]

# Enhanced chat endpoint with all new features
@app.route('/api/ai/chat', methods=['POST'])
def api_ai_chat():
    try:
        data = request.json or {}
        user_message = data.get('message', '').strip()
        session_id = data.get('session_id', 'default')  # For context management
        
        if not user_message:
            return jsonify({"error": "message is required"}), 400

        # كشف اللغة
        try:
            lang = detect(user_message)
        except Exception:
            lang = 'ar'
        system_prompt = ZUHALL_SALES_SYSTEM_PROMPT if lang == "ar" else ENG_SALES_SYSTEM_PROMPT

        # Get context and resolve references
        context = get_or_create_context(session_id)
        resolved_message = context.resolve_context_references(user_message)
        
        ctx = get_shop_context_zuhall()
        intent, preferences = detect_sales_intent(resolved_message)
        
        # Enhanced product search
        include_products = intent in ("browse", "deals", "prices", "compare")
        product_candidates = []
        
        if include_products:
            if intent == "compare":
                # Handle comparison requests
                product_numbers = re.findall(r'\d+', user_message)
                if product_numbers:
                    # This would need product ID mapping in real implementation
                    pass
            else:
                # Use smart search
                product_candidates = smart_product_search(resolved_message, ctx)
                
                # If no results, try similar products
                if not product_candidates and intent in ("browse", "prices"):
                    # Get popular products as fallback
                    product_candidates = get_popular_products(ctx, 5)
        
        # Update conversation context
        update_context(session_id, user_message, intent, preferences, product_candidates)
        
        # دمج تاريخ محادثة قصير لزيادة الإنسانية في الرد
        history = data.get('history') or []
        his_lines = []
        for msg in history[-6:]:
            if not isinstance(msg, dict):
                continue
            role = (msg.get('type') or msg.get('role') or '').lower()
            text = (msg.get('text') or '').strip()
            if not text:
                continue
            if role in ('user','human','client'):
                his_lines.append(f"- العميل: {text}")
            elif role in ('bot','assistant','ai'):
                his_lines.append(f"- المساعد: {text}")
        history_text = "\n".join(his_lines)
        composed_message = resolved_message
        if history_text:
            composed_message = f"الرسائل السابقة (مختصر):\n{history_text}\n\nرسالة العميل الحالية: {resolved_message}"

        # توليد الرد المحسّن
        system, user = build_sales_prompt(composed_message, ctx, system_prompt)
        try:
            text = hf_generate_sales(system, user)
            if intent == "complaint":
                text = ("آسفين جدًا على أي إزعاج! قولي وش المشكلة بالضبط وأحلها لك على طول." if lang == 'ar' 
                        else "Sorry for the trouble! Tell me the issue and I'll fix it right away.")
            text = compose_sales_reply(text, ctx, intent, preferences, product_candidates, lang)
        except Exception as e:
            logger.error(f"Generation error: {e}")
            text = ("فيه مشكلة تقنية، بس أقدر أساعدك! قولي وش تبغى وأرشح لك." if lang == 'ar' 
                    else "Technical hiccup, but I can still help! Tell me what you want and I'll suggest options.")
            text = compose_sales_reply(text, ctx, intent, preferences, product_candidates, lang)

        # Get context info for personalized suggestions
        context_info = get_context_info(session_id)
        
        return jsonify({
            "text": text,
            "products": (product_candidates[:8] if include_products else []),
            "categories": (ctx.get("categories", [])[:12] if intent == "categories" else []),
            "brands": (ctx.get("brands", [])[:12] if intent == "brands" else []),
            "suggestions": get_dynamic_suggestions(ctx, intent, lang),
            "context": context_info,
            "intent": intent,
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.error(f"API error: {e}")
        return jsonify({"error": str(e)}), 500

# Advanced search endpoint
@app.route('/api/ai/search', methods=['POST'])
def api_ai_search():
    try:
        data = request.json or {}
        query = data.get('query', '').strip()
        session_id = data.get('session_id', 'default')
        
        if not query:
            return jsonify({"error": "query is required"}), 400
        
        ctx = get_shop_context_zuhall()
        
        # Use smart search
        results = smart_product_search(query, ctx)
        
        # If no results, get similar products
        if not results:
            # Try to find similar products based on query
            popular_products = get_popular_products(ctx, 5)
            results = popular_products
        
        return jsonify({
            "results": results,
            "total": len(results),
            "query": query,
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.error(f"Search API error: {e}")
        return jsonify({"error": str(e)}), 500

# Product comparison endpoint
@app.route('/api/ai/compare', methods=['POST'])
def api_ai_compare():
    try:
        data = request.json or {}
        product_ids = data.get('product_ids', [])
        
        if not product_ids or len(product_ids) < 2:
            return jsonify({"error": "At least 2 product IDs required"}), 400
        
        ctx = get_shop_context_zuhall()
        comparison_data = compare_products(product_ids, ctx)
        
        if "error" in comparison_data:
            return jsonify(comparison_data), 400
        
        # Format as table
        table = format_comparison_table(comparison_data)
        
        return jsonify({
            "comparison": comparison_data,
            "table": table,
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.error(f"Compare API error: {e}")
        return jsonify({"error": str(e)}), 500

# Similar products endpoint
@app.route('/api/ai/similar', methods=['POST'])
def api_ai_similar():
    try:
        data = request.json or {}
        product_id = data.get('product_id')
        
        if not product_id:
            return jsonify({"error": "product_id is required"}), 400
        
        ctx = get_shop_context_zuhall()
        
        # Find the target product
        target_product = None
        for product in ctx.get("products", []):
            if str(product.get("_id")) == str(product_id):
                target_product = product
                break
        
        if not target_product:
            return jsonify({"error": "Product not found"}), 404
        
        # Find similar products
        similar = find_similar_products(target_product, ctx, 5)
        
        return jsonify({
            "target_product": target_product,
            "similar_products": similar,
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.error(f"Similar products API error: {e}")
        return jsonify({"error": str(e)}), 500

# نقطة نهاية الصحة
@app.route('/api/ai/health', methods=['GET'])
def api_ai_health():
    return jsonify({
        "ok": model is not None,
        "model_name": MODEL_NAME,
        "features": {
            "smart_search": True,
            "context_management": True,
            "product_comparison": True,
            "recommendations": True,
            "nlp_processing": True
        },
        "endpoints": {
            "chat": "/api/ai/chat",
            "search": "/api/ai/search", 
            "compare": "/api/ai/compare",
            "similar": "/api/ai/similar"
        },
        "timestamp": datetime.now().isoformat(),
    })

# نقطة نهاية للاختبار السريع
@app.route('/api/ai/test', methods=['POST'])
def api_ai_test():
    try:
        data = request.json or {}
        test_message = data.get('message', 'مرحبا')
        
        # اختبار سريع بدون تحميل النموذج الكامل
        return jsonify({
            "status": "success",
            "message": "زحل AI يعمل بشكل مثالي! 🤖",
            "test_message": test_message,
            "features_available": [
                "البحث الذكي",
                "إدارة السياق", 
                "مقارنة المنتجات",
                "الاقتراحات الذكية",
                "معالجة اللغة الطبيعية"
            ],
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', '3001'))
    logger.info(f"Starting Zuhall AI Sales Assistant on http://127.0.0.1:{port}")
    logger.info(f"Model: {MODEL_NAME}")
    app.run(host='127.0.0.1', port=port, debug=False)