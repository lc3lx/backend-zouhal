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
CORS(app)

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

# System Prompt لمساعد المبيعات (محسّن للتسويق الذكي)
ZUHALL_SALES_SYSTEM_PROMPT = """
أنت زحل AI، مساعد مبيعات ذكي وخارق في متجر Zuhall الإلكتروني. مهمتك ترويج المنتجات بذكاء، تقديم اقتراحات مخصّصة، ومساعدة العميل بأسلوب ودود.

الأسلوب:
- لهجة سعودية طبيعية، ودودة، ومختصرة (1-3 جمل).
- ركّز على فوائد المنتج (السعر، الخصومات، الميزات).
- قدم اقتراحات مخصّصة بناءً على الميزانية أو التفضيلات.
- إذا كانت الرسالة غامضة، اسأل سؤال ذكي (مثل: "تحب نركّز على السعر ولا المواصفات؟").
- تجنب العبارات الآلية، استخدم بدائل بشرية (مثل: "وش تبغى نشوف لك؟").

أمثلة:
المستخدم: "بدي موبايل رخيص"
أنت: "على عيني! إليك خيارين بسعر زين:\n1) موبايل A — 150$، بطارية تدوم يومين.\n2) موبايل B — 120$، خصم 25%. تحب نركّز على الكاميرا ولا البطارية؟"

المستخدم: "شو عروضكم؟"
أنت: "عندنا عروض نارية! إليك 3 منتجات مخفّضة:\n1) سماعات X — 50$ (خصم 30%).\n2) لابتوب Y — 600$ (هدية مجانية).\nتبغى أركّز على فئة معينة؟"
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

# اكتشاف النية والتفضيلات
def detect_sales_intent(message: str) -> tuple[str, dict]:
    m = message.strip().lower()
    intent = "info"
    preferences = {}
    
    if any(w in m for w in ["ميزانية", "سعر", "كم", "رخيص", "price", "cheap"]):
        intent, preferences["focus"] = "prices", "price"
        nums = re.findall(r"\d{2,6}", m)
        if nums:
            try:
                preferences["budget"] = int(nums[0])
            except Exception:
                pass
    elif any(w in m for w in ["عرض", "عروض", "خصم", "offer", "deals"]):
        intent, preferences["focus"] = "deals", "discount"
    elif any(w in m for w in ["تصنيف", "تصنيفات", "فئات", "category"]):
        intent = "categories"
    elif any(w in m for w in ["ماركة", "ماركات", "براند", "brand"]):
        intent = "brands"
    elif any(w in m for w in ["موبايل", "جوال", "لابتوب", "سماعات", "phone", "laptop"]):
        intent, preferences["focus"] = "browse", "product"
    elif any(w in m for w in ["مشكلة", "شكوى", "سيء", "غلط", "complaint"]):
        intent = "complaint"
    return intent, preferences

# تصفية المنتجات بناءً على الرسالة
def filter_products_by_query(message: str, ctx: dict) -> list:
    m = message.lower()
    products = ctx.get("products", [])
    keywords = []
    if "موبايل" in m or "جوال" in m:
        keywords += ["موبايل", "جوال", "هاتف", "phone", "iphone", "samsung"]
    elif "سماعات" in m:
        keywords += ["سماعة", "سماعات", "earbuds", "headphones"]
    elif "لابتوب" in m:
        keywords += ["لابتوب", "كمبيوتر", "notebook", "laptop"]
    
    for b in ctx.get("brands", []):
        name = b.get("name", "").lower()
        if name in m:
            keywords.append(name)
    
    return [p for p in products if any(kw in p.get("title", "").lower() for kw in keywords)] or products[:10]

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

# تنسيق رد المبيعات
def compose_sales_reply(model_text: str, ctx: dict, intent: str, preferences: dict, product_candidates: list, lang: str = 'ar') -> str:
    opener = sanitize_response(model_text).splitlines()[0].strip()
    if len(opener) < 3:
        if lang == 'ar':
            opener = "هلا! جاهز أساعدك بأفضل المنتجات."
        else:
            opener = "Hi! I can help you pick great options."
    lines = [opener]
    if intent in ("browse", "deals", "prices"):
        picks = _pick_top_products(ctx, 3, product_candidates, preferences.get("budget"))
        if picks:
            lines.append("إليك أفضل الخيارات:" if lang == 'ar' else "Here are some top picks:")
            for i, p in enumerate(picks, 1):
                price_txt = _price_text(p)
                if lang == 'ar':
                    lines.append(f"{i}) {p.get('title','')} — السعر: {price_txt}")
                else:
                    lines.append(f"{i}) {p.get('title','')} — price: {price_txt}")
    elif intent == "categories":
        cat_txt = ", ".join([c.get('name','') for c in ctx.get("categories", [])[:8]])
        lines.append(("التصنيفات المتاحة: " + cat_txt) if lang == 'ar' else ("Available categories: " + cat_txt))
    elif intent == "brands":
        br_txt = ", ".join([b.get('name','') for b in ctx.get("brands", [])[:8]])
        lines.append(("الماركات عندنا: " + br_txt) if lang == 'ar' else ("Available brands: " + br_txt))
    elif intent == "complaint":
        lines.append("آسفين على أي إزعاج! قولي وش المشكلة بالضبط وأضبّطها لك فوراً." if lang == 'ar' else "Sorry for the trouble! Tell me what went wrong and I’ll fix it right away.")
    lines.append(format_sales_closing(intent, preferences, lang))
    return "\n".join(lines)

def _price_text(p: dict) -> str:
    pad = p.get("priceAfterDiscount")
    pr = p.get("price")
    return f"{pad}$ (خصم من {pr}$)" if pad and pr and pad < pr else f"{pr}$" if pr else "غير متاح"

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

# نقطة نهاية المحادثة
@app.route('/api/ai/chat', methods=['POST'])
def api_ai_chat():
    try:
        data = request.json or {}
        user_message = data.get('message', '').strip()
        if not user_message:
            return jsonify({"error": "message is required"}), 400

        # كشف اللغة
        try:
            lang = detect(user_message)
        except Exception:
            lang = 'ar'
        system_prompt = ZUHALL_SALES_SYSTEM_PROMPT if lang == "ar" else ENG_SALES_SYSTEM_PROMPT

        ctx = get_shop_context_zuhall()
        intent, preferences = detect_sales_intent(user_message)
        include_products = intent in ("browse", "deals", "prices")
        product_candidates = filter_products_by_query(user_message, ctx) if include_products else []

        # دمج تاريخ محادثة قصير لزيادة الإنسانية في الرد (اختياري من الواجهة)
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
        composed_message = user_message
        if history_text:
            composed_message = f"الرسائل السابقة (مختصر):\n{history_text}\n\nرسالة العميل الحالية: {user_message}"

        # توليد الرد
        system, user = build_sales_prompt(composed_message, ctx, system_prompt)
        try:
            text = hf_generate_sales(system, user)
            if intent == "complaint":
                text = ("آسفين جدًا على أي إزعاج! قولي وش المشكلة بالضبط وأحلها لك على طول." if lang == 'ar' 
                        else "Sorry for the trouble! Tell me the issue and I’ll fix it right away.")
            text = compose_sales_reply(text, ctx, intent, preferences, product_candidates, lang)
        except Exception as e:
            logger.error(f"Generation error: {e}")
            text = ("فيه مشكلة تقنية، بس أقدر أساعدك! قولي وش تبغى وأرشح لك." if lang == 'ar' 
                    else "Technical hiccup, but I can still help! Tell me what you want and I’ll suggest options.")
            text = compose_sales_reply(text, ctx, intent, preferences, product_candidates, lang)

        return jsonify({
            "text": text,
            "products": (product_candidates[:8] if include_products else []),
            "categories": (ctx.get("categories", [])[:12] if intent == "categories" else []),
            "brands": (ctx.get("brands", [])[:12] if intent == "brands" else []),
            "suggestions": get_dynamic_suggestions(ctx, intent, lang),
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.error(f"API error: {e}")
        return jsonify({"error": str(e)}), 500

# نقطة نهاية الصحة
@app.route('/api/ai/health', methods=['GET'])
def api_ai_health():
    return jsonify({
        "ok": model is not None,
        "model_name": MODEL_NAME,
        "timestamp": datetime.now().isoformat(),
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', '3001'))
    logger.info(f"Starting Zuhall AI Sales Assistant on http://127.0.0.1:{port}")
    logger.info(f"Model: {MODEL_NAME}")
    app.run(host='127.0.0.1', port=port, debug=False)