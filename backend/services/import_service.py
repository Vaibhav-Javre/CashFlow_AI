import os
import uuid
import re
import json
import pandas as pd
from datetime import datetime
from decimal import Decimal
from werkzeug.utils import secure_filename
from backend.database import get_db_connection

TEMP_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads', 'temp')
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)

# Common column name heuristics for automatic mapping suggestions
BANK_COLUMN_CANDIDATES = {
    'date': ['date', 'txn date', 'transaction date', 'txn_date', 'value date', 'posting date', 'tran date'],
    'description': ['description', 'narration', 'particulars', 'details', 'remarks', 'transaction details', 'memo'],
    'debit': ['debit', 'dr', 'withdrawal', 'withdrawals', 'debit amount', 'spent', 'outflow'],
    'credit': ['credit', 'cr', 'deposit', 'deposits', 'credit amount', 'received', 'inflow'],
    'amount': ['amount', 'txn amount', 'transaction amount', 'net amount', 'total'],
    'type': ['type', 'txn type', 'transaction type', 'cr/dr', 'd/c', 'dr_cr'],
    'reference': ['reference', 'ref', 'ref no', 'reference number', 'cheque no', 'chq no', 'utr', 'rrn', 'txn id'],
    'balance': ['balance', 'closing balance', 'avail balance', 'running balance', 'net balance']
}

RECEIVABLE_COLUMN_CANDIDATES = {
    'invoice_number': ['invoice number', 'invoice_no', 'invoice #', 'inv no', 'bill number', 'invoice id'],
    'customer_name': ['customer', 'customer name', 'client', 'client name', 'account name', 'buyer'],
    'invoice_date': ['invoice date', 'date', 'inv date', 'issued date', 'bill date'],
    'due_date': ['due date', 'payment due', 'maturity date', 'expected date'],
    'total_amount': ['amount', 'invoice amount', 'total', 'total amount', 'grand total', 'gross amount'],
    'amount_paid': ['paid', 'amount paid', 'paid amount', 'collected', 'received'],
    'description': ['description', 'notes', 'particulars', 'item', 'details']
}

PAYABLE_COLUMN_CANDIDATES = {
    'bill_number': ['bill number', 'bill_no', 'bill #', 'invoice number', 'invoice no', 'inv no', 'vendor ref'],
    'supplier_name': ['supplier', 'supplier name', 'vendor', 'vendor name', 'payee', 'merchant'],
    'bill_date': ['bill date', 'date', 'invoice date', 'issued date'],
    'due_date': ['due date', 'payment due', 'maturity date'],
    'total_amount': ['amount', 'bill amount', 'total', 'total amount', 'invoice amount'],
    'amount_paid': ['paid', 'amount paid', 'paid amount', 'settled'],
    'description': ['description', 'notes', 'particulars', 'category', 'details']
}

def clean_amount(val):
    """Parse monetary string to float. Handles ₹, $, commas, parentheses."""
    if val is None or pd.isna(val):
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s or s.lower() in ['none', 'nan', 'null', '-']:
        return None
    # Check for parentheses: (100.50) -> -100.50
    is_neg = False
    if s.startswith('(') and s.endswith(')'):
        is_neg = True
        s = s[1:-1].strip()
    elif s.startswith('-'):
        is_neg = True
        s = s[1:].strip()
    
    # Strip symbols
    s = re.sub(r'[^\d.]', '', s)
    if not s:
        return None
    try:
        amt = float(s)
        return -amt if is_neg else amt
    except ValueError:
        return None

def parse_date_flex(date_val, explicit_format=None):
    """Flexibly parse a date value into YYYY-MM-DD string."""
    if date_val is None or pd.isna(date_val):
        return None
    
    # If already a datetime or timestamp
    if isinstance(date_val, (datetime, pd.Timestamp)):
        return date_val.strftime('%Y-%m-%d')
    
    s = str(date_val).strip()
    if not s:
        return None
    
    # If explicit format provided
    if explicit_format:
        try:
            return datetime.strptime(s, explicit_format).strftime('%Y-%m-%d')
        except ValueError:
            pass
    
    # Try common business formats
    formats_to_try = [
        '%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y',
        '%Y/%m/%d', '%d.%m.%Y', '%d %b %Y', '%d %B %Y',
        '%Y-%m-%d %H:%M:%S', '%d/%m/%Y %H:%M:%S'
    ]
    for fmt in formats_to_try:
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    
    # Try dateutil parser as fallback
    try:
        from dateutil import parser
        parsed = parser.parse(s, dayfirst=True)
        return parsed.strftime('%Y-%m-%d')
    except Exception:
        return None

class ImportService:
    @staticmethod
    def _read_file_dataframe(file_path, filename):
        """Read CSV or Excel into a pandas DataFrame."""
        ext = os.path.splitext(filename)[1].lower()
        if ext == '.csv':
            # Try utf-8 first, fallback to latin1
            try:
                df = pd.read_csv(file_path, dtype=str)
            except Exception:
                df = pd.read_csv(file_path, encoding='latin1', dtype=str)
        elif ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path, dtype=str)
        else:
            raise ValueError(f"Unsupported file format '{ext}'. Please upload .csv, .xlsx, or .xls.")
        
        # Clean column headers
        df.columns = [str(c).strip() for c in df.columns]
        # Drop completely empty rows
        df = df.dropna(how='all')
        return df

    @staticmethod
    def _suggest_mappings(columns, candidates_dict):
        """Suggest mapped field names based on exact or word-boundary header matches."""
        suggested = {}
        cols_lower = {c.lower(): c for c in columns}
        
        # 1. Exact match first
        for field, keywords in candidates_dict.items():
            for kw in keywords:
                if kw in cols_lower:
                    suggested[field] = cols_lower[kw]
                    break

        # 2. Word boundary match for remaining unmapped fields
        for field, keywords in candidates_dict.items():
            if field in suggested:
                continue
            for kw in keywords:
                if len(kw) <= 3:
                    continue  # Avoid false positives for 2-letter tokens like 'cr', 'dr'
                for cl, orig_col in cols_lower.items():
                    if re.search(r'\b' + re.escape(kw) + r'\b', cl):
                        if field in ['debit', 'credit', 'amount'] and 'desc' in cl:
                            continue
                        suggested[field] = orig_col
                        break
                if field in suggested:
                    break

        # Hygiene check: if amount is present, clean up spurious debit/credit matches
        if 'amount' in suggested:
            if suggested.get('credit') == suggested.get('description'):
                suggested.pop('credit', None)
            if suggested.get('debit') == suggested.get('description'):
                suggested.pop('debit', None)

        return suggested

    @staticmethod
    def preview_bank_statement(file_storage, column_mapping=None, date_format=None):
        """
        Save file temporarily and produce row-level validation preview,
        suggested column mappings, and duplicate counts.
        """
        orig_name = secure_filename(file_storage.filename or 'statement.csv')
        token = str(uuid.uuid4())
        temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{token}_{orig_name}")
        file_storage.save(temp_path)
        file_size = os.path.getsize(temp_path)

        df = ImportService._read_file_dataframe(temp_path, orig_name)
        columns = list(df.columns)
        suggested = ImportService._suggest_mappings(columns, BANK_COLUMN_CANDIDATES)

        effective_mapping = column_mapping or suggested
        
        # Raw preview rows (first 5)
        raw_preview = df.head(5).fillna('').to_dict(orient='records')

        # If a mapping is provided or guessed, validate rows
        valid_count = 0
        invalid_count = 0
        duplicate_count = 0
        validation_errors = []
        valid_rows_sample = []

        # Connect to DB to check duplicates
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT date, amount, reference_number, description FROM transactions;")
        existing_txs = cursor.fetchall()
        existing_refs = {str(t['reference_number']).strip().upper() for t in existing_txs if t['reference_number']}
        existing_combos = {(str(t['date']), round(float(t['amount']), 2)) for t in existing_txs}
        conn.close()

        has_mapping = bool(effective_mapping.get('date') and (effective_mapping.get('amount') or (effective_mapping.get('debit') or effective_mapping.get('credit'))))

        if has_mapping:
            date_col = effective_mapping.get('date')
            desc_col = effective_mapping.get('description')
            amt_col = effective_mapping.get('amount')
            dr_col = effective_mapping.get('debit')
            cr_col = effective_mapping.get('credit')
            ref_col = effective_mapping.get('reference')
            type_col = effective_mapping.get('type')

            for idx, row in df.iterrows():
                row_num = idx + 2 # 1-based index including header
                row_dict = row.to_dict()

                # Validate Date
                raw_date = row_dict.get(date_col)
                parsed_date = parse_date_flex(raw_date, date_format)
                if not parsed_date:
                    invalid_count += 1
                    validation_errors.append({
                        "row": row_num,
                        "field": "date",
                        "error": f"Invalid or missing date '{raw_date}'",
                        "raw_data": row_dict
                    })
                    continue

                # Validate Amount / Inflow / Outflow
                inflow = None
                outflow = None
                net_amt = None
                tx_type = None

                use_split_dr_cr = bool((dr_col or cr_col) and (not amt_col or (dr_col and cr_col)) and dr_col != desc_col and cr_col != desc_col)

                if use_split_dr_cr:
                    raw_dr = clean_amount(row_dict.get(dr_col)) if dr_col else None
                    raw_cr = clean_amount(row_dict.get(cr_col)) if cr_col else None

                    if raw_cr is not None and raw_cr > 0:
                        inflow = raw_cr
                        tx_type = 'INFLOW'
                    elif raw_dr is not None and raw_dr > 0:
                        outflow = raw_dr
                        tx_type = 'OUTFLOW'
                    elif raw_cr == 0 and raw_dr == 0:
                        invalid_count += 1
                        validation_errors.append({
                            "row": row_num,
                            "field": "amount",
                            "error": "Both debit and credit amounts are zero.",
                            "raw_data": row_dict
                        })
                        continue
                    else:
                        invalid_count += 1
                        validation_errors.append({
                            "row": row_num,
                            "field": "amount",
                            "error": "Missing debit and credit amount values.",
                            "raw_data": row_dict
                        })
                        continue
                    net_amt = inflow if tx_type == 'INFLOW' else outflow
                elif amt_col:
                    val = clean_amount(row_dict.get(amt_col))
                    if val is None or val == 0:
                        invalid_count += 1
                        validation_errors.append({
                            "row": row_num,
                            "field": "amount",
                            "error": f"Invalid amount '{row_dict.get(amt_col)}'",
                            "raw_data": row_dict
                        })
                        continue
                    
                    # If type column specified
                    raw_type = str(row_dict.get(type_col, '')).strip().upper() if type_col else ''
                    if 'CR' in raw_type or 'CREDIT' in raw_type or 'INFLOW' in raw_type:
                        tx_type = 'INFLOW'
                        net_amt = abs(val)
                    elif 'DR' in raw_type or 'DEBIT' in raw_type or 'OUTFLOW' in raw_type:
                        tx_type = 'OUTFLOW'
                        net_amt = abs(val)
                    else:
                        if val > 0:
                            tx_type = 'INFLOW'
                            net_amt = val
                        else:
                            tx_type = 'OUTFLOW'
                            net_amt = abs(val)

                # Reference
                ref_val = str(row_dict.get(ref_col, '')).strip() if ref_col else ''
                desc_val = str(row_dict.get(desc_col, 'Bank Transaction')).strip() if desc_col else 'Bank Transaction'
                if not desc_val or desc_val.lower() == 'nan':
                    desc_val = 'Bank Transaction'

                # Duplicate Check
                is_duplicate = False
                if ref_val:
                    is_duplicate = ref_val.upper() in existing_refs
                else:
                    is_duplicate = (parsed_date, round(net_amt, 2), desc_val.lower()) in existing_combos

                if is_duplicate:
                    duplicate_count += 1
                
                valid_count += 1
                if len(valid_rows_sample) < 5:
                    valid_rows_sample.append({
                        "date": parsed_date,
                        "description": desc_val,
                        "type": tx_type,
                        "amount": net_amt,
                        "reference": ref_val,
                        "is_duplicate": is_duplicate
                    })

        return {
            "token": token,
            "filename": orig_name,
            "file_size": file_size,
            "total_rows": len(df),
            "columns": columns,
            "suggested_mapping": suggested,
            "effective_mapping": effective_mapping,
            "raw_preview": raw_preview,
            "has_mapping": has_mapping,
            "valid_count": valid_count,
            "invalid_count": invalid_count,
            "duplicate_count": duplicate_count,
            "sample_valid_rows": valid_rows_sample,
            "sample_errors": validation_errors[:20]
        }

    @staticmethod
    def confirm_bank_statement(token, filename, column_mapping, date_format=None, skip_duplicates=True):
        """
        Process and import all valid rows into `transactions` table.
        Saves rejected rows into `import_row_errors` and updates cash balance.
        """
        temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{token}_{filename}")
        if not os.path.exists(temp_path):
            raise ValueError("Import session expired or file not found. Please upload again.")

        df = ImportService._read_file_dataframe(temp_path, filename)
        file_size = os.path.getsize(temp_path)
        batch_num = f"IMP-BNK-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"

        conn = get_db_connection()
        cursor = conn.cursor()

        # Fetch existing duplicates
        cursor.execute("SELECT date, amount, reference_number FROM transactions;")
        existing_txs = cursor.fetchall()
        existing_refs = {str(t['reference_number']).strip().upper() for t in existing_txs if t['reference_number']}
        existing_combos = {(str(t['date']), round(float(t['amount']), 2)) for t in existing_txs}

        # Create batch record
        cursor.execute("""
            INSERT INTO import_batches (
                batch_number, import_type, original_filename, stored_filename,
                file_size, total_rows, status, created_at
            ) VALUES (?, 'bank_statement', ?, ?, ?, ?, 'PROCESSING', CURRENT_TIMESTAMP);
        """, (batch_num, filename, f"{token}_{filename}", file_size, len(df)))
        batch_id = cursor.lastrowid

        date_col = column_mapping.get('date')
        desc_col = column_mapping.get('description')
        amt_col = column_mapping.get('amount')
        dr_col = column_mapping.get('debit')
        cr_col = column_mapping.get('credit')
        ref_col = column_mapping.get('reference')
        type_col = column_mapping.get('type')

        valid_rows = 0
        invalid_rows = 0
        duplicate_rows = 0
        imported_rows = 0
        net_change = 0.0

        inserted_transactions = []
        rejected_records = []

        for idx, row in df.iterrows():
            row_num = idx + 2
            row_dict = row.to_dict()

            # Date check
            raw_date = row_dict.get(date_col)
            parsed_date = parse_date_flex(raw_date, date_format)
            if not parsed_date:
                invalid_rows += 1
                rejected_records.append((batch_id, row_num, json.dumps(row_dict), f"Invalid date: '{raw_date}'"))
                continue

            # Amount check
            inflow = None
            outflow = None
            net_amt = None
            use_split_dr_cr = bool((dr_col or cr_col) and (not amt_col or (dr_col and cr_col)) and dr_col != desc_col and cr_col != desc_col)

            if use_split_dr_cr:
                raw_dr = clean_amount(row_dict.get(dr_col)) if dr_col else None
                raw_cr = clean_amount(row_dict.get(cr_col)) if cr_col else None

                if raw_cr is not None and raw_cr > 0:
                    inflow = raw_cr
                    tx_type = 'INFLOW'
                elif raw_dr is not None and raw_dr > 0:
                    outflow = raw_dr
                    tx_type = 'OUTFLOW'
                else:
                    invalid_rows += 1
                    rejected_records.append((batch_id, row_num, json.dumps(row_dict), "Debit and Credit both invalid or zero"))
                    continue
                net_amt = inflow if tx_type == 'INFLOW' else outflow
            elif amt_col:
                val = clean_amount(row_dict.get(amt_col))
                if val is None or val == 0:
                    invalid_rows += 1
                    rejected_records.append((batch_id, row_num, json.dumps(row_dict), f"Invalid amount '{row_dict.get(amt_col)}'"))
                    continue
                
                raw_type = str(row_dict.get(type_col, '')).strip().upper() if type_col else ''
                if 'CR' in raw_type or 'CREDIT' in raw_type or 'INFLOW' in raw_type:
                    tx_type = 'INFLOW'
                    net_amt = abs(val)
                elif 'DR' in raw_type or 'DEBIT' in raw_type or 'OUTFLOW' in raw_type:
                    tx_type = 'OUTFLOW'
                    net_amt = abs(val)
                else:
                    if val > 0:
                        tx_type = 'INFLOW'
                        net_amt = val
                    else:
                        tx_type = 'OUTFLOW'
                        net_amt = abs(val)

            ref_val = str(row_dict.get(ref_col, '')).strip() if ref_col else ''
            desc_val = str(row_dict.get(desc_col, 'Bank Statement Entry')).strip() if desc_col else 'Bank Statement Entry'
            if not desc_val or desc_val.lower() == 'nan':
                desc_val = 'Bank Statement Entry'

            # Duplicate detection
            is_dup = False
            if ref_val:
                is_dup = ref_val.upper() in existing_refs
            else:
                is_dup = (parsed_date, round(net_amt, 2), desc_val.lower()) in existing_combos

            if is_dup:
                duplicate_rows += 1
                if skip_duplicates:
                    rejected_records.append((batch_id, row_num, json.dumps(row_dict), f"Duplicate skipped (Ref: {ref_val or 'Date+Amount match'})"))
                    continue

            # Valid for insertion
            valid_rows += 1
            imported_rows += 1
            if tx_type == 'INFLOW':
                net_change += net_amt
            else:
                net_change -= net_amt

            category = 'Customer Deposit' if tx_type == 'INFLOW' else 'Bank Disbursement'
            inserted_transactions.append((
                desc_val,
                parsed_date,
                parsed_date,
                tx_type,
                category,
                desc_val,
                net_amt,
                'COMPLETED',
                'Completed',
                'Bank Transfer',
                desc_val,
                ref_val or f"IMP-{uuid.uuid4().hex[:6].upper()}",
                ref_val or f"IMP-{uuid.uuid4().hex[:6].upper()}",
                batch_id,
                'UNMATCHED'
            ))

        # Batch insert transactions
        if inserted_transactions:
            cursor.executemany("""
                INSERT INTO transactions (
                    title, date, transaction_date, type, category, description,
                    amount, status, payment_status, payment_method, counterparty,
                    reference, reference_number, import_batch_id, reconciliation_status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
            """, inserted_transactions)

            # Update business cash balance
            cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (net_change,))

        # Batch insert rejected rows
        if rejected_records:
            cursor.executemany("""
                INSERT INTO import_row_errors (batch_id, row_number, raw_data, error_reason)
                VALUES (?, ?, ?, ?);
            """, rejected_records)

        # Update batch summary
        cursor.execute("""
            UPDATE import_batches
            SET valid_rows = ?,
                invalid_rows = ?,
                duplicate_rows = ?,
                imported_rows = ?,
                status = 'COMPLETED',
                summary_notes = ?
            WHERE id = ?;
        """, (
            valid_rows,
            invalid_rows,
            duplicate_rows,
            imported_rows,
            f"Imported {imported_rows} transactions. Net cash movement: ₹{net_change:,.2f}",
            batch_id
        ))

        conn.commit()
        conn.close()

        # Remove temp file
        try:
            os.remove(temp_path)
        except Exception:
            pass

        return {
            "batch_id": batch_id,
            "batch_number": batch_num,
            "total_rows": len(df),
            "imported_rows": imported_rows,
            "duplicate_rows": duplicate_rows,
            "invalid_rows": invalid_rows,
            "net_cash_change": round(net_change, 2)
        }

    @staticmethod
    def preview_business_records(file_storage, record_type='receivable', column_mapping=None, date_format=None):
        """Preview receivables or payables import."""
        orig_name = secure_filename(file_storage.filename or 'records.csv')
        token = str(uuid.uuid4())
        temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{token}_{orig_name}")
        file_storage.save(temp_path)
        file_size = os.path.getsize(temp_path)

        df = ImportService._read_file_dataframe(temp_path, orig_name)
        columns = list(df.columns)

        candidates = RECEIVABLE_COLUMN_CANDIDATES if record_type == 'receivable' else PAYABLE_COLUMN_CANDIDATES
        suggested = ImportService._suggest_mappings(columns, candidates)
        effective_mapping = column_mapping or suggested

        raw_preview = df.head(5).fillna('').to_dict(orient='records')

        conn = get_db_connection()
        cursor = conn.cursor()
        if record_type == 'receivable':
            cursor.execute("SELECT invoice_number FROM receivables;")
            existing_numbers = {str(r['invoice_number']).strip().upper() for r in cursor.fetchall() if r['invoice_number']}
        else:
            cursor.execute("SELECT COALESCE(bill_number, invoice_number) as num FROM payables;")
            existing_numbers = {str(r['num']).strip().upper() for r in cursor.fetchall() if r['num']}
        conn.close()

        valid_count = 0
        invalid_count = 0
        duplicate_count = 0
        validation_errors = []
        valid_sample = []

        num_col = effective_mapping.get('invoice_number' if record_type == 'receivable' else 'bill_number')
        name_col = effective_mapping.get('customer_name' if record_type == 'receivable' else 'supplier_name')
        amt_col = effective_mapping.get('total_amount')
        due_col = effective_mapping.get('due_date')

        has_mapping = bool(num_col and name_col and amt_col and due_col)

        if has_mapping:
            for idx, row in df.iterrows():
                row_num = idx + 2
                row_dict = row.to_dict()

                raw_num = str(row_dict.get(num_col, '')).strip()
                if not raw_num:
                    invalid_count += 1
                    validation_errors.append({"row": row_num, "field": "identifier", "error": "Missing invoice/bill number", "raw_data": row_dict})
                    continue

                raw_name = str(row_dict.get(name_col, '')).strip()
                if not raw_name:
                    invalid_count += 1
                    validation_errors.append({"row": row_num, "field": "counterparty", "error": "Missing customer/supplier name", "raw_data": row_dict})
                    continue

                raw_amt = clean_amount(row_dict.get(amt_col))
                if raw_amt is None or raw_amt <= 0:
                    invalid_count += 1
                    validation_errors.append({"row": row_num, "field": "amount", "error": f"Invalid amount '{row_dict.get(amt_col)}'", "raw_data": row_dict})
                    continue

                raw_due = row_dict.get(due_col)
                parsed_due = parse_date_flex(raw_due, date_format)
                if not parsed_due:
                    invalid_count += 1
                    validation_errors.append({"row": row_num, "field": "due_date", "error": f"Invalid due date '{raw_due}'", "raw_data": row_dict})
                    continue

                is_dup = raw_num.upper() in existing_numbers
                if is_dup:
                    duplicate_count += 1

                valid_count += 1
                if len(valid_sample) < 5:
                    valid_sample.append({
                        "identifier": raw_num,
                        "counterparty": raw_name,
                        "amount": raw_amt,
                        "due_date": parsed_due,
                        "is_duplicate": is_dup
                    })

        return {
            "token": token,
            "filename": orig_name,
            "file_size": file_size,
            "record_type": record_type,
            "total_rows": len(df),
            "columns": columns,
            "suggested_mapping": suggested,
            "effective_mapping": effective_mapping,
            "raw_preview": raw_preview,
            "has_mapping": has_mapping,
            "valid_count": valid_count,
            "invalid_count": invalid_count,
            "duplicate_count": duplicate_count,
            "sample_valid_rows": valid_sample,
            "sample_errors": validation_errors[:20]
        }

    @staticmethod
    def confirm_business_records(token, filename, record_type, column_mapping, date_format=None, skip_duplicates=True):
        """Confirm and insert business records into receivables or payables table."""
        temp_path = os.path.join(TEMP_UPLOAD_DIR, f"{token}_{filename}")
        if not os.path.exists(temp_path):
            raise ValueError("Import session expired. Please upload file again.")

        df = ImportService._read_file_dataframe(temp_path, filename)
        file_size = os.path.getsize(temp_path)
        batch_prefix = 'REC' if record_type == 'receivable' else 'PAY'
        batch_num = f"IMP-{batch_prefix}-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"

        conn = get_db_connection()
        cursor = conn.cursor()

        if record_type == 'receivable':
            cursor.execute("SELECT invoice_number FROM receivables;")
            existing_numbers = {str(r['invoice_number']).strip().upper() for r in cursor.fetchall() if r['invoice_number']}
        else:
            cursor.execute("SELECT COALESCE(bill_number, invoice_number) as num FROM payables;")
            existing_numbers = {str(r['num']).strip().upper() for r in cursor.fetchall() if r['num']}

        cursor.execute("""
            INSERT INTO import_batches (
                batch_number, import_type, original_filename, stored_filename,
                file_size, total_rows, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING', CURRENT_TIMESTAMP);
        """, (batch_num, f"{record_type}s", filename, f"{token}_{filename}", file_size, len(df)))
        batch_id = cursor.lastrowid

        num_col = column_mapping.get('invoice_number' if record_type == 'receivable' else 'bill_number')
        name_col = column_mapping.get('customer_name' if record_type == 'receivable' else 'supplier_name')
        amt_col = column_mapping.get('total_amount')
        paid_col = column_mapping.get('amount_paid')
        date_col = column_mapping.get('invoice_date' if record_type == 'receivable' else 'bill_date')
        due_col = column_mapping.get('due_date')
        desc_col = column_mapping.get('description')

        valid_rows = 0
        invalid_rows = 0
        duplicate_rows = 0
        imported_rows = 0
        rejected_records = []

        for idx, row in df.iterrows():
            row_num = idx + 2
            row_dict = row.to_dict()

            raw_num = str(row_dict.get(num_col, '')).strip()
            if not raw_num:
                invalid_rows += 1
                rejected_records.append((batch_id, row_num, json.dumps(row_dict), "Missing identifier"))
                continue

            raw_name = str(row_dict.get(name_col, '')).strip()
            if not raw_name:
                invalid_rows += 1
                rejected_records.append((batch_id, row_num, json.dumps(row_dict), "Missing customer/supplier name"))
                continue

            raw_amt = clean_amount(row_dict.get(amt_col))
            if raw_amt is None or raw_amt <= 0:
                invalid_rows += 1
                rejected_records.append((batch_id, row_num, json.dumps(row_dict), "Invalid total amount"))
                continue

            raw_due = row_dict.get(due_col)
            parsed_due = parse_date_flex(raw_due, date_format)
            if not parsed_due:
                invalid_rows += 1
                rejected_records.append((batch_id, row_num, json.dumps(row_dict), f"Invalid due date '{raw_due}'"))
                continue

            raw_date = row_dict.get(date_col)
            parsed_date = parse_date_flex(raw_date, date_format) or parsed_due
            raw_paid = clean_amount(row_dict.get(paid_col)) or 0.0
            raw_desc = str(row_dict.get(desc_col, '')).strip()

            is_dup = raw_num.upper() in existing_numbers
            if is_dup:
                duplicate_rows += 1
                if skip_duplicates:
                    rejected_records.append((batch_id, row_num, json.dumps(row_dict), f"Duplicate #{raw_num} skipped"))
                    continue

            valid_rows += 1
            imported_rows += 1

            if record_type == 'receivable':
                status = 'PAID' if raw_paid >= raw_amt else ('OVERDUE' if parsed_due < datetime.now().strftime('%Y-%m-%d') else 'PENDING')
                cursor.execute("""
                    INSERT INTO receivables (
                        invoice_number, customer_name, invoice_date, due_date,
                        invoice_amount, amount, description, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
                """, (raw_num, raw_name, parsed_date, parsed_due, raw_amt, raw_amt, raw_desc, status))
                rec_id = cursor.lastrowid

                if raw_paid > 0:
                    cursor.execute("""
                        INSERT INTO customer_payments (
                            invoice_id, amount, payment_date, payment_method, reference_number, notes
                        ) VALUES (?, ?, ?, 'Bank Transfer', ?, 'Imported starting payment');
                    """, (rec_id, min(raw_paid, raw_amt), parsed_date, f"IMP-RCPT-{raw_num}"))
            else:
                status = 'PAID' if raw_paid >= raw_amt else ('OVERDUE' if parsed_due < datetime.now().strftime('%Y-%m-%d') else 'PENDING')
                cursor.execute("""
                    INSERT INTO payables (
                        bill_number, supplier_name, bill_date, due_date,
                        bill_amount, amount, description, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
                """, (raw_num, raw_name, parsed_date, parsed_due, raw_amt, raw_amt, raw_desc, status))
                pay_id = cursor.lastrowid

                if raw_paid > 0:
                    cursor.execute("""
                        INSERT INTO supplier_payments (
                            bill_id, amount, payment_date, payment_method, reference_number, notes
                        ) VALUES (?, ?, ?, 'Bank Transfer', ?, 'Imported starting payment');
                    """, (pay_id, min(raw_paid, raw_amt), parsed_date, f"IMP-PMT-{raw_num}"))

        if rejected_records:
            cursor.executemany("""
                INSERT INTO import_row_errors (batch_id, row_number, raw_data, error_reason)
                VALUES (?, ?, ?, ?);
            """, rejected_records)

        cursor.execute("""
            UPDATE import_batches
            SET valid_rows = ?,
                invalid_rows = ?,
                duplicate_rows = ?,
                imported_rows = ?,
                status = 'COMPLETED',
                summary_notes = ?
            WHERE id = ?;
        """, (valid_rows, invalid_rows, duplicate_rows, imported_rows, f"Imported {imported_rows} {record_type}s.", batch_id))

        conn.commit()
        conn.close()

        try:
            os.remove(temp_path)
        except Exception:
            pass

        return {
            "batch_id": batch_id,
            "batch_number": batch_num,
            "total_rows": len(df),
            "imported_rows": imported_rows,
            "duplicate_rows": duplicate_rows,
            "invalid_rows": invalid_rows
        }

    @staticmethod
    def list_batches():
        """Retrieve recent import batches."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM import_batches ORDER BY id DESC LIMIT 50;")
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def get_batch(batch_id):
        """Retrieve batch details and error count."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM import_batches WHERE id = ?;", (batch_id,))
        batch = cursor.fetchone()
        if not batch:
            conn.close()
            return None
        res = dict(batch)
        cursor.execute("SELECT * FROM import_row_errors WHERE batch_id = ? ORDER BY row_number ASC LIMIT 100;", (batch_id,))
        res['errors'] = [dict(e) for e in cursor.fetchall()]
        conn.close()
        return res
