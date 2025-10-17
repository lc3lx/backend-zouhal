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

# إعداد التسجيل
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# إعداد Redis للتخزين المؤقت
cache = redis.Redis(host=os.getenv('REDIS_HOST', 'localhost'), port=3001, db=0)

# إعدادات النموذج وAPI
DEFAULT_MODEL = os.getenv('AI_MODEL', 'Qwen/Qwen2.5-14B-Instruct')  # نموذج قوي لأداء خارق
ZUHALL_BASE = os.getenv('ZUHALL_BASE', 'https://www.zuhall.com')

# تحميل النموذج باستخدام 4-bit quantization
def load_model():
    try:
        device_map = 'auto' if torch.cuda.is_available() else 'cpu'
        dtype = torch.float16 if device_map != 'cpu' else torch.float32
        quantization_config = BitsAndBytesConfig(load_in_4bit=True) if device_map != 'cpu' else None
        
        logger.info(f"Loading model: {DEFAULT_MODEL} on {device_map}")
        tokenizer = AutoTokenizer.from_pretrained(DEFAULT_MODEL, use_fast=True)
        model = AutoModelForCausalLM.from_pretrained(
            DEFAULT_MODEL,
            device_map=device_map,
            torch_dtype=dtype,
            quantization_config=quantization_config,
            low_cpu_mem_usage=True,
        )
        model.eval()
        logger.info(f"Model loaded successfully: {DEFAULT_MODEL}")
        return tokenizer, model
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
    products = _fetch_shop_safe(f"{ZUHALL_BASE}/api/v1/products?limit=50")  # زيادة الحد لدعم منصة كبيرة
    categories = _fetch_shop_safe(f"{ZUHALL_BASE}/api/v1/categories?limit=100")
    brands = _fetch_shop_safe(f"{ZUHALL_BASE}/api/v1/brands?limit=100")
    return {
        "products": products.get("data", []) if isinstance(products, dict) else [],
        "categories": categories.get("data", []) if isinstance(categories, dict) else [],
        "brands": brands.get("data", []) if isinstance(brands, dict) else [],
    }

# اكتشاف النية والتفضيلات
def detect_sales_intent(message: str) -> tuple[str, dict]:
    m = message.strip().lower()
    intent = "info"
    preferences = {}
    
    if any(w in m for w in ["ميزانية", "سعر", "كم", "رخيص", "price", "cheap"]):
        intent, preferences["focus"] = "prices", "price"
        if any(w in m for w in ["100", "200", "300", "400", "500"]):
            preferences["budget"] = int(m.split()[m.split().index([w for w in m.split() if w.isdigit()][0])])
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
def build_sales_prompt(message: str, ctx: dict):
    cat_list = ", ".join([c.get('name', '') for c in ctx.get("categories", [])[:10]]) or "غير متاح"
    brand_list = ", ".join([b.get('name', '') for b in ctx.get("brands", [])[:10]]) or "غير متاح"
    prod_lines = [f"- {p.get('title', '')} | السعر: {_price_text(p)}" for p in ctx.get("products", [])[:10]]
    prod_list = "\n".join(prod_lines) or "غير متاح"

    system = ZUHALL_SALES_SYSTEM_PROMPT
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
    
    cache_key = f"sales:{user}"
    cached = cache.get(cache_key)
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
    cache.setex(cache_key, 7200, text)  # تخزين لمدة ساعتين
    return text

# تنسيق رد المبيعات
def compose_sales_reply(model_text: str, ctx: dict, intent: str, preferences: dict, product_candidates: list) -> str:
    lines = [sanitize_response(model_text).splitlines()[0].strip() or "هلا! جاهز أساعدك بأفضل المنتجات."]
    if intent in ("browse", "deals", "prices"):
        picks = _pick_top_products(ctx, 3, product_candidates, preferences.get("budget"))
        if picks:
            lines.append("إليك أفضل الخيارات:")
            for i, p in enumerate(picks, 1):
                lines.append(f"{i}) {p.get('title','')} — السعر: {_price_text(p)}")
    elif intent == "categories":
        lines.append("التصنيفات المتاحة: " + ", ".join([c.get('name','') for c in ctx.get("categories", [])[:8]]))
    elif intent == "brands":
        lines.append("الماركات عندنا: " + ", ".join([b.get('name','') for b in ctx.get("brands", [])[:8]]))
    elif intent == "complaint":
        lines.append("آسفين على أي إزعاج! قولي وش المشكلة بالضبط وأضبّطها لك فوراً.")
    
    lines.append(format_sales_closing(intent, preferences))
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

def format_sales_closing(intent: str, preferences: dict) -> str:
    focus = preferences.get("focus")
    closings = {
        "browse": "تحب نركّز على المواصفات، السعر، ولا شي ثاني؟",
        "deals": "تبغى عروض أكثر ولا نختار فئة معينة؟",
        "prices": "وش ميزانيتك بالضبط عشان أرشح لك الأفضل؟",
        "categories": "تبغى أرشح لك منتجات من تصنيف معين؟",
        "brands": "أي ماركة تفضّل نشوف منتجاتها؟",
        "complaint": "قلّي وش المشكلة وأحلها لك بسرعة!",
    }
    return closings.get(intent, "وش تبغى نشوف لك الحين؟")

# اقتراحات ديناميكية
def get_dynamic_suggestions(ctx: dict, intent: str) -> list:
    suggestions = []
    if intent == "categories":
        suggestions = [f"أرني منتجات {c.get('name')}" for c in ctx.get("categories", [])[:3]]
    elif intent == "browse" or intent == "deals":
        suggestions = [f"تفاصيل {p.get('title')}" for p in ctx.get("products", [])[:2]]
        suggestions.append("عروض اليوم")
    elif intent == "prices":
        suggestions = ["أرخص المنتجات", "عروض مخفّضة", "منتجات حسب ميزانيتي"]
    else:
        suggestions = ["أفضل العروض", "تصنيفات المنتجات", "أحدث الماركات"]
    return suggestions or ["عروض اليوم", "أرني التصنيفات"]

# نقطة نهاية المحادثة
@app.route('/api/ai/chat', methods=['POST'])
def api_ai_chat():
    try:
        data = request.json or {}
        user_message = data.get('message', '').strip()
        if not user_message:
            return jsonify({"error": "message is required"}), 400

        # كشف اللغة
        lang = detect(user_message)
        system_prompt = ZUHALL_SALES_SYSTEM_PROMPT if lang == "ar" else """
        You are Zuhall AI, a smart and friendly sales assistant. Respond in natural, concise English, focusing on product benefits and personalized suggestions.
        """

        ctx = get_shop_context_zuhall()
        intent, preferences = detect_sales_intent(user_message)
        include_products = intent in ("browse", "deals", "prices")
        product_candidates = filter_products_by_query(user_message, ctx) if include_products else []

        # توليد الرد
        system, user = build_sales_prompt(user_message, ctx)
        try:
            text = hf_generate_sales(system, user)
            if intent == "complaint":
                text = "آسفين جدًا على أي إزعاج! قولي وش المشكلة بالضبط وأحلها لك على طول."
            text = compose_sales_reply(text, ctx, intent, preferences, product_candidates)
        except Exception as e:
            logger.error(f"Generation error: {e}")
            text = "فيه مشكلة تقنية، بس أقدر أساعدك! قولي وش تبغى وأرشح لك."
            text = compose_sales_reply(text, ctx, intent, preferences, product_candidates)

        return jsonify({
            "text": text,
            "products": ctx.get("products", [])[:8] if include_products else [],
            "categories": ctx.get("categories", [])[:12] if intent == "categories" else [],
            "brands": ctx.get("brands", [])[:12] if intent == "brands" else [],
            "suggestions": get_dynamic_suggestions(ctx, intent),
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