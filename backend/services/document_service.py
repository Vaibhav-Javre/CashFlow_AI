import os
import re
import uuid
import json
import shutil
from datetime import datetime
from werkzeug.utils import secure_filename
from pypdf import PdfReader
from backend.database import get_db_connection

DOC_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads', 'documents')
os.makedirs(DOC_UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}
MAX_FILE_SIZE = 10 * 1024 * 1024 # 10MB

# Try importing pytesseract
try:
    import pytesseract
    from PIL import Image
    # Check if tesseract binary is actually found
    has_tesseract = bool(shutil.which('tesseract'))
except Exception:
    has_tesseract = False

def extract_text_from_pdf(filepath):
    """Extract text from PDF pages using pypdf."""
    text_content = []
    try:
        reader = PdfReader(filepath)
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text_content.append(t)
    except Exception as e:
        return f"[PDF text extraction failed: {str(e)}]"
    return "\n".join(text_content).strip()

def extract_text_from_image(filepath):
    """Attempt to extract text from an image using pytesseract if available."""
    if not has_tesseract:
        return None, "OCR engine (Tesseract) not found on system path. Please install Tesseract-OCR to enable image OCR, or enter fields manually."
    try:
        img = Image.open(filepath)
        text = pytesseract.image_to_string(img)
        return text.strip(), None
    except Exception as e:
        return None, f"Image OCR failed: {str(e)}"

def parse_extracted_document_fields(raw_text):
    """
    Intelligently identify candidate fields from extracted invoice/bill text:
    - Document Type (invoice, bill, receipt)
    - Invoice/Bill number
    - Customer / Supplier name
    - Document date & Due date
    - Total amount, Tax amount, Amount paid, Outstanding amount
    """
    fields = {
        "document_type": "invoice",
        "invoice_number": "",
        "counterparty_name": "",
        "document_date": datetime.now().strftime('%Y-%m-%d'),
        "due_date": "",
        "total_amount": 0.0,
        "tax_amount": 0.0,
        "amount_paid": 0.0,
        "outstanding_amount": 0.0,
        "confidence_score": 0.0
    }
    
    if not raw_text:
        return fields

    lower_text = raw_text.lower()

    # 1. Document Type Detection
    if 'bill' in lower_text or 'purchase order' in lower_text or 'vendor' in lower_text or 'supplier' in lower_text:
        fields['document_type'] = 'bill'
    elif 'receipt' in lower_text:
        fields['document_type'] = 'receipt'
    else:
        fields['document_type'] = 'invoice'

    confidence_points = 10

    # 2. Invoice / Bill Number Regexes
    num_match = re.search(r'(?:invoice|inv|bill|receipt|ref)[\s#.:_-]*([A-Za-z0-9\-_/]{3,25})', raw_text, re.IGNORECASE)
    if num_match:
        cand = num_match.group(1).strip()
        if not cand.lower() in ['date', 'to', 'from', 'for', 'number', 'details']:
            fields['invoice_number'] = cand
            confidence_points += 25
    else:
        # Fallback to general code pattern
        code_match = re.search(r'\b(INV-[0-9]{3,8}|BILL-[0-9]{3,8}|[A-Z]{2,4}-[0-9]{3,8})\b', raw_text)
        if code_match:
            fields['invoice_number'] = code_match.group(1)
            confidence_points += 20

    # 3. Dates Detection
    date_patterns = [
        r'(?:invoice\s*date|bill\s*date|dated|date)[\s:]*([0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4})',
        r'(?:invoice\s*date|bill\s*date|dated|date)[\s:]*([0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2})',
        r'([0-9]{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[0-9]{4})'
    ]
    for dp in date_patterns:
        dm = re.search(dp, raw_text, re.IGNORECASE)
        if dm:
            raw_d = dm.group(1)
            # Try formatting
            for fmt in ['%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%m/%d/%Y', '%d %b %Y', '%d %B %Y']:
                try:
                    fields['document_date'] = datetime.strptime(raw_d, fmt).strftime('%Y-%m-%d')
                    confidence_points += 15
                    break
                except ValueError:
                    pass
            break

    # Due date
    due_match = re.search(r'(?:due\s*date|payment\s*due)[\s:]*([0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2})', raw_text, re.IGNORECASE)
    if due_match:
        raw_dd = due_match.group(1)
        for fmt in ['%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%m/%d/%Y']:
            try:
                fields['due_date'] = datetime.strptime(raw_dd, fmt).strftime('%Y-%m-%d')
                confidence_points += 15
                break
            except ValueError:
                pass
    if not fields['due_date'] and fields['document_date']:
        try:
            from datetime import timedelta
            fields['due_date'] = (datetime.strptime(fields['document_date'], '%Y-%m-%d') + timedelta(days=30)).strftime('%Y-%m-%d')
        except Exception:
            pass

    # 4. Total Amount Detection
    amt_patterns = [
        r'(?:total\s*amount|grand\s*total|net\s*amount|total\s*due|amount\s*due|balance\s*due)[\s:₹$Rs.]*([0-9,]+\.[0-9]{2}|[0-9,]+)',
        r'(?:total|balance)[\s:₹$Rs.]*([0-9,]+\.[0-9]{2})',
        r'[₹$]\s*([0-9,]+\.[0-9]{2})'
    ]
    for ap in amt_patterns:
        am = re.search(ap, raw_text, re.IGNORECASE)
        if am:
            raw_amt_str = am.group(1).replace(',', '').strip()
            try:
                amt_val = float(raw_amt_str)
                if amt_val > 0:
                    fields['total_amount'] = amt_val
                    fields['outstanding_amount'] = amt_val
                    confidence_points += 25
                    break
            except ValueError:
                pass

    # Tax amount
    tax_match = re.search(r'(?:tax|gst|vat|cgst\+sgst)[\s:₹$Rs.]*([0-9,]+\.[0-9]{2})', raw_text, re.IGNORECASE)
    if tax_match:
        try:
            fields['tax_amount'] = float(tax_match.group(1).replace(',', ''))
            confidence_points += 10
        except ValueError:
            pass

    # Counterparty Name Detection
    counterparty_match = re.search(r'(?:bill\s*to|customer|client|m/s|vendor|supplier)[\s:]*([A-Za-z0-9\s.,&]{4,40})', raw_text, re.IGNORECASE)
    if counterparty_match:
        cand_name = counterparty_match.group(1).strip()
        # Clean line breaks
        cand_name = cand_name.split('\n')[0].strip()
        if len(cand_name) > 3:
            fields['counterparty_name'] = cand_name
            confidence_points += 15

    fields['confidence_score'] = min(100, confidence_points)
    return fields

class DocumentService:
    @staticmethod
    def upload_and_process_document(file_storage, document_name=None):
        """
        Validate, store safely, extract text, and parse candidate fields.
        Does NOT automatically create financial transactions or invoices.
        """
        if not file_storage or not file_storage.filename:
            raise ValueError("No file provided.")

        filename = secure_filename(file_storage.filename)
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file format '.{ext}'. Allowed formats: PDF, JPG, JPEG, PNG.")

        token = str(uuid.uuid4())
        stored_filename = f"{token}_{filename}"
        saved_path = os.path.join(DOC_UPLOAD_DIR, stored_filename)
        file_storage.save(saved_path)
        file_size = os.path.getsize(saved_path)

        if file_size > MAX_FILE_SIZE:
            os.remove(saved_path)
            raise ValueError("File size exceeds 10MB limit.")

        doc_title = (document_name or filename).strip()
        extracted_text = ""
        ocr_status = "PROCESSED"
        ocr_message = "Text extracted successfully."

        if ext == 'pdf':
            extracted_text = extract_text_from_pdf(saved_path)
            if not extracted_text:
                ocr_status = "NEEDS_REVIEW"
                ocr_message = "Digital text was not detected in this PDF (might be a scanned image). Please review or enter fields manually."
        else: # Image
            text, err = extract_text_from_image(saved_path)
            if text:
                extracted_text = text
            else:
                ocr_status = "OCR_ENGINE_NOT_INSTALLED" if not has_tesseract else "FAILED"
                ocr_message = err or "OCR could not process image. Please verify values manually."

        # Parse fields from text
        parsed_fields = parse_extracted_document_fields(extracted_text)

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO uploaded_documents (
                document_name, original_filename, stored_filename, file_path,
                file_type, file_size, document_type, ocr_status, ocr_message,
                extracted_data, review_status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        """, (
            doc_title,
            filename,
            stored_filename,
            saved_path,
            ext,
            file_size,
            parsed_fields.get('document_type', 'invoice'),
            ocr_status,
            ocr_message,
            json.dumps({
                "raw_text": extracted_text[:2000],
                "fields": parsed_fields
            })
        ))
        doc_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT * FROM uploaded_documents WHERE id = ?;", (doc_id,))
        doc_row = dict(cursor.fetchone())
        doc_row['extracted_data'] = json.loads(doc_row['extracted_data'])
        conn.close()

        return doc_row

    @staticmethod
    def list_documents():
        """Retrieve all uploaded documents."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM uploaded_documents ORDER BY id DESC LIMIT 50;")
        rows = []
        for r in cursor.fetchall():
            d = dict(r)
            try:
                d['extracted_data'] = json.loads(d['extracted_data']) if d['extracted_data'] else {}
            except Exception:
                d['extracted_data'] = {}
            rows.append(d)
        conn.close()
        return rows

    @staticmethod
    def get_document(doc_id):
        """Retrieve single document with extracted data."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM uploaded_documents WHERE id = ?;", (doc_id,))
        doc = cursor.fetchone()
        if not doc:
            conn.close()
            return None
        d = dict(doc)
        try:
            d['extracted_data'] = json.loads(d['extracted_data']) if d['extracted_data'] else {}
        except Exception:
            d['extracted_data'] = {}
        conn.close()
        return d

    @staticmethod
    def update_extracted_data(doc_id, updated_fields):
        """Allow user to edit candidate extracted fields before confirmation."""
        doc = DocumentService.get_document(doc_id)
        if not doc:
            raise ValueError(f"Document #{doc_id} not found.")

        current_data = doc.get('extracted_data', {})
        current_data['fields'] = updated_fields

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE uploaded_documents
            SET extracted_data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (json.dumps(current_data), doc_id))
        conn.commit()
        conn.close()

        return DocumentService.get_document(doc_id)

    @staticmethod
    def confirm_document(doc_id, action_target, confirmed_fields):
        """
        Finalize document review:
        - action_target: 'create_receivable', 'create_payable', or 'document_only'
        - Creates database record only upon explicit user confirmation.
        """
        doc = DocumentService.get_document(doc_id)
        if not doc:
            raise ValueError(f"Document #{doc_id} not found.")

        conn = get_db_connection()
        cursor = conn.cursor()

        created_type = 'document_only'
        created_id = None

        fields = confirmed_fields or doc.get('extracted_data', {}).get('fields', {})

        if action_target == 'create_receivable':
            inv_num = str(fields.get('invoice_number') or f"INV-DOC-{doc_id}").strip()
            cust_name = str(fields.get('counterparty_name') or 'Customer from Document').strip()
            inv_date = str(fields.get('document_date') or datetime.now().strftime('%Y-%m-%d'))[:10]
            due_date = str(fields.get('due_date') or inv_date)[:10]
            amount = float(fields.get('total_amount') or 0.0)
            if amount <= 0:
                conn.close()
                raise ValueError("Invoice amount must be greater than zero.")

            # Check if invoice number already exists
            cursor.execute("SELECT id FROM receivables WHERE invoice_number = ?;", (inv_num,))
            if cursor.fetchone():
                inv_num = f"{inv_num}-{uuid.uuid4().hex[:4].upper()}"

            status = 'OVERDUE' if due_date < datetime.now().strftime('%Y-%m-%d') else 'PENDING'
            cursor.execute("""
                INSERT INTO receivables (
                    invoice_number, customer_name, invoice_date, due_date,
                    invoice_amount, amount, description, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            """, (inv_num, cust_name, inv_date, due_date, amount, amount, f"Created from document #{doc_id}: {doc['original_filename']}", status))
            created_id = cursor.lastrowid
            created_type = 'receivable'

        elif action_target == 'create_payable':
            bill_num = str(fields.get('invoice_number') or f"BILL-DOC-{doc_id}").strip()
            supp_name = str(fields.get('counterparty_name') or 'Supplier from Document').strip()
            bill_date = str(fields.get('document_date') or datetime.now().strftime('%Y-%m-%d'))[:10]
            due_date = str(fields.get('due_date') or bill_date)[:10]
            amount = float(fields.get('total_amount') or 0.0)
            if amount <= 0:
                conn.close()
                raise ValueError("Bill amount must be greater than zero.")

            cursor.execute("SELECT id FROM payables WHERE bill_number = ?;", (bill_num,))
            if cursor.fetchone():
                bill_num = f"{bill_num}-{uuid.uuid4().hex[:4].upper()}"

            status = 'OVERDUE' if due_date < datetime.now().strftime('%Y-%m-%d') else 'PENDING'
            cursor.execute("""
                INSERT INTO payables (
                    bill_number, supplier_name, bill_date, due_date,
                    bill_amount, amount, description, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            """, (bill_num, supp_name, bill_date, due_date, amount, amount, f"Created from document #{doc_id}: {doc['original_filename']}", status))
            created_id = cursor.lastrowid
            created_type = 'payable'

        # Update document record
        cursor.execute("""
            UPDATE uploaded_documents
            SET review_status = 'CONFIRMED',
                created_record_type = ?,
                created_record_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (created_type, created_id, doc_id))

        conn.commit()
        conn.close()

        return DocumentService.get_document(doc_id)
