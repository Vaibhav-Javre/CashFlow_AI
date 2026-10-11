from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from backend.database import get_db_connection

receivables_bp = Blueprint('receivables', __name__, url_prefix='/api/receivables')

def derive_invoice_status(outstanding_balance, due_date_str):
    """
    Derive invoice status based on remaining outstanding balance and due date.
    - Paid: outstanding balance <= 0
    - Overdue: outstanding balance > 0 and due_date < today
    - Due Soon: outstanding balance > 0 and due_date between today and today + 7 days
    - Pending: outstanding balance > 0 and due_date > today + 7 days
    """
    if outstanding_balance <= 0.001:
        return 'Paid'
    
    today_str = datetime.now().strftime('%Y-%m-%d')
    seven_days_later_str = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    
    clean_due = str(due_date_str)[:10] if due_date_str else today_str
    
    if clean_due < today_str:
        return 'Overdue'
    elif clean_due <= seven_days_later_str:
        return 'Due Soon'
    else:
        return 'Pending'

def invoice_row_to_dict(row, cursor):
    """Convert an invoice database row to a standardized dictionary with calculated balances."""
    d = dict(row)
    inv_id = d['id']
    
    # Calculate amount paid from customer_payments table
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum, COUNT(*) as pay_count FROM customer_payments WHERE invoice_id = ?;", (inv_id,))
    pay_data = cursor.fetchone()
    amount_paid = round(float(pay_data['paid_sum']), 2)
    payments_count = int(pay_data['pay_count'])
    
    invoice_amount = round(float(d.get('invoice_amount') or d.get('amount') or 0.0), 2)
    outstanding_balance = max(0.0, round(invoice_amount - amount_paid, 2))
    
    due_date = d.get('due_date') or datetime.now().strftime('%Y-%m-%d')
    status = derive_invoice_status(outstanding_balance, due_date)
    
    return {
        "id": inv_id,
        "invoice_number": d.get('invoice_number', ''),
        "customer_name": d.get('customer_name', ''),
        "customer_contact": d.get('customer_contact') or '',
        "invoice_date": d.get('invoice_date') or d.get('created_at', '')[:10] or datetime.now().strftime('%Y-%m-%d'),
        "due_date": due_date,
        "invoice_amount": invoice_amount,
        "amount": invoice_amount,
        "amount_paid": amount_paid,
        "outstanding_balance": outstanding_balance,
        "description": d.get('description') or d.get('notes') or '',
        "notes": d.get('description') or d.get('notes') or '',
        "payment_terms": d.get('payment_terms') or 'Net 30',
        "status": status,
        "risk_level": d.get('risk_level') or 'LOW',
        "days_overdue": int(d.get('days_overdue') or 0),
        "payments_count": payments_count,
        "created_at": d.get('created_at', ''),
        "updated_at": d.get('updated_at', '')
    }

@receivables_bp.route('', methods=['GET'])
def list_receivables():
    """List customer invoices with search, status filtering, date range, and sorting."""
    search = request.args.get('search')
    status_filter = request.args.get('status')
    start_date = request.args.get('start_date') or request.args.get('date_from')
    end_date = request.args.get('end_date') or request.args.get('date_to')
    sort_by = request.args.get('sort_by', 'due_date')
    sort_order = request.args.get('sort_order', 'asc').lower()

    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM receivables WHERE 1=1"
    params = []

    if search and search.strip():
        term = f"%{search.strip()}%"
        query += " AND (invoice_number LIKE ? OR customer_name LIKE ? OR customer_contact LIKE ? OR description LIKE ? OR notes LIKE ?)"
        params.extend([term, term, term, term, term])

    if start_date:
        query += " AND due_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND due_date <= ?"
        params.append(end_date)

    cursor.execute(query, params)
    rows = cursor.fetchall()

    invoices = [invoice_row_to_dict(r, cursor) for r in rows]

    # Also fetch direct scheduled receivables pending in transactions
    tx_query = """
        SELECT * FROM transactions
        WHERE UPPER(type) IN ('INCOME', 'INFLOW')
          AND UPPER(COALESCE(payment_status, status, '')) IN ('PENDING', 'OVERDUE')
          AND invoice_id IS NULL
    """
    tx_params = []
    if search and search.strip():
        term = f"%{search.strip()}%"
        tx_query += " AND (title LIKE ? OR description LIKE ? OR counterparty LIKE ? OR reference_number LIKE ?)"
        tx_params.extend([term, term, term, term])
    if start_date:
        tx_query += " AND COALESCE(due_date, transaction_date, date) >= ?"
        tx_params.append(start_date)
    if end_date:
        tx_query += " AND COALESCE(due_date, transaction_date, date) <= ?"
        tx_params.append(end_date)

    cursor.execute(tx_query, tx_params)
    for tx in cursor.fetchall():
        amt = float(tx['amount'] or 0.0)
        due = str(tx['due_date'] or tx['transaction_date'] or tx['date'] or '')[:10]
        st = derive_invoice_status(amt, due)
        invoices.append({
            "id": f"tx_{tx['id']}",
            "transaction_id": tx['id'],
            "invoice_number": tx['reference_number'] or tx['reference'] or f"INC-{tx['id']}",
            "customer_name": tx['counterparty'] or tx['title'] or 'Direct Customer Inflow',
            "customer_contact": '',
            "invoice_amount": amt,
            "amount": amt,
            "amount_paid": 0.0,
            "outstanding_balance": amt,
            "invoice_date": str(tx['transaction_date'] or tx['date'] or '')[:10],
            "due_date": due,
            "status": st,
            "risk_level": 'LOW',
            "category": tx['category'] or 'Income',
            "description": tx['title'] or tx['description'] or 'Scheduled Inflow',
            "notes": tx['description'] or '',
            "payment_terms": 'Net 30',
            "days_overdue": 0,
            "payments_count": 0,
            "is_direct_income": True,
            "created_at": str(tx['created_at'] or ''),
            "updated_at": str(tx['updated_at'] or '')
        })

    conn.close()

    # Apply status filter if provided
    if status_filter and status_filter.strip().upper() != 'ALL':
        target = status_filter.strip().lower()
        invoices = [inv for inv in invoices if inv['status'].lower() == target]

    # Apply sorting
    reverse = (sort_order == 'desc')
    if sort_by == 'outstanding' or sort_by == 'outstanding_balance':
        invoices.sort(key=lambda x: x['outstanding_balance'], reverse=reverse)
    elif sort_by == 'amount' or sort_by == 'invoice_amount':
        invoices.sort(key=lambda x: x['invoice_amount'], reverse=reverse)
    elif sort_by == 'customer':
        invoices.sort(key=lambda x: x['customer_name'].lower(), reverse=reverse)
    else:  # default 'due_date'
        invoices.sort(key=lambda x: x['due_date'], reverse=reverse)

    return jsonify({
        "success": True,
        "total": len(invoices),
        "data": invoices
    }), 200

@receivables_bp.route('/summary', methods=['GET'])
def get_receivables_summary():
    """
    Calculate and return the 4 compact summary KPIs for Accounts Receivable:
    1. Total Outstanding (all unpaid balances)
    2. Overdue Amount (past due date)
    3. Due in the Next 7 Days (approaching)
    4. Amount Received This Month (from customer_payments)
    """
    today_str = datetime.now().strftime('%Y-%m-%d')
    seven_days_str = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    first_of_month = datetime.now().strftime('%Y-%m-01')
    
    # Calculate last day of current month
    next_month = datetime.now().replace(day=28) + timedelta(days=4)
    last_of_month = (next_month - timedelta(days=next_month.day)).strftime('%Y-%m-%d')

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM receivables;")
    rows = cursor.fetchall()

    total_outstanding = 0.0
    overdue_amount = 0.0
    due_in_7_days = 0.0
    paid_count = 0
    overdue_count = 0
    pending_count = 0

    for r in rows:
        inv = invoice_row_to_dict(r, cursor)
        bal = inv['outstanding_balance']
        st = inv['status']
        
        if bal > 0.001:
            total_outstanding += bal
            if st == 'Overdue':
                overdue_amount += bal
                overdue_count += 1
            elif st == 'Due Soon':
                due_in_7_days += bal
                pending_count += 1
            else:
                pending_count += 1
        else:
            paid_count += 1

    # Include scheduled pending direct receivables from transactions
    cursor.execute("""
        SELECT * FROM transactions
        WHERE UPPER(type) IN ('INCOME', 'INFLOW')
          AND UPPER(COALESCE(payment_status, status, '')) IN ('PENDING', 'OVERDUE')
          AND invoice_id IS NULL;
    """)
    tx_pending = cursor.fetchall()
    for tx in tx_pending:
        amt = float(tx['amount'] or 0.0)
        due = str(tx['due_date'] or tx['transaction_date'] or tx['date'] or '')[:10]
        st = derive_invoice_status(amt, due)
        total_outstanding += amt
        if st == 'Overdue':
            overdue_amount += amt
            overdue_count += 1
        elif st == 'Due Soon':
            due_in_7_days += amt
            pending_count += 1
        else:
            pending_count += 1

    # Amount received this month from customer_payments
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as month_sum
        FROM customer_payments
        WHERE payment_date >= ? AND payment_date <= ?;
    """, (first_of_month, last_of_month))
    month_data = cursor.fetchone()
    received_this_month = float(month_data['month_sum'])

    conn.close()

    return jsonify({
        "success": True,
        "summary": {
            "total_outstanding": round(total_outstanding, 2),
            "overdue_amount": round(overdue_amount, 2),
            "due_in_next_7_days": round(due_in_7_days, 2),
            "amount_received_this_month": round(received_this_month, 2),
            "total_invoices": len(rows) + len(tx_pending),
            "overdue_count": overdue_count,
            "pending_count": pending_count,
            "paid_count": paid_count
        }
    }), 200

@receivables_bp.route('/<invoice_id>', methods=['GET'])
def get_receivable_detail(invoice_id):
    """Retrieve single invoice with complete customer payment history."""
    conn = get_db_connection()
    cursor = conn.cursor()

    inv_id_str = str(invoice_id)
    if inv_id_str.startswith('tx_'):
        tx_id = int(inv_id_str.replace('tx_', ''))
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
        tx = cursor.fetchone()
        conn.close()
        if not tx:
            return jsonify({"success": False, "error": f"Transaction #{tx_id} not found"}), 404
        amt = float(tx['amount'] or 0.0)
        due = str(tx['due_date'] or tx['transaction_date'] or tx['date'] or '')[:10]
        st = derive_invoice_status(amt, due)
        return jsonify({
            "success": True,
            "data": {
                "id": f"tx_{tx['id']}",
                "transaction_id": tx['id'],
                "invoice_number": tx['reference_number'] or tx['reference'] or f"INC-{tx['id']}",
                "customer_name": tx['counterparty'] or tx['title'] or 'Direct Customer Inflow',
                "customer_contact": '',
                "invoice_amount": amt,
                "amount": amt,
                "amount_paid": 0.0,
                "outstanding_balance": amt,
                "invoice_date": str(tx['transaction_date'] or tx['date'] or '')[:10],
                "due_date": due,
                "status": st,
                "risk_level": 'LOW',
                "category": tx['category'] or 'Income',
                "description": tx['title'] or tx['description'] or 'Scheduled Inflow',
                "notes": tx['description'] or '',
                "payment_terms": 'Net 30',
                "days_overdue": 0,
                "payments_count": 0,
                "payments": [],
                "is_direct_income": True,
                "created_at": str(tx['created_at'] or ''),
                "updated_at": str(tx['updated_at'] or '')
            }
        }), 200

    try:
        inv_int_id = int(invoice_id)
    except ValueError:
        conn.close()
        return jsonify({"success": False, "error": "Invalid invoice ID"}), 400

    cursor.execute("SELECT * FROM receivables WHERE id = ?;", (inv_int_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({"success": False, "error": f"Invoice #{invoice_id} not found"}), 404

    inv = invoice_row_to_dict(row, cursor)

    # Fetch associated customer payments
    cursor.execute("""
        SELECT * FROM customer_payments
        WHERE invoice_id = ?
        ORDER BY payment_date DESC, created_at DESC;
    """, (inv_int_id,))
    payments = [dict(p) for p in cursor.fetchall()]
    conn.close()

    inv['payments'] = payments
    return jsonify({
        "success": True,
        "data": inv
    }), 200

@receivables_bp.route('', methods=['POST'])
def create_receivable():
    """Create a new invoice with validation and optional initial payment."""
    data = request.get_json() or {}

    invoice_number = data.get('invoice_number')
    if not invoice_number or not str(invoice_number).strip():
        return jsonify({"success": False, "error": "Invoice Number is required"}), 400
    invoice_number = str(invoice_number).strip().upper()

    customer_name = data.get('customer_name')
    if not customer_name or not str(customer_name).strip():
        return jsonify({"success": False, "error": "Customer Name is required"}), 400
    customer_name = str(customer_name).strip()

    raw_amount = data.get('invoice_amount') or data.get('amount')
    try:
        invoice_amount = float(raw_amount)
        if invoice_amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invoice Amount must be greater than zero"}), 400

    invoice_date = data.get('invoice_date')
    if not invoice_date:
        return jsonify({"success": False, "error": "Invoice Date is required"}), 400
    try:
        datetime.strptime(str(invoice_date)[:10], '%Y-%m-%d')
        invoice_date = str(invoice_date)[:10]
    except ValueError:
        return jsonify({"success": False, "error": "Invoice Date must be in YYYY-MM-DD format"}), 400

    due_date = data.get('due_date')
    if not due_date:
        return jsonify({"success": False, "error": "Due Date is required"}), 400
    try:
        datetime.strptime(str(due_date)[:10], '%Y-%m-%d')
        due_date = str(due_date)[:10]
    except ValueError:
        return jsonify({"success": False, "error": "Due Date must be in YYYY-MM-DD format"}), 400

    if due_date < invoice_date:
        return jsonify({"success": False, "error": "Due Date cannot precede Invoice Date"}), 400

    raw_paid = data.get('amount_paid', 0.0)
    try:
        amount_paid = float(raw_paid or 0.0)
        if amount_paid < 0:
            return jsonify({"success": False, "error": "Amount Paid cannot be negative"}), 400
        if amount_paid > invoice_amount:
            return jsonify({"success": False, "error": "Amount Paid cannot exceed the Invoice Amount"}), 400
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid Amount Paid format"}), 400

    customer_contact = str(data.get('customer_contact') or '').strip()
    description = str(data.get('description') or data.get('notes') or '').strip()
    payment_terms = str(data.get('payment_terms') or 'Net 30').strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    # Check for duplicate invoice number
    cursor.execute("SELECT id FROM receivables WHERE invoice_number = ?;", (invoice_number,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "error": f"Invoice number '{invoice_number}' already exists"}), 400

    initial_outstanding = invoice_amount - amount_paid
    initial_status = derive_invoice_status(initial_outstanding, due_date)
    db_status = 'PAID' if initial_status == 'Paid' else ('OVERDUE' if initial_status == 'Overdue' else 'PENDING')

    cursor.execute("""
        INSERT INTO receivables (
            invoice_number, customer_name, customer_contact,
            invoice_date, due_date, invoice_amount, amount,
            description, notes, payment_terms, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
    """, (
        invoice_number,
        customer_name,
        customer_contact,
        invoice_date,
        due_date,
        invoice_amount,
        invoice_amount,
        description,
        description,
        payment_terms,
        db_status
    ))
    new_id = cursor.lastrowid

    # If initial payment was made, record payment and cash inflow transaction
    if amount_paid > 0:
        payment_method = str(data.get('payment_method') or 'Bank Transfer').strip()
        ref_no = str(data.get('reference_number') or f"PAY-{invoice_number}-01").strip()
        
        cursor.execute("""
            INSERT INTO customer_payments (
                invoice_id, amount, payment_date, payment_method, reference_number, notes
            ) VALUES (?, ?, ?, ?, ?, ?);
        """, (
            new_id,
            amount_paid,
            invoice_date,
            payment_method,
            ref_no,
            "Initial downpayment on invoice creation"
        ))

        # Realize cash transaction in ledger
        cursor.execute("""
            INSERT INTO transactions (
                title, date, transaction_date, type, category, description,
                amount, status, payment_status, payment_method, counterparty,
                reference, reference_number, updated_at
            ) VALUES (?, ?, ?, 'INFLOW', 'Customer Payment', ?, ?, 'COMPLETED', 'Completed', ?, ?, ?, ?, CURRENT_TIMESTAMP);
        """, (
            f"Customer Payment - {invoice_number}",
            invoice_date,
            invoice_date,
            f"Payment for Invoice {invoice_number} from {customer_name}",
            amount_paid,
            payment_method,
            customer_name,
            ref_no,
            ref_no
        ))

        # Update business profile balance
        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (amount_paid,))

    conn.commit()

    cursor.execute("SELECT * FROM receivables WHERE id = ?;", (new_id,))
    created_row = cursor.fetchone()
    result = invoice_row_to_dict(created_row, cursor)
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Invoice #{invoice_number} created successfully",
        "data": result
    }), 201

@receivables_bp.route('/<invoice_id>', methods=['PUT'])
def update_receivable(invoice_id):
    """Update invoice metadata. Supports both invoices and direct scheduled receivables."""
    data = request.get_json() or {}
    inv_id_str = str(invoice_id)

    if inv_id_str.startswith('tx_'):
        tx_id = int(inv_id_str.replace('tx_', ''))
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
        tx = cursor.fetchone()
        if not tx:
            conn.close()
            return jsonify({"success": False, "error": f"Transaction #{tx_id} not found"}), 404

        customer_name = str(data.get('customer_name') or tx['counterparty'] or tx['title']).strip()
        description = str(data.get('description') or tx['description'] or tx['title']).strip()
        due_date = data.get('due_date') or tx['due_date']
        raw_amt = data.get('invoice_amount') or data.get('amount') or tx['amount']
        amt = float(raw_amt)

        cursor.execute("""
            UPDATE transactions
            SET title = ?, counterparty = ?, description = ?, due_date = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (customer_name, customer_name, description, due_date, amt, tx_id))
        conn.commit()
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
        updated_tx = cursor.fetchone()
        conn.close()
        return jsonify({
            "success": True,
            "message": "Direct receivable transaction updated successfully",
            "data": {
                "id": f"tx_{updated_tx['id']}",
                "invoice_number": updated_tx['reference_number'] or updated_tx['reference'] or f"INC-{updated_tx['id']}",
                "customer_name": updated_tx['counterparty'] or updated_tx['title'],
                "invoice_amount": float(updated_tx['amount']),
                "amount": float(updated_tx['amount']),
                "outstanding_balance": float(updated_tx['amount']),
                "due_date": updated_tx['due_date'],
                "status": derive_invoice_status(float(updated_tx['amount']), updated_tx['due_date']),
                "is_direct_income": True
            }
        }), 200

    try:
        inv_int_id = int(invoice_id)
    except ValueError:
        return jsonify({"success": False, "error": "Invalid invoice ID"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM receivables WHERE id = ?;", (inv_int_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({"success": False, "error": f"Invoice #{invoice_id} not found"}), 404

    # Calculate existing amount paid
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM customer_payments WHERE invoice_id = ?;", (inv_int_id,))
    amount_paid = float(cursor.fetchone()['paid_sum'])

    customer_name = str(data.get('customer_name') or existing['customer_name']).strip()
    customer_contact = str(data.get('customer_contact') if 'customer_contact' in data else existing['customer_contact'] or '').strip()
    description = str(data.get('description') if 'description' in data else existing['description'] or existing['notes'] or '').strip()
    payment_terms = str(data.get('payment_terms') or existing['payment_terms'] or 'Net 30').strip()

    invoice_date = data.get('invoice_date') or existing['invoice_date'] or existing['created_at'][:10]
    due_date = data.get('due_date') or existing['due_date']

    if 'invoice_date' in data and data['invoice_date']:
        try:
            datetime.strptime(str(data['invoice_date'])[:10], '%Y-%m-%d')
            invoice_date = str(data['invoice_date'])[:10]
        except ValueError:
            conn.close()
            return jsonify({"success": False, "error": "Invalid Invoice Date format"}), 400

    if 'due_date' in data and data['due_date']:
        try:
            datetime.strptime(str(data['due_date'])[:10], '%Y-%m-%d')
            due_date = str(data['due_date'])[:10]
        except ValueError:
            conn.close()
            return jsonify({"success": False, "error": "Invalid Due Date format"}), 400

    if due_date < invoice_date:
        conn.close()
        return jsonify({"success": False, "error": "Due Date cannot precede Invoice Date"}), 400

    # Invoice amount check
    if 'invoice_amount' in data or 'amount' in data:
        raw_amount = data.get('invoice_amount') or data.get('amount')
        try:
            invoice_amount = float(raw_amount)
            if invoice_amount <= 0:
                raise ValueError()
            if invoice_amount < amount_paid:
                conn.close()
                return jsonify({
                    "success": False,
                    "error": f"Invoice Amount (₹{invoice_amount:,.2f}) cannot be less than already collected payments (₹{amount_paid:,.2f})"
                }), 400
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"success": False, "error": "Invoice Amount must be greater than zero"}), 400
    else:
        invoice_amount = float(existing['invoice_amount'] or existing['amount'])

    outstanding = max(0.0, invoice_amount - amount_paid)
    new_status = derive_invoice_status(outstanding, due_date)
    db_status = 'PAID' if new_status == 'Paid' else ('OVERDUE' if new_status == 'Overdue' else 'PENDING')

    cursor.execute("""
        UPDATE receivables
        SET customer_name = ?,
            customer_contact = ?,
            invoice_date = ?,
            due_date = ?,
            invoice_amount = ?,
            amount = ?,
            description = ?,
            notes = ?,
            payment_terms = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?;
    """, (
        customer_name,
        customer_contact,
        invoice_date,
        due_date,
        invoice_amount,
        invoice_amount,
        description,
        description,
        payment_terms,
        db_status,
        inv_int_id
    ))
    conn.commit()

    cursor.execute("SELECT * FROM receivables WHERE id = ?;", (inv_int_id,))
    updated_row = cursor.fetchone()
    result = invoice_row_to_dict(updated_row, cursor)
    conn.close()

    return jsonify({
        "success": True,
        "message": "Invoice updated successfully",
        "data": result
    }), 200

@receivables_bp.route('/<invoice_id>', methods=['DELETE'])
def delete_receivable(invoice_id):
    """
    Delete an invoice safely. Guards against deleting records with associated payments
    unless force=true is passed. Also supports direct scheduled transaction deletion.
    """
    inv_id_str = str(invoice_id)
    if inv_id_str.startswith('tx_'):
        tx_id = int(inv_id_str.replace('tx_', ''))
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions WHERE id = ?;", (tx_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"Direct receivable #{tx_id} deleted successfully"}), 200

    try:
        inv_int_id = int(invoice_id)
    except ValueError:
        return jsonify({"success": False, "error": "Invalid invoice ID"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM receivables WHERE id = ?;", (inv_int_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({"success": False, "error": f"Invoice #{invoice_id} not found"}), 404

    cursor.execute("SELECT COUNT(*) as pay_count, COALESCE(SUM(amount), 0) as pay_total FROM customer_payments WHERE invoice_id = ?;", (inv_int_id,))
    pay_info = cursor.fetchone()
    pay_count = int(pay_info['pay_count'])

    force = request.args.get('force', 'false').lower() == 'true'
    if pay_count > 0 and not force:
        conn.close()
        return jsonify({
            "success": False,
            "error": f"Cannot delete invoice #{existing['invoice_number']} because it has {pay_count} recorded payment(s) totaling ₹{pay_info['pay_total']:,.2f}. Delete payments first or confirm with force=true."
        }), 400

    # If force is true, reconcile the cash balance before deleting payments
    if pay_count > 0 and force:
        revert_sum = float(pay_info['pay_total'])
        cursor.execute("UPDATE business_profile SET current_balance = current_balance - ?;", (revert_sum,))
        cursor.execute("DELETE FROM customer_payments WHERE invoice_id = ?;", (inv_int_id,))

    cursor.execute("DELETE FROM receivables WHERE id = ?;", (inv_int_id,))
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Invoice #{existing['invoice_number']} deleted successfully"
    }), 200

@receivables_bp.route('/<invoice_id>/payments', methods=['POST'])
def record_customer_payment(invoice_id):
    """
    Record a customer payment against an invoice or direct receivable.
    Supports partial and full payments, validates that payment does not exceed outstanding balance,
    creates a cash inflow transaction, and updates the business cash balance.
    """
    data = request.get_json() or {}
    inv_id_str = str(invoice_id)

    raw_amount = data.get('amount')
    try:
        payment_amount = float(raw_amount)
        if payment_amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Payment amount must be greater than zero."}), 400

    payment_date = data.get('payment_date') or datetime.now().strftime('%Y-%m-%d')
    try:
        datetime.strptime(str(payment_date)[:10], '%Y-%m-%d')
        payment_date = str(payment_date)[:10]
    except ValueError:
        return jsonify({"success": False, "error": "Payment date must be in YYYY-MM-DD format."}), 400

    payment_method = str(data.get('payment_method') or 'Bank Transfer').strip()
    notes = str(data.get('notes') or '').strip()

    if inv_id_str.startswith('tx_'):
        tx_id = int(inv_id_str.replace('tx_', ''))
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
        tx = cursor.fetchone()
        if not tx:
            conn.close()
            return jsonify({"success": False, "error": f"Transaction #{tx_id} not found"}), 404

        tx_amt = float(tx['amount'] or 0.0)
        if round(payment_amount, 2) > round(tx_amt, 2):
            conn.close()
            return jsonify({"success": False, "error": f"Payment amount (₹{payment_amount:,.2f}) exceeds outstanding balance of ₹{tx_amt:,.2f}."}), 400

        rem_balance = max(0.0, round(tx_amt - payment_amount, 2))
        ref_number = str(data.get('reference_number') or f"RCPT-TX-{tx_id}-{datetime.now().strftime('%m%d')}").strip()

        if rem_balance <= 0.001:
            cursor.execute("""
                UPDATE transactions
                SET status = 'COMPLETED', payment_status = 'Completed', payment_method = ?,
                    date = ?, transaction_date = ?, reference = ?, reference_number = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?;
            """, (payment_method, payment_date, payment_date, ref_number, ref_number, tx_id))
        else:
            cursor.execute("""
                UPDATE transactions
                SET amount = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?;
            """, (rem_balance, tx_id))
            cursor.execute("""
                INSERT INTO transactions (
                    title, date, transaction_date, type, category, description,
                    amount, status, payment_status, payment_method, counterparty,
                    reference, reference_number, updated_at
                ) VALUES (?, ?, ?, 'INFLOW', 'Customer Payment', ?, ?, 'COMPLETED', 'Completed', ?, ?, ?, ?, CURRENT_TIMESTAMP);
            """, (
                f"Customer Payment - {tx['title']}",
                payment_date,
                payment_date,
                f"Partial collection: {notes}" if notes else f"Partial collection for {tx['title']}",
                payment_amount,
                payment_method,
                tx['counterparty'] or tx['title'],
                ref_number,
                ref_number
            ))

        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (payment_amount,))
        conn.commit()
        conn.close()
        return jsonify({
            "success": True,
            "message": f"Payment of ₹{payment_amount:,.2f} recorded successfully.",
            "data": {
                "amount": payment_amount,
                "outstanding_balance": rem_balance,
                "status": "Paid" if rem_balance <= 0.001 else "Pending"
            }
        }), 201

    try:
        inv_int_id = int(invoice_id)
    except ValueError:
        return jsonify({"success": False, "error": "Invalid invoice ID"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM receivables WHERE id = ?;", (inv_int_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({"success": False, "error": f"Invoice #{invoice_id} not found"}), 404

    inv_amount = float(existing['invoice_amount'] or existing['amount'] or 0.0)

    # Calculate current amount paid and remaining balance
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM customer_payments WHERE invoice_id = ?;", (inv_int_id,))
    current_paid = float(cursor.fetchone()['paid_sum'])
    current_outstanding = max(0.0, round(inv_amount - current_paid, 2))

    if current_outstanding <= 0.001:
        conn.close()
        return jsonify({"success": False, "error": "This invoice is already fully paid."}), 400

    if round(payment_amount, 2) > round(current_outstanding, 2):
        conn.close()
        return jsonify({
            "success": False,
            "error": f"Payment amount (₹{payment_amount:,.2f}) exceeds outstanding balance of ₹{current_outstanding:,.2f}."
        }), 400

    ref_number = str(data.get('reference_number') or f"RCPT-{existing['invoice_number']}-{datetime.now().strftime('%m%d')}").strip()

    # Database transaction: payment record + cash transaction + balance update + status update
    try:
        cursor.execute("""
            INSERT INTO customer_payments (
                invoice_id, amount, payment_date, payment_method, reference_number, notes
            ) VALUES (?, ?, ?, ?, ?, ?);
        """, (
            inv_int_id,
            payment_amount,
            payment_date,
            payment_method,
            ref_number,
            notes
        ))
        payment_id = cursor.lastrowid

        # Update remaining outstanding and derive new status
        new_outstanding = max(0.0, round(current_outstanding - payment_amount, 2))
        new_status = derive_invoice_status(new_outstanding, existing['due_date'])
        db_status = 'PAID' if new_status == 'Paid' else ('OVERDUE' if new_status == 'Overdue' else 'PENDING')
        
        cursor.execute("UPDATE receivables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", (db_status, inv_int_id))

        # Create cash transaction in transactions ledger
        cursor.execute("""
            INSERT INTO transactions (
                title, date, transaction_date, type, category, description,
                amount, status, payment_status, payment_method, counterparty,
                reference, reference_number, invoice_id, updated_at
            ) VALUES (?, ?, ?, 'INFLOW', 'Customer Payment', ?, ?, 'COMPLETED', 'Completed', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
        """, (
            f"Customer Payment - {existing['invoice_number']}",
            payment_date,
            payment_date,
            f"Payment for Invoice {existing['invoice_number']}: {notes}" if notes else f"Payment for Invoice {existing['invoice_number']}",
            payment_amount,
            payment_method,
            existing['customer_name'],
            ref_number,
            ref_number,
            inv_int_id
        ))

        # Deposit into business cash balance
        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (payment_amount,))

        conn.commit()

        cursor.execute("SELECT * FROM receivables WHERE id = ?;", (inv_int_id,))
        updated_inv = invoice_row_to_dict(cursor.fetchone(), cursor)

        conn.close()

        return jsonify({
            "success": True,
            "message": f"Payment of ₹{payment_amount:,.2f} recorded successfully for Invoice #{existing['invoice_number']}.",
            "data": {
                "payment_id": payment_id,
                "amount": payment_amount,
                "outstanding_balance": new_outstanding,
                "status": new_status,
                "invoice": updated_inv
            }
        }), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": f"Failed to record payment: {str(e)}"}), 500

@receivables_bp.route('/<invoice_id>/pay', methods=['POST'])
def mark_receivable_paid(invoice_id):
    """
    Convenience endpoint to pay the remaining outstanding balance of an invoice or direct receivable in full.
    """
    inv_id_str = str(invoice_id)
    if inv_id_str.startswith('tx_'):
        tx_id = int(inv_id_str.replace('tx_', ''))
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
        tx = cursor.fetchone()
        if not tx:
            conn.close()
            return jsonify({"success": False, "error": "Transaction not found"}), 404
        amt = float(tx['amount'] or 0.0)
        today = datetime.now().strftime('%Y-%m-%d')
        cursor.execute("""
            UPDATE transactions
            SET status = 'COMPLETED', payment_status = 'Completed', date = ?, transaction_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (today, today, tx_id))
        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (amt,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"Direct receivable of ₹{amt:,.2f} settled in full and added to cash balance."}), 200

    try:
        inv_int_id = int(invoice_id)
    except ValueError:
        return jsonify({"success": False, "error": "Invalid invoice ID"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM receivables WHERE id = ?;", (inv_int_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"success": False, "error": "Invoice not found"}), 404

    inv_amount = float(row['invoice_amount'] or row['amount'] or 0.0)
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM customer_payments WHERE invoice_id = ?;", (inv_int_id,))
    current_paid = float(cursor.fetchone()['paid_sum'])
    outstanding = max(0.0, round(inv_amount - current_paid, 2))
    conn.close()

    if outstanding <= 0.001:
        return jsonify({"success": True, "message": "Invoice is already fully settled."}), 200

    # Delegate to record_customer_payment
    request_data = {
        "amount": outstanding,
        "payment_date": datetime.now().strftime('%Y-%m-%d'),
        "payment_method": "Bank Transfer",
        "notes": "Settled in full via Quick Action"
    }
    
    with receivables_bp.test_request_context(json=request_data):
        return record_customer_payment(inv_int_id)

