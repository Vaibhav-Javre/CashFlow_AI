import os
import re
import sqlite3
import json
from pathlib import Path
from datetime import datetime, timedelta
from flask import has_request_context, request
from backend.config import Config

def sanitize_business_key(raw_key):
    """Sanitize business identifier into a safe filename string."""
    if not raw_key:
        return 'default'
    cleaned = str(raw_key).strip().lower()
    if cleaned in ['demo', 'demo@apexprecision.com', 'apex precision dynamics', 'apex precision', 'default']:
        return 'default'
    safe = re.sub(r'[^a-zA-Z0-9_-]', '_', cleaned)
    return safe[:50] or 'default'

def get_business_db_path(business_key=None):
    """Resolve database file path based on active business identity."""
    if not business_key and has_request_context():
        business_key = request.headers.get('X-Business-Id') or request.headers.get('x-business-id') or request.args.get('business_id')

    clean_key = sanitize_business_key(business_key)
    if clean_key == 'default':
        return Config.DATABASE_PATH

    biz_dir = Path(Config.DATABASE_PATH).parent / 'businesses'
    biz_dir.mkdir(parents=True, exist_ok=True)
    return str(biz_dir / f"cashflow_{clean_key}.db")

def init_clean_business_db(conn, metadata=None):
    """Initialize empty database schema with clean slate for a newly registered business."""
    meta = metadata or {}
    b_name = meta.get('business_name', 'My Business')
    owner = meta.get('owner_name', b_name)
    email = meta.get('email', f"{sanitize_business_key(b_name)}@business.com")
    ind = meta.get('industry', 'General MSME Business')
    curr = meta.get('currency', '₹')
    bal = float(meta.get('opening_balance', 500000.0) or 500000.0)
    res = float(meta.get('target_reserve', 100000.0) or 100000.0)

    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass

    cursor = conn.cursor()

    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        owner_name TEXT NOT NULL,
        business_name TEXT NOT NULL,
        industry TEXT,
        currency TEXT DEFAULT '₹',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Business Profile (with new business opening balance & reserve)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS business_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        industry TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT '₹',
        current_balance REAL NOT NULL DEFAULT 500000.0,
        target_reserve REAL NOT NULL DEFAULT 100000.0,
        monthly_burn REAL NOT NULL DEFAULT 0.0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    INSERT INTO business_profile (name, industry, currency, current_balance, target_reserve, monthly_burn)
    VALUES (?, ?, ?, ?, ?, ?);
    """, (b_name, ind, curr, bal, res, 0.0))

    cursor.execute("""
    INSERT OR REPLACE INTO users (email, owner_name, business_name, industry, currency)
    VALUES (?, ?, ?, ?, ?);
    """, (email, owner, b_name, ind, curr))

    # 3. Forecast Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS forecast_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opening_balance REAL NOT NULL DEFAULT 500000.0,
        minimum_cash_buffer REAL NOT NULL DEFAULT 100000.0,
        start_date TEXT,
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    today_str = datetime.now().strftime('%Y-%m-%d')
    cursor.execute("""
    INSERT INTO forecast_settings (id, opening_balance, minimum_cash_buffer, start_date, notes)
    VALUES (1, ?, ?, ?, ?);
    """, (bal, res, today_str, f'Initial calibration for {b_name}'))

    # 4. Clean transactional tables (0 rows)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        date TEXT NOT NULL,
        transaction_date TEXT,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'COMPLETED',
        payment_status TEXT DEFAULT 'Completed',
        payment_method TEXT DEFAULT 'Bank Transfer',
        counterparty TEXT,
        reference TEXT,
        reference_number TEXT,
        due_date TEXT,
        updated_at TEXT,
        invoice_id INTEGER,
        bill_id INTEGER,
        import_batch_id INTEGER,
        reconciliation_status TEXT DEFAULT 'UNMATCHED',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS receivables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        customer_contact TEXT,
        invoice_date TEXT,
        due_date TEXT NOT NULL,
        invoice_amount REAL,
        amount REAL,
        description TEXT,
        payment_terms TEXT DEFAULT 'Net 30',
        status TEXT NOT NULL DEFAULT 'PENDING',
        risk_level TEXT NOT NULL DEFAULT 'LOW',
        days_overdue INTEGER NOT NULL DEFAULT 0,
        expected_payment_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customer_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
        reference_number TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_number TEXT UNIQUE,
        invoice_number TEXT,
        supplier_name TEXT,
        vendor_name TEXT,
        supplier_contact TEXT,
        bill_date TEXT,
        due_date TEXT NOT NULL,
        bill_amount REAL,
        amount REAL,
        description TEXT,
        payment_terms TEXT DEFAULT 'Net 30',
        status TEXT NOT NULL DEFAULT 'PENDING',
        priority TEXT NOT NULL DEFAULT 'STANDARD',
        category TEXT NOT NULL DEFAULT 'General',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL REFERENCES payables(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
        reference_number TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS risk_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'WARNING', 'INFO')),
        shortfall_amount REAL DEFAULT 0.0,
        projected_date TEXT,
        root_cause TEXT NOT NULL,
        mitigation_action TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RESOLVED')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_key TEXT,
        related_record_type TEXT,
        related_record_id INTEGER,
        category TEXT NOT NULL DEFAULT 'Working Capital',
        title TEXT NOT NULL,
        explanation TEXT,
        description TEXT,
        priority TEXT NOT NULL DEFAULT 'Medium',
        urgency TEXT DEFAULT 'MEDIUM',
        related_risk TEXT,
        relevant_date TEXT,
        suggested_action TEXT,
        action_cta TEXT DEFAULT 'Review Action',
        estimated_impact REAL,
        impact_amount REAL DEFAULT 0.0,
        impact_description TEXT,
        effort TEXT DEFAULT 'LOW',
        status TEXT NOT NULL DEFAULT 'New',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS simulations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        scenario_type TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        projected_impact_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scenarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scenario_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        adjustment_type TEXT NOT NULL,
        related_record_type TEXT,
        related_record_id INTEGER,
        original_date TEXT,
        original_amount REAL,
        hypothetical_date TEXT NOT NULL,
        hypothetical_amount REAL NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS import_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_number TEXT UNIQUE NOT NULL,
        import_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT,
        file_size INTEGER DEFAULT 0,
        total_rows INTEGER DEFAULT 0,
        valid_rows INTEGER DEFAULT 0,
        invalid_rows INTEGER DEFAULT 0,
        duplicate_rows INTEGER DEFAULT 0,
        imported_rows INTEGER DEFAULT 0,
        status TEXT DEFAULT 'COMPLETED',
        summary_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS import_row_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        row_number INTEGER NOT NULL,
        raw_data TEXT,
        error_reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS uploaded_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_name TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        document_type TEXT DEFAULT 'invoice',
        ocr_status TEXT DEFAULT 'PENDING',
        ocr_message TEXT,
        extracted_data TEXT,
        review_status TEXT DEFAULT 'PENDING_REVIEW',
        created_record_type TEXT,
        created_record_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reconciliation_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        matched_type TEXT NOT NULL,
        matched_record_id INTEGER NOT NULL,
        match_method TEXT DEFAULT 'MANUAL',
        confidence_score REAL DEFAULT 1.0,
        match_reason TEXT,
        status TEXT DEFAULT 'CONFIRMED',
        payment_record_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()

def get_db_connection(business_key=None):
    """Returns a SQLite database connection with row factory configured as dictionary."""
    target_path = get_business_db_path(business_key)
    is_new = not os.path.exists(target_path)

    conn = sqlite3.connect(target_path, timeout=60.0)
    try:
        conn.execute("PRAGMA busy_timeout = 60000;")
    except Exception:
        pass
    conn.row_factory = sqlite3.Row

    if is_new and target_path != Config.DATABASE_PATH:
        # Auto-initialize clean schema for newly created business database
        safe_name = Path(target_path).stem.replace('cashflow_', '').replace('_', ' ').title()
        init_clean_business_db(conn, metadata={'business_name': safe_name})

    return conn

def init_db():
    """Initializes the database schema, migrates columns safely, and seeds demo data if empty."""
    conn = get_db_connection(business_key='default')
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass

    cursor = conn.cursor()

    # Create tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        owner_name TEXT NOT NULL,
        business_name TEXT NOT NULL,
        industry TEXT,
        currency TEXT DEFAULT '₹',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS business_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        industry TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT '₹',
        current_balance REAL NOT NULL DEFAULT 842500.0,
        target_reserve REAL NOT NULL DEFAULT 500000.0,
        monthly_burn REAL NOT NULL DEFAULT 385000.0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        date TEXT NOT NULL,
        transaction_date TEXT,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'COMPLETED',
        payment_status TEXT DEFAULT 'Completed',
        payment_method TEXT DEFAULT 'Bank Transfer',
        counterparty TEXT,
        reference TEXT,
        reference_number TEXT,
        due_date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Safe column migration for existing transactions table
    cursor.execute("PRAGMA table_info(transactions);")
    existing_cols = {col['name'] for col in cursor.fetchall()}

    columns_to_add = [
        ('title', 'TEXT'),
        ('transaction_date', 'TEXT'),
        ('payment_status', "TEXT DEFAULT 'Completed'"),
        ('payment_method', "TEXT DEFAULT 'Bank Transfer'"),
        ('due_date', 'TEXT'),
        ('reference_number', 'TEXT'),
        ('updated_at', 'TEXT'),
        ('invoice_id', 'INTEGER'),
        ('bill_id', 'INTEGER'),
        ('import_batch_id', 'INTEGER'),
        ('reconciliation_status', "TEXT DEFAULT 'UNMATCHED'")
    ]

    for col_name, col_type in columns_to_add:
        if col_name not in existing_cols:
            try:
                cursor.execute(f"ALTER TABLE transactions ADD COLUMN {col_name} {col_type};")
            except Exception as e:
                print(f"Column migration warning for {col_name}: {e}")

    # Backfill legacy records to ensure all new fields are populated
    cursor.execute("""
        UPDATE transactions
        SET title = CASE WHEN (title IS NULL OR title = '') THEN description ELSE title END,
            transaction_date = CASE WHEN (transaction_date IS NULL OR transaction_date = '') THEN date ELSE transaction_date END,
            payment_status = CASE 
                WHEN (payment_status IS NULL OR payment_status = '') THEN 
                    CASE WHEN UPPER(status) = 'COMPLETED' THEN 'Completed'
                         WHEN UPPER(status) = 'PENDING' THEN 'Pending'
                         WHEN UPPER(status) = 'OVERDUE' THEN 'Overdue'
                         ELSE 'Completed' END
                ELSE payment_status END,
            payment_method = CASE WHEN (payment_method IS NULL OR payment_method = '') THEN 'Bank Transfer' ELSE payment_method END,
            reference_number = CASE WHEN (reference_number IS NULL OR reference_number = '') THEN reference ELSE reference_number END,
            updated_at = CASE WHEN updated_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END;
    """)

    # Transaction columns created and migrated

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS receivables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        customer_contact TEXT,
        invoice_date TEXT,
        due_date TEXT NOT NULL,
        invoice_amount REAL,
        amount REAL,
        description TEXT,
        payment_terms TEXT DEFAULT 'Net 30',
        status TEXT NOT NULL DEFAULT 'PENDING',
        risk_level TEXT NOT NULL DEFAULT 'LOW',
        days_overdue INTEGER NOT NULL DEFAULT 0,
        expected_payment_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Safe column migration for receivables
    cursor.execute("PRAGMA table_info(receivables);")
    rec_cols = {col['name'] for col in cursor.fetchall()}
    rec_to_add = [
        ('customer_contact', 'TEXT'),
        ('invoice_date', 'TEXT'),
        ('invoice_amount', 'REAL'),
        ('description', 'TEXT'),
        ('payment_terms', "TEXT DEFAULT 'Net 30'"),
        ('updated_at', 'TEXT')
    ]
    for col_name, col_type in rec_to_add:
        if col_name not in rec_cols:
            try:
                cursor.execute(f"ALTER TABLE receivables ADD COLUMN {col_name} {col_type};")
            except Exception as e:
                print(f"Receivables column migration note for {col_name}: {e}")

    # Backfill receivables
    cursor.execute("""
        UPDATE receivables
        SET invoice_amount = CASE WHEN (invoice_amount IS NULL OR invoice_amount = 0) THEN amount ELSE invoice_amount END,
            amount = CASE WHEN (amount IS NULL OR amount = 0) THEN invoice_amount ELSE amount END,
            description = CASE WHEN (description IS NULL OR description = '') THEN notes ELSE description END,
            invoice_date = CASE WHEN (invoice_date IS NULL OR invoice_date = '') THEN date(due_date, '-30 days') ELSE invoice_date END,
            updated_at = CASE WHEN updated_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END;
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customer_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
        reference_number TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS payables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_number TEXT UNIQUE,
        invoice_number TEXT,
        supplier_name TEXT,
        vendor_name TEXT,
        supplier_contact TEXT,
        bill_date TEXT,
        due_date TEXT NOT NULL,
        bill_amount REAL,
        amount REAL,
        description TEXT,
        payment_terms TEXT DEFAULT 'Net 30',
        status TEXT NOT NULL DEFAULT 'PENDING',
        priority TEXT NOT NULL DEFAULT 'STANDARD',
        category TEXT NOT NULL DEFAULT 'General',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Safe column migration for payables
    cursor.execute("PRAGMA table_info(payables);")
    pay_cols = {col['name'] for col in cursor.fetchall()}
    pay_to_add = [
        ('bill_number', 'TEXT'),
        ('supplier_name', 'TEXT'),
        ('supplier_contact', 'TEXT'),
        ('bill_date', 'TEXT'),
        ('bill_amount', 'REAL'),
        ('description', 'TEXT'),
        ('payment_terms', "TEXT DEFAULT 'Net 30'"),
        ('updated_at', 'TEXT')
    ]
    for col_name, col_type in pay_to_add:
        if col_name not in pay_cols:
            try:
                cursor.execute(f"ALTER TABLE payables ADD COLUMN {col_name} {col_type};")
            except Exception as e:
                print(f"Payables column migration note for {col_name}: {e}")

    # Backfill payables
    cursor.execute("""
        UPDATE payables
        SET bill_number = CASE WHEN (bill_number IS NULL OR bill_number = '') THEN invoice_number ELSE bill_number END,
            invoice_number = CASE WHEN (invoice_number IS NULL OR invoice_number = '') THEN bill_number ELSE invoice_number END,
            supplier_name = CASE WHEN (supplier_name IS NULL OR supplier_name = '') THEN vendor_name ELSE supplier_name END,
            vendor_name = CASE WHEN (vendor_name IS NULL OR vendor_name = '') THEN supplier_name ELSE vendor_name END,
            bill_amount = CASE WHEN (bill_amount IS NULL OR bill_amount = 0) THEN amount ELSE bill_amount END,
            amount = CASE WHEN (amount IS NULL OR amount = 0) THEN bill_amount ELSE amount END,
            description = CASE WHEN (description IS NULL OR description = '') THEN notes ELSE description END,
            bill_date = CASE WHEN (bill_date IS NULL OR bill_date = '') THEN date(due_date, '-15 days') ELSE bill_date END,
            updated_at = CASE WHEN updated_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END;
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL REFERENCES payables(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
        reference_number TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Safe linkage of historical payments to avoid double counting
    try:
        cursor.execute("""
            UPDATE transactions
            SET invoice_id = (
                SELECT p.invoice_id FROM customer_payments p
                WHERE p.reference_number = transactions.reference_number
                   OR ('Customer Payment - ' || (SELECT r.invoice_number FROM receivables r WHERE r.id = p.invoice_id)) = transactions.title
                LIMIT 1
            )
            WHERE invoice_id IS NULL AND (category = 'Customer Payment' OR title LIKE 'Customer Payment%');
        """)
        cursor.execute("""
            UPDATE transactions
            SET bill_id = (
                SELECT p.bill_id FROM supplier_payments p
                WHERE p.reference_number = transactions.reference_number
                   OR ('Supplier Payment - ' || (SELECT COALESCE(b.bill_number, b.invoice_number) FROM payables b WHERE b.id = p.bill_id)) = transactions.title
                LIMIT 1
            )
            WHERE bill_id IS NULL AND (category = 'Supplier Payment' OR title LIKE 'Supplier Payment%');
        """)
    except Exception as e:
        print(f"Transaction link migration notice: {e}")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS risk_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'WARNING', 'INFO')),
        shortfall_amount REAL DEFAULT 0.0,
        projected_date TEXT,
        root_cause TEXT NOT NULL,
        mitigation_action TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RESOLVED')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule_key TEXT,
        related_record_type TEXT,
        related_record_id INTEGER,
        category TEXT NOT NULL DEFAULT 'Working Capital',
        title TEXT NOT NULL,
        explanation TEXT,
        description TEXT,
        priority TEXT NOT NULL DEFAULT 'Medium',
        urgency TEXT DEFAULT 'MEDIUM',
        related_risk TEXT,
        relevant_date TEXT,
        suggested_action TEXT,
        action_cta TEXT DEFAULT 'Review Action',
        estimated_impact REAL,
        impact_amount REAL DEFAULT 0.0,
        impact_description TEXT,
        effort TEXT DEFAULT 'LOW',
        status TEXT NOT NULL DEFAULT 'New',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Safe column migration for recommendations
    cursor.execute("PRAGMA table_info(recommendations);")
    rec_cols = {col['name'] for col in cursor.fetchall()}
    rec_to_add = [
        ('rule_key', 'TEXT'),
        ('related_record_type', 'TEXT'),
        ('related_record_id', 'INTEGER'),
        ('explanation', 'TEXT'),
        ('priority', "TEXT DEFAULT 'Medium'"),
        ('related_risk', 'TEXT'),
        ('relevant_date', 'TEXT'),
        ('suggested_action', 'TEXT'),
        ('estimated_impact', 'REAL'),
        ('impact_description', 'TEXT'),
        ('created_at', 'TEXT'),
        ('updated_at', 'TEXT')
    ]
    for col_name, col_type in rec_to_add:
        if col_name not in rec_cols:
            try:
                cursor.execute(f"ALTER TABLE recommendations ADD COLUMN {col_name} {col_type};")
            except Exception as e:
                print(f"Recommendations column migration note for {col_name}: {e}")

    # Backfill recommendations
    cursor.execute("""
        UPDATE recommendations
        SET explanation = CASE WHEN (explanation IS NULL OR explanation = '') THEN description ELSE explanation END,
            priority = CASE 
                WHEN (priority IS NULL OR priority = '') THEN 
                    CASE WHEN UPPER(urgency) = 'HIGH' THEN 'High' 
                         WHEN UPPER(urgency) = 'LOW' THEN 'Low' 
                         ELSE 'Medium' END 
                ELSE priority END,
            suggested_action = CASE WHEN (suggested_action IS NULL OR suggested_action = '') THEN action_cta ELSE suggested_action END,
            estimated_impact = CASE WHEN estimated_impact IS NULL THEN impact_amount ELSE estimated_impact END,
            status = CASE WHEN status = 'ACTIVE' THEN 'New' WHEN status = 'APPLIED' THEN 'Resolved' ELSE status END,
            updated_at = CASE WHEN updated_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END;
    """)

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_recs_rule_key ON recommendations(rule_key);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_recs_status ON recommendations(status);")
    except Exception as e:
        print(f"Recommendations index note: {e}")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS simulations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        scenario_type TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        projected_impact_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scenarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scenario_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        adjustment_type TEXT NOT NULL,
        related_record_type TEXT,
        related_record_id INTEGER,
        original_date TEXT,
        original_amount REAL,
        hypothetical_date TEXT NOT NULL,
        hypothetical_amount REAL NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_scenario_adj_scen_id ON scenario_adjustments(scenario_id);")
    except Exception as e:
        print(f"Scenario adjustments index note: {e}")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS forecast_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opening_balance REAL NOT NULL DEFAULT 842500.0,
        minimum_cash_buffer REAL NOT NULL DEFAULT 500000.0,
        start_date TEXT,
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # -------------------------------------------------------------
    # Data Import Center & Reconciliation Schema
    # -------------------------------------------------------------
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS import_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_number TEXT UNIQUE NOT NULL,
        import_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT,
        file_size INTEGER DEFAULT 0,
        total_rows INTEGER DEFAULT 0,
        valid_rows INTEGER DEFAULT 0,
        invalid_rows INTEGER DEFAULT 0,
        duplicate_rows INTEGER DEFAULT 0,
        imported_rows INTEGER DEFAULT 0,
        status TEXT DEFAULT 'COMPLETED',
        summary_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS import_row_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
        row_number INTEGER NOT NULL,
        raw_data TEXT,
        error_reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS uploaded_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_name TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        document_type TEXT DEFAULT 'invoice',
        ocr_status TEXT DEFAULT 'PENDING',
        ocr_message TEXT,
        extracted_data TEXT,
        review_status TEXT DEFAULT 'PENDING_REVIEW',
        created_record_type TEXT,
        created_record_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reconciliation_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        matched_type TEXT NOT NULL,
        matched_record_id INTEGER NOT NULL,
        match_method TEXT DEFAULT 'MANUAL',
        confidence_score REAL DEFAULT 1.0,
        match_reason TEXT,
        status TEXT DEFAULT 'CONFIRMED',
        payment_record_id INTEGER,
        confirmed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reconciliation_audit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reconciliation_id INTEGER,
        transaction_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_import_err_batch_id ON import_row_errors(batch_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_recon_tx_id ON reconciliation_records(transaction_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_recon_matched ON reconciliation_records(matched_type, matched_record_id);")
    except Exception as e:
        print(f"Import/Reconciliation index note: {e}")

    conn.commit()

    # Check if business profile exists; if not, seed realistic MSME financial data
    cursor.execute("SELECT COUNT(*) as count FROM business_profile;")
    count = cursor.fetchone()['count']
    if count == 0:
        seed_starter_data(cursor, conn)

    # Initialize forecast settings if empty
    cursor.execute("SELECT COUNT(*) as count FROM forecast_settings;")
    if cursor.fetchone()['count'] == 0:
        cursor.execute("SELECT current_balance, target_reserve FROM business_profile LIMIT 1;")
        prof = cursor.fetchone()
        ob = float(prof['current_balance']) if prof else 842500.0
        mb = float(prof['target_reserve']) if prof else 500000.0
        today_str = datetime.now().strftime('%Y-%m-%d')
        cursor.execute("""
            INSERT INTO forecast_settings (id, opening_balance, minimum_cash_buffer, start_date, notes)
            VALUES (1, ?, ?, ?, ?);
        """, (ob, mb, today_str, 'User-configured starting balance and minimum buffer'))
        conn.commit()

    conn.close()

def seed_starter_data(cursor, conn):
    """Seed comprehensive and realistic MSME financial records."""
    today = datetime.now()
    
    # 1. Business Profile: Apex Precision Dynamics (Precision Engineering MSME)
    cursor.execute("""
        INSERT INTO business_profile (name, industry, currency, current_balance, target_reserve, monthly_burn)
        VALUES (?, ?, ?, ?, ?, ?);
    """, ('Apex Precision Dynamics', 'Precision Engineering & Tooling', '₹', 842500.00, 500000.00, 385000.00))

    # 2. Historical & Current Transactions
    tx_seeds = [
        # Recent inflows (Income)
        ('HyperScale Robotics Payment Received', (today - timedelta(days=2)).strftime('%Y-%m-%d'), (today - timedelta(days=2)).strftime('%Y-%m-%d'), 'INCOME', 'Customer Payment', 'Inv #INV-2024-890 Payment Received', 285000.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'HyperScale Robotics', 'ACH-99381', 'ACH-99381'),
        ('Contract Milestone #2 Deposit', (today - timedelta(days=5)).strftime('%Y-%m-%d'), (today - timedelta(days=5)).strftime('%Y-%m-%d'), 'INCOME', 'Sales Revenue', 'Contract Milestone #2 Deposit', 194000.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'AeroMech Industries', 'WIRE-4482', 'WIRE-4482'),
        ('Special Tooling Advance Order', (today - timedelta(days=12)).strftime('%Y-%m-%d'), (today - timedelta(days=12)).strftime('%Y-%m-%d'), 'INCOME', 'Customer Payment', 'Special Tooling Order Advance', 142000.00, 'COMPLETED', 'Completed', 'UPI', 'Titan Energy Systems', 'ACH-11029', 'ACH-11029'),
        ('Clean Tech R&D Incentive Rebate', (today - timedelta(days=18)).strftime('%Y-%m-%d'), (today - timedelta(days=18)).strftime('%Y-%m-%d'), 'INCOME', 'Other Income', 'State Clean Tech R&D Rebate', 75000.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'Dept of Revenue', 'DIR-5521', 'DIR-5521'),
        ('Custom CNC Batch #12 Delivery', (today - timedelta(days=25)).strftime('%Y-%m-%d'), (today - timedelta(days=25)).strftime('%Y-%m-%d'), 'INCOME', 'Customer Payment', 'Custom CNC Batch #12 Delivery', 221000.00, 'COMPLETED', 'Completed', 'Cheque', 'Metro Transport Logistics', 'ACH-88301', 'ACH-88301'),
        
        # Recent outflows (Expenses)
        ('High-Tensile Alloy Stock Batch 4', (today - timedelta(days=1)).strftime('%Y-%m-%d'), (today - timedelta(days=1)).strftime('%Y-%m-%d'), 'EXPENSE', 'Supplier Payment', 'High-Tensile Alloy Stock Batch 4', 168000.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'Vulcan Alloy Suppliers', 'CHK-1049', 'CHK-1049'),
        ('Industrial Power & Cooling Grid Bill', (today - timedelta(days=3)).strftime('%Y-%m-%d'), (today - timedelta(days=3)).strftime('%Y-%m-%d'), 'EXPENSE', 'Utilities', 'Industrial Power & Cooling Grid', 42500.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'GridPower Utility Co.', 'ACH-3392', 'ACH-3392'),
        ('Bi-weekly Machinist & Staff Wages', (today - timedelta(days=8)).strftime('%Y-%m-%d'), (today - timedelta(days=8)).strftime('%Y-%m-%d'), 'EXPENSE', 'Salary', 'Bi-weekly Staff & Machinist Wages', 186000.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'Apex Payroll Services', 'PAY-2024-19', 'PAY-2024-19'),
        ('5-Axis CNC Mill Lease Payment', (today - timedelta(days=14)).strftime('%Y-%m-%d'), (today - timedelta(days=14)).strftime('%Y-%m-%d'), 'EXPENSE', 'Equipment', '5-Axis CNC Mill Lease Payment', 58000.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'Haas Capital Financing', 'AUTOPAY-09', 'AUTOPAY-09'),
        ('Diamond Carbide Drill Bits & Coolant', (today - timedelta(days=21)).strftime('%Y-%m-%d'), (today - timedelta(days=21)).strftime('%Y-%m-%d'), 'EXPENSE', 'Inventory Purchase', 'Diamond Carbide Drill Bits & Coolant', 34000.00, 'COMPLETED', 'Completed', 'Card', 'Sandvik Coromant', 'CARD-8834', 'CARD-8834'),
        ('Bi-weekly Machinist Wages (Cycle 18)', (today - timedelta(days=23)).strftime('%Y-%m-%d'), (today - timedelta(days=23)).strftime('%Y-%m-%d'), 'EXPENSE', 'Salary', 'Bi-weekly Staff & Machinist Wages', 186000.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'Apex Payroll Services', 'PAY-2024-18', 'PAY-2024-18'),
        ('Heavy Freight Shipping to Port', (today - timedelta(days=28)).strftime('%Y-%m-%d'), (today - timedelta(days=28)).strftime('%Y-%m-%d'), 'EXPENSE', 'Transportation', 'Heavy Freight Shipping to Port', 31500.00, 'COMPLETED', 'Completed', 'Bank Transfer', 'Maersk Overland Logistics', 'INV-5519', 'INV-5519')
    ]
    cursor.executemany("""
        INSERT INTO transactions (title, date, transaction_date, type, category, description, amount, status, payment_status, payment_method, counterparty, reference, reference_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, tx_seeds)

    # 3. Accounts Receivable (Invoices pending/overdue from customers)
    rec_seeds = [
        ('INV-2025-101', 'HyperScale Robotics', 345000.00, (today + timedelta(days=14)).strftime('%Y-%m-%d'), 'PENDING', 'LOW', 0, (today + timedelta(days=14)).strftime('%Y-%m-%d'), 'Net-30 regular corporate client'),
        ('INV-2025-098', 'OmniTech Auto Systems', 268000.00, (today - timedelta(days=18)).strftime('%Y-%m-%d'), 'OVERDUE', 'HIGH', 18, (today + timedelta(days=5)).strftime('%Y-%m-%d'), 'Delayed payment pending quality sign-off; cashflow friction'),
        ('INV-2025-104', 'AeroMech Industries', 182000.00, (today + timedelta(days=6)).strftime('%Y-%m-%d'), 'PENDING', 'LOW', 0, (today + timedelta(days=6)).strftime('%Y-%m-%d'), 'Final delivery clearance invoice'),
        ('INV-2025-089', 'Midwest AgTech Equip', 124000.00, (today - timedelta(days=32)).strftime('%Y-%m-%d'), 'OVERDUE', 'HIGH', 32, (today + timedelta(days=2)).strftime('%Y-%m-%d'), 'Multiple follow-ups; CFO promised wire this week'),
        ('INV-2025-109', 'BioShield Instruments', 215000.00, (today + timedelta(days=26)).strftime('%Y-%m-%d'), 'PENDING', 'MEDIUM', 0, (today + timedelta(days=28)).strftime('%Y-%m-%d'), 'Medical sensor housings milestone payment'),
        ('INV-2025-112', 'Nexus Energy Corp', 159000.00, (today + timedelta(days=38)).strftime('%Y-%m-%d'), 'PENDING', 'LOW', 0, (today + timedelta(days=38)).strftime('%Y-%m-%d'), 'Turbine blades subcontract Net-45')
    ]
    cursor.executemany("""
        INSERT INTO receivables (invoice_number, customer_name, amount, due_date, status, risk_level, days_overdue, expected_payment_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, rec_seeds)

    # 4. Accounts Payable (Upcoming vendor commitments & bills)
    pay_seeds = [
        ('PO-VULCAN-881', 'Vulcan Alloy Suppliers', 248000.00, (today + timedelta(days=10)).strftime('%Y-%m-%d'), 'PENDING', 'CRITICAL', 'Supplier Payment', 'Required for Titanium stock delivery; halt in production if unpaid'),
        ('PAYROLL-OCT-B', 'Apex Workforce Payroll', 192000.00, (today + timedelta(days=7)).strftime('%Y-%m-%d'), 'PENDING', 'CRITICAL', 'Salary', 'Mandatory bi-weekly engineering and machinist payroll'),
        ('LEASE-HAAS-11', 'Haas Capital Financing', 58000.00, (today + timedelta(days=15)).strftime('%Y-%m-%d'), 'PENDING', 'HIGH', 'Equipment', '5-Axis CNC Mill lease contract'),
        ('SRV-CLOUD-99', 'Azure & ERP Cloud Systems', 14500.00, (today + timedelta(days=4)).strftime('%Y-%m-%d'), 'PENDING', 'STANDARD', 'Utilities', 'CAD/CAM cloud licenses and ERP hosting'),
        ('VND-PKG-331', 'PackRight Industrial Cargo', 36000.00, (today + timedelta(days=20)).strftime('%Y-%m-%d'), 'PENDING', 'STANDARD', 'Transportation', 'Crating materials and wooden pallet supplies'),
        ('MNT-SPINDLE-04', 'Precision Maintenance Group', 48500.00, (today + timedelta(days=25)).strftime('%Y-%m-%d'), 'PENDING', 'STANDARD', 'Equipment', 'Scheduled spindle calibration and preventive maintenance')
    ]
    cursor.executemany("""
        INSERT INTO payables (invoice_number, vendor_name, amount, due_date, status, priority, category, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """, pay_seeds)

    # 5. Early Warning Risk Alerts
    risk_seeds = [
        ('Cash Runway Dip Below Safe Buffer', 'CRITICAL', 184500.00, (today + timedelta(days=11)).strftime('%Y-%m-%d'),
         'Upcoming payroll (₹1,92,000) + Vulcan Alloy (₹2,48,000) coincide within 72 hours, while ₹3,92,000 in overdue receivables remains uncollected.',
         'Offer 2% prompt settlement discount on OmniTech (₹2.68L) or negotiate 14-day split term with Vulcan Alloy.', 'ACTIVE'),
        ('High Receivables Concentration Risk', 'WARNING', 345000.00, (today + timedelta(days=14)).strftime('%Y-%m-%d'),
         'HyperScale Robotics accounts for 26.7% of all projected monthly revenue. Any 10-day delay pushes net runway under 18 days.',
         'Establish proactive milestone check-in 5 days before due date; request advance delivery confirmation.', 'ACTIVE'),
        ('Vendor Payment Clustered on Day 10-15', 'INFO', 306000.00, (today + timedelta(days=12)).strftime('%Y-%m-%d'),
         'Over 55% of monthly trade payables mature within a 5-day corridor.',
         'Request staggered bi-weekly disbursement schedule with suppliers.', 'ACTIVE')
    ]
    cursor.executemany("""
        INSERT INTO risk_alerts (title, severity, shortfall_amount, projected_date, root_cause, mitigation_action, status)
        VALUES (?, ?, ?, ?, ?, ?, ?);
    """, risk_seeds)

    # 6. Strategic Recommendations
    rec_actions = [
        ('Working Capital', 'Accelerate OmniTech Overdue Collection with 2% Instant Discount', 262640.00, 'HIGH',
         'OmniTech (₹2,68,000) is 18 days overdue. An instant 2% prompt-pay discount can unlock ~₹2.62L cash within 48 hours to secure payroll.',
         'Send Discount Settlement Offer', 'LOW'),
        ('Payables Optimization', 'Stagger Vulcan Alloy Raw Material Bill into 2 Tranches', 124000.00, 'HIGH',
         'Splitting the ₹2,48,000 invoice into 50% now and 50% in 21 days preserves ₹1,24,000 liquidity during critical payroll week.',
         'Generate Supplier Reschedule Letter', 'LOW'),
        ('Revenue Enhancement', 'Invoice Milestone 3 for HyperScale Robotics Early', 172500.00, 'MEDIUM',
         'HyperScale phase 2 testing passed ahead of schedule; requesting advance invoicing for 50% of phase 3 boosts reserve.',
         'Draft Advance Invoice Notice', 'MEDIUM'),
        ('Operating Efficiency', 'Consolidate Cloud & Software Subscriptions', 6500.00, 'LOW',
         'Auditing underutilized CAD/CAM seat licenses will trim recurring monthly operational burn by ₹6,500/mo.',
         'Review Subscription Audit', 'LOW')
    ]
    cursor.executemany("""
        INSERT INTO recommendations (category, title, impact_amount, urgency, description, action_cta, effort)
        VALUES (?, ?, ?, ?, ?, ?, ?);
    """, rec_actions)

    conn.commit()
