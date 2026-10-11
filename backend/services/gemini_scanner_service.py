import os
import re
import json
import base64
import mimetypes
from datetime import datetime
from pathlib import Path
from backend.config import Config

# Optional GenAI SDK
try:
    from google import genai
    from google.genai import types
    HAS_GENAI_SDK = True
except Exception:
    HAS_GENAI_SDK = False

try:
    import requests
    HAS_REQUESTS = True
except Exception:
    HAS_REQUESTS = False

try:
    from pypdf import PdfReader
    HAS_PYPDF = True
except Exception:
    HAS_PYPDF = False

try:
    import pytesseract
    from PIL import Image
    HAS_PIL = True
except Exception:
    HAS_PIL = False


EXTRACTION_PROMPT = """
You are an expert financial document and invoice parsing AI for business accounting and cash flow tracking.
Carefully examine this image/document (which is an invoice, vendor bill, payment receipt, tax invoice, or purchase order).
Extract all relevant fields and return ONLY a single valid JSON object matching the schema below:

{
  "title": "A clear concise title for the transaction, e.g. 'Vendor Bill - Steel Supplies' or 'Client Invoice - Tech Corp' or 'Electricity Utility Bill'",
  "type": "Income" or "Expense",
  "amount": total numeric amount as float (e.g. 15450.00, must be positive, exclude currency symbols),
  "currency": "INR", "USD", "EUR", etc. (e.g. "INR" or detected currency symbol),
  "transaction_date": "YYYY-MM-DD" (date on the invoice/bill/receipt; if year is 2-digit, expand appropriately; if absent, today's date),
  "due_date": "YYYY-MM-DD" (due date if specified, otherwise null or empty string),
  "category": choose EXACTLY ONE best match from:
    ["Sales Revenue", "Customer Payment", "Service Income", "Other Income", "Inventory Purchase", "Supplier Payment", "Salary", "Rent", "Utilities", "Transportation", "Marketing", "Equipment", "Tax", "Other Expense"],
  "counterparty": "Name of the supplier, vendor, customer or merchant entity",
  "payment_method": choose best match: "Bank Transfer", "UPI", "Cash", "Card", "Cheque", or "Other",
  "payment_status": "Completed" (if marked paid, cash receipt, or settled) or "Pending" (if unpaid bill or due invoice),
  "reference_number": "Invoice number, bill number, voucher number, or txn reference ID",
  "description": "Brief 1-2 sentence description including key items, services, or purpose",
  "tax_amount": float tax/GST amount if present or 0.0,
  "confidence": float between 0.70 and 0.99 indicating extraction certainty
}

Strict Rules:
1. "type": Must be "Expense" for vendor bills, supplies, utilities, receipts of payment made, rent, etc. Must be "Income" for sales invoices, client billings, receivables.
2. "amount": Extract the final Grand Total / Net Payable amount.
3. Return ONLY valid raw JSON without any markdown formatting or ```json wrappers.
"""


class GeminiScannerService:
    @staticmethod
    def get_api_key():
        """Retrieve Gemini API key from environment or config."""
        key = os.getenv('GEMINI_API_KEY', '').strip()
        if not key:
            key = getattr(Config, 'GEMINI_API_KEY', '').strip()
        return key

    @staticmethod
    def is_configured():
        """Check if Gemini API key is configured."""
        return bool(GeminiScannerService.get_api_key())

    @staticmethod
    def set_api_key(new_key):
        """Save new Gemini API key to backend/.env and current runtime environment."""
        clean_key = new_key.strip()
        os.environ['GEMINI_API_KEY'] = clean_key
        setattr(Config, 'GEMINI_API_KEY', clean_key)

        env_path = Path(__file__).resolve().parent.parent / '.env'
        try:
            content = ""
            if env_path.exists():
                content = env_path.read_text(encoding='utf-8')

            if 'GEMINI_API_KEY=' in content:
                content = re.sub(r'GEMINI_API_KEY=.*', f'GEMINI_API_KEY={clean_key}', content)
            else:
                content += f"\nGEMINI_API_KEY={clean_key}\n"

            env_path.write_text(content, encoding='utf-8')
            return True
        except Exception as e:
            print(f"Warning: Failed to update .env: {e}")
            return False

    @staticmethod
    def parse_data_url(data_url):
        """Decode a base64 data URL into raw bytes and mime type."""
        match = re.match(r'^data:([^;]+);base64,(.+)$', data_url)
        if match:
            mime_type = match.group(1)
            raw_bytes = base64.b64decode(match.group(2))
            return raw_bytes, mime_type
        # Raw base64 fallback
        raw_bytes = base64.b64decode(data_url)
        return raw_bytes, 'image/jpeg'

    @staticmethod
    def scan_image_bytes(image_bytes, mime_type='image/jpeg', filename='document.jpg'):
        """
        Process invoice/bill photo bytes using Google Gemini Vision,
        or fall back to local heuristic extraction if no API key is set.
        """
        api_key = GeminiScannerService.get_api_key()

        if api_key:
            try:
                extracted = GeminiScannerService._call_gemini_vision(api_key, image_bytes, mime_type)
                if extracted:
                    return {
                        "success": True,
                        "gemini_configured": True,
                        "source": "gemini_ai",
                        "message": "Bill/Invoice fields extracted successfully using Gemini AI Vision.",
                        "data": extracted
                    }
            except Exception as e:
                print(f"[GeminiScannerService] Gemini call failed: {e}. Falling back to heuristic parser.")

        # Fallback heuristic parser
        fallback_data = GeminiScannerService._fallback_extract(image_bytes, mime_type, filename)
        return {
            "success": True,
            "gemini_configured": bool(api_key),
            "source": "fallback_parser",
            "message": "Extracted with standard parser. Configure GEMINI_API_KEY for deep AI document intelligence." if not api_key else "Gemini extraction had a temporary issue, fallback values populated.",
            "data": fallback_data
        }

    @staticmethod
    def _call_gemini_vision(api_key, image_bytes, mime_type):
        """Call Google Gemini 2.5 Flash / 2.0 Flash with image bytes."""
        # 1. Try google-genai SDK if available
        if HAS_GENAI_SDK:
            for model_name in ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']:
                try:
                    client = genai.Client(api_key=api_key)
                    part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[EXTRACTION_PROMPT, part],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json"
                        )
                    )
                    text = response.text or ""
                    cleaned = GeminiScannerService._clean_json_str(text)
                    parsed = json.loads(cleaned)
                    return GeminiScannerService._normalize_extracted_dict(parsed)
                except Exception as sdk_err:
                    print(f"[GeminiScannerService] SDK error on model {model_name}: {sdk_err}")
                    continue

        # 2. Try direct REST call via requests / urllib
        b64_data = base64.b64encode(image_bytes).decode('utf-8')
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": EXTRACTION_PROMPT},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_data
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        }

        for model_name in ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            try:
                headers = {"Content-Type": "application/json"}
                resp = requests.post(url, json=payload, headers=headers, timeout=25)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get('candidates', [])
                    if candidates:
                        text_val = candidates[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                        cleaned = GeminiScannerService._clean_json_str(text_val)
                        parsed = json.loads(cleaned)
                        return GeminiScannerService._normalize_extracted_dict(parsed)
                else:
                    print(f"[GeminiScannerService] REST error {resp.status_code} on {model_name}: {resp.text[:200]}")
            except Exception as rest_err:
                print(f"[GeminiScannerService] REST exception on {model_name}: {rest_err}")
                continue

        return None

    @staticmethod
    def _clean_json_str(text):
        """Strip markdown fences if present."""
        clean = text.strip()
        if clean.startswith("```json"):
            clean = clean[7:]
        elif clean.startswith("```"):
            clean = clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        return clean.strip()

    @staticmethod
    def _normalize_extracted_dict(data):
        """Sanitize and validate extracted fields for the transaction form."""
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Determine valid type
        t_type = "Expense"
        raw_type = str(data.get('type', '')).strip().title()
        if raw_type in ['Income', 'Inflow', 'Customer Invoice', 'Sales']:
            t_type = 'Income'

        # Ensure valid amount
        try:
            amt = float(data.get('amount', 0))
            if amt < 0:
                amt = abs(amt)
        except Exception:
            amt = 0.0

        # Validate date
        t_date = data.get('transaction_date') or today
        try:
            datetime.strptime(str(t_date)[:10], '%Y-%m-%d')
            t_date = str(t_date)[:10]
        except Exception:
            t_date = today

        # Validate due_date
        due_d = data.get('due_date')
        if due_d:
            try:
                datetime.strptime(str(due_d)[:10], '%Y-%m-%d')
                due_d = str(due_d)[:10]
            except Exception:
                due_d = ""
        else:
            due_d = ""

        # Map category
        income_cats = ['Sales Revenue', 'Customer Payment', 'Service Income', 'Other Income']
        expense_cats = ['Inventory Purchase', 'Supplier Payment', 'Salary', 'Rent', 'Utilities', 'Transportation', 'Marketing', 'Equipment', 'Tax', 'Other Expense']
        
        cat = data.get('category', '')
        if t_type == 'Income':
            if cat not in income_cats:
                cat = 'Sales Revenue'
        else:
            if cat not in expense_cats:
                # heuristic match
                lower_cat = cat.lower()
                if 'tax' in lower_cat or 'gst' in lower_cat:
                    cat = 'Tax'
                elif 'utilit' in lower_cat or 'electric' in lower_cat or 'water' in lower_cat:
                    cat = 'Utilities'
                elif 'invent' in lower_cat or 'stock' in lower_cat or 'material' in lower_cat:
                    cat = 'Inventory Purchase'
                elif 'suppli' in lower_cat or 'vendor' in lower_cat:
                    cat = 'Supplier Payment'
                elif 'rent' in lower_cat:
                    cat = 'Rent'
                elif 'travel' in lower_cat or 'transport' in lower_cat or 'fuel' in lower_cat:
                    cat = 'Transportation'
                elif 'salary' in lower_cat or 'wage' in lower_cat:
                    cat = 'Salary'
                else:
                    cat = 'Supplier Payment'

        # Payment status
        p_status = data.get('payment_status', 'Completed')
        if p_status not in ['Completed', 'Pending', 'Overdue']:
            p_status = 'Pending' if due_d else 'Completed'

        # Reference number
        ref = str(data.get('reference_number') or '').strip()
        if not ref:
            ref = f"SCAN-{datetime.now().strftime('%y%m%d%H%M')}"

        title = str(data.get('title') or '').strip()
        counterparty = str(data.get('counterparty') or '').strip()
        if not title:
            title = f"{'Invoice from' if t_type == 'Expense' else 'Invoice to'} {counterparty or 'Counterparty'}"

        return {
            "title": title,
            "type": t_type,
            "amount": amt,
            "currency": data.get('currency', 'INR'),
            "transaction_date": t_date,
            "due_date": due_d,
            "category": cat,
            "counterparty": counterparty,
            "payment_method": data.get('payment_method', 'Bank Transfer'),
            "payment_status": p_status,
            "reference_number": ref,
            "description": str(data.get('description') or f"Auto-scanned {t_type.lower()} document").strip(),
            "tax_amount": float(data.get('tax_amount') or 0.0),
            "confidence": float(data.get('confidence') or 0.90)
        }

    @staticmethod
    def _fallback_extract(image_bytes, mime_type, filename):
        """Fallback local heuristic extractor when Gemini is not configured or offline."""
        today = datetime.now().strftime('%Y-%m-%d')
        raw_text = ""

        # Check if PDF
        if 'pdf' in mime_type.lower() and HAS_PYPDF:
            import io
            try:
                reader = PdfReader(io.BytesIO(image_bytes))
                for page in reader.pages:
                    txt = page.extract_text()
                    if txt:
                        raw_text += " " + txt
            except Exception:
                pass

        # Check if PIL image & pytesseract available
        if not raw_text and HAS_PIL:
            import io
            try:
                img = Image.open(io.BytesIO(image_bytes))
                if hasattr(pytesseract, 'image_to_string'):
                    raw_text = pytesseract.image_to_string(img)
            except Exception:
                pass

        # Parse text heuristics
        lower = raw_text.lower()
        t_type = "Expense"
        if "tax invoice" in lower and ("to:" in lower or "billed to" in lower):
            t_type = "Income"
        elif "receipt" in lower or "vendor" in lower or "bill to" in lower:
            t_type = "Expense"

        # Search for amounts
        amount = 0.0
        amt_match = re.findall(r'(?:total|amount|grand total|rs\.?|inr|₹)\s*[:.]?\s*([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]{2})?)', raw_text, re.IGNORECASE)
        if amt_match:
            try:
                amount = float(amt_match[-1].replace(',', ''))
            except Exception:
                amount = 0.0

        # Search for dates
        date_cand = today
        date_match = re.search(r'\b(202[4-6][-/][0-1][0-9][-/][0-3][0-9])\b', raw_text)
        if date_match:
            date_cand = date_match.group(1).replace('/', '-')

        # Search invoice #
        inv_match = re.search(r'(?:inv|invoice|bill|receipt|ref)[\s#.:_-]*([A-Za-z0-9\-_/]{3,20})', raw_text, re.IGNORECASE)
        ref_no = inv_match.group(1) if inv_match else f"DOC-{datetime.now().strftime('%m%d%H%M')}"

        clean_fn = Path(filename).stem.replace('_', ' ').replace('-', ' ').title()
        
        return {
            "title": f"Scanned Document - {clean_fn}" if clean_fn else "Scanned Invoice / Bill",
            "type": t_type,
            "amount": amount,
            "currency": "INR",
            "transaction_date": date_cand,
            "due_date": "",
            "category": "Sales Revenue" if t_type == "Income" else "Inventory Purchase",
            "counterparty": clean_fn if clean_fn and len(clean_fn) > 3 else "Vendor / Customer",
            "payment_method": "Bank Transfer",
            "payment_status": "Completed" if "receipt" in lower else "Pending",
            "reference_number": ref_no,
            "description": f"Scanned from {filename or 'camera capture'}",
            "tax_amount": 0.0,
            "confidence": 0.65 if raw_text else 0.40
        }
