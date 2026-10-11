from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from backend.database import get_db_connection

payables_bp = Blueprint('payables', __name__, url_prefix='/api/payables')

def derive_bill_status(outstanding_balance, due_date_str):
    """
    Derive supplier bill status based on remaining outstanding balance and due date.
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

def bill_row_to_dict(row, cursor):
    """Convert a payable/bill database row to a standardized dictionary with calculated balances."""
    d = dict(row)
    bill_id = d['id']
    
    # Calculate amount paid from supplier_payments table
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum, COUNT(*) as pay_count FROM supplier_payments WHERE bill_id = ?;", (bill_id,))
    pay_data = cursor.fetchone()
    amount_paid = round(float(pay_data['paid_sum']), 2)
    payments_count = int(pay_data['pay_count'])
    
    bill_amount = round(float(d.get('bill_amount') or d.get('amount') or 0.0), 2)
    outstanding_balance = max(0.0, round(bill_amount - amount_paid, 2))
    
    due_date = d.get('due_date') or datetime.now().strftime('%Y-%m-%d')
    status = derive_bill_status(outstanding_balance, due_date)
    
    bill_num = d.get('bill_number') or d.get('invoice_number') or f"BILL-{bill_id}"
    supplier = d.get('supplier_name') or d.get('vendor_name') or 'Supplier'

    return {
        "id": bill_id,
        "bill_number": bill_num,
        "invoice_number": bill_num,
        "supplier_name": supplier,
        "vendor_name": supplier,
        "supplier_contact": d.get('supplier_contact') or '',
        "bill_date": d.get('bill_date') or d.get('created_at', '')[:10] or datetime.now().strftime('%Y-%m-%d'),
        "due_date": due_date,
        "bill_amount": bill_amount,
        "amount": bill_amount,
        "amount_paid": amount_paid,
        "outstanding_balance": outstanding_balance,
        "description": d.get('description') or d.get('notes') or '',
        "notes": d.get('description') or d.get('notes') or '',
        "payment_terms": d.get('payment_terms') or 'Net 30',
        "status": status,
        "priority": d.get('priority') or 'STANDARD',
        "category": d.get('category') or 'General',
        "payments_count": payments_count,
        "created_at": d.get('created_at', ''),
        "updated_at": d.get('updated_at', '')
    }

@payables_bp.route('', methods=['GET'])
def list_payables():
    """List supplier bills with search, status filtering, date range, and sorting."""
    search = request.args.get('search')
    status_filter = request.args.get('status')
    start_date = request.args.get('start_date') or request.args.get('date_from')
    end_date = request.args.get('end_date') or request.args.get('date_to')
    sort_by = request.args.get('sort_by', 'due_date')
    sort_order = request.args.get('sort_order', 'asc').lower()

    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM payables WHERE 1=1"
    params = []

    if search and search.strip():
        term = f"%{search.strip()}%"
        query += " AND (bill_number LIKE ? OR invoice_number LIKE ? OR supplier_name LIKE ? OR vendor_name LIKE ? OR supplier_contact LIKE ? OR description LIKE ? OR notes LIKE ?)"
        params.extend([term, term, term, term, term, term, term])

    if start_date:
        query += " AND due_date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND due_date <= ?"
        params.append(end_date)

    cursor.execute(query, params)
    rows = cursor.fetchall()

    bills = [bill_row_to_dict(r, cursor) for r in rows]

    # Include scheduled pending direct expenses (e.g. Employee Salaries, Electricity, Rent)
    cursor.execute("""
        SELECT * FROM transactions
        WHERE UPPER(type) IN ('EXPENSE', 'OUTFLOW')
          AND UPPER(COALESCE(payment_status, status, '')) IN ('PENDING', 'OVERDUE')
          AND bill_id IS NULL;
    """)
    for tx in cursor.fetchall():
        amt = float(tx['amount'] or 0.0)
        due = str(tx['due_date'] or tx['transaction_date'] or tx['date'] or '')[:10]
        st = derive_bill_status(amt, due)
        bills.append({
            "id": f"tx_{tx['id']}",
            "transaction_id": tx['id'],
            "bill_number": tx['reference_number'] or tx['reference'] or f"EXP-{tx['id']}",
            "supplier_name": tx['counterparty'] or tx['title'] or 'Direct Commitment',
            "supplier_contact": '',
            "bill_amount": amt,
            "amount_paid": 0.0,
            "outstanding_balance": amt,
            "bill_date": str(tx['transaction_date'] or tx['date'] or '')[:10],
            "due_date": due,
            "status": st,
            "priority": 'High' if 'salary' in str(tx['title']).lower() else 'Normal',
            "category": tx['category'] or 'Expense',
            "description": tx['title'] or tx['description'] or 'Scheduled Expense',
            "notes": tx['description'] or '',
            "payments_count": 0,
            "is_direct_expense": True
        })

    conn.close()

    # Apply status filter if provided
    if status_filter and status_filter.strip().upper() != 'ALL':
        target = status_filter.strip().lower()
        bills = [b for b in bills if b['status'].lower() == target]

    # Apply sorting
    reverse = (sort_order == 'desc')
    if sort_by == 'outstanding' or sort_by == 'outstanding_balance':
        bills.sort(key=lambda x: x['outstanding_balance'], reverse=reverse)
    elif sort_by == 'amount' or sort_by == 'bill_amount':
        bills.sort(key=lambda x: x['bill_amount'], reverse=reverse)
    elif sort_by == 'supplier':
        bills.sort(key=lambda x: x['supplier_name'].lower(), reverse=reverse)
    else:  # default 'due_date'
        bills.sort(key=lambda x: x['due_date'], reverse=reverse)

    return jsonify({
        "success": True,
        "total": len(bills),
        "data": bills
    }), 200

@payables_bp.route('/summary', methods=['GET'])
def get_payables_summary():
    """
    Calculate and return the 4 compact summary KPIs for Accounts Payable:
    1. Total Outstanding (all unpaid balances)
    2. Overdue Amount (past due date)
    3. Due in the Next 7 Days (approaching)
    4. Amount Paid This Month (from supplier_payments)
    """
    today_str = datetime.now().strftime('%Y-%m-%d')
    seven_days_str = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    first_of_month = datetime.now().strftime('%Y-%m-01')
    
    # Calculate last day of current month
    next_month = datetime.now().replace(day=28) + timedelta(days=4)
    last_of_month = (next_month - timedelta(days=next_month.day)).strftime('%Y-%m-%d')

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM payables;")
    rows = cursor.fetchall()

    total_outstanding = 0.0
    overdue_amount = 0.0
    due_in_7_days = 0.0
    paid_count = 0
    overdue_count = 0
    pending_count = 0

    for r in rows:
        b = bill_row_to_dict(r, cursor)
        bal = b['outstanding_balance']
        st = b['status']
        
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

    # Include scheduled pending direct expenses (e.g. Employee Salaries, Electricity, Rent)
    cursor.execute("""
        SELECT * FROM transactions
        WHERE UPPER(type) IN ('EXPENSE', 'OUTFLOW')
          AND UPPER(COALESCE(payment_status, status, '')) IN ('PENDING', 'OVERDUE')
          AND bill_id IS NULL;
    """)
    tx_pending = cursor.fetchall()
    for tx in tx_pending:
        amt = float(tx['amount'] or 0.0)
        due = str(tx['due_date'] or tx['transaction_date'] or tx['date'] or '')[:10]
        st = derive_bill_status(amt, due)
        total_outstanding += amt
        if st == 'Overdue':
            overdue_amount += amt
            overdue_count += 1
        elif st == 'Due Soon':
            due_in_7_days += amt
            pending_count += 1
        else:
            pending_count += 1

    # Amount paid this month from supplier_payments
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as month_sum
        FROM supplier_payments
        WHERE payment_date >= ? AND payment_date <= ?;
    """, (first_of_month, last_of_month))
    month_data = cursor.fetchone()
    paid_this_month = float(month_data['month_sum'])

    conn.close()

    return jsonify({
        "success": True,
        "summary": {
            "total_outstanding": round(total_outstanding, 2),
            "overdue_amount": round(overdue_amount, 2),
            "due_in_next_7_days": round(due_in_7_days, 2),
            "amount_paid_this_month": round(paid_this_month, 2),
            "total_bills": len(rows) + len(tx_pending),
            "overdue_count": overdue_count,
            "pending_count": pending_count,
            "paid_count": paid_count
        }
    }), 200

@payables_bp.route('/<bill_id>', methods=['GET'])
def get_payable_detail(bill_id):
    """Retrieve single bill with complete supplier disbursement history."""
    conn = get_db_connection()
    cursor = conn.cursor()

    bill_id_str = str(bill_id)
    if bill_id_str.startswith('tx_'):
        tx_id = int(bill_id_str.replace('tx_', ''))
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
        tx = cursor.fetchone()
        conn.close()
        if not tx:
            return jsonify({"success": False, "error": f"Transaction #{tx_id} not found"}), 404
        amt = float(tx['amount'] or 0.0)
        due = str(tx['due_date'] or tx['transaction_date'] or tx['date'] or '')[:10]
        st = derive_bill_status(amt, due)
        return jsonify({
            "success": True,
            "data": {
                "id": f"tx_{tx['id']}",
                "transaction_id": tx['id'],
                "bill_number": tx['reference_number'] or tx['reference'] or f"EXP-{tx['id']}",
                "supplier_name": tx['counterparty'] or tx['title'] or 'Direct Commitment',
                "supplier_contact": '',
                "bill_amount": amt,
                "amount": amt,
                "amount_paid": 0.0,
                "outstanding_balance": amt,
                "bill_date": str(tx['transaction_date'] or tx['date'] or '')[:10],
                "due_date": due,
                "status": st,
                "priority": 'High' if 'salary' in str(tx['title']).lower() else 'Normal',
                "category": tx['category'] or 'Expense',
                "description": tx['title'] or tx['description'] or 'Scheduled Expense',
                "notes": tx['description'] or '',
                "payments_count": 0,
                "payments": [],
                "is_direct_expense": True
            }
        }), 200

    try:
        bill_int_id = int(bill_id)
    except ValueError:
        conn.close()
        return jsonify({"success": False, "error": "Invalid bill ID"}), 400

    cursor.execute("SELECT * FROM payables WHERE id = ?;", (bill_int_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return jsonify({"success": False, "error": f"Bill #{bill_id} not found"}), 404

    b = bill_row_to_dict(row, cursor)

    # Fetch associated supplier payments
    cursor.execute("""
        SELECT * FROM supplier_payments
        WHERE bill_id = ?
        ORDER BY payment_date DESC, created_at DESC;
    """, (bill_int_id,))
    payments = [dict(p) for p in cursor.fetchall()]
    conn.close()

    b['payments'] = payments
    return jsonify({
        "success": True,
        "data": b
    }), 200

@payables_bp.route('', methods=['POST'])
def create_payable():
    """Create a new supplier bill with validation and optional initial payment."""
    data = request.get_json() or {}

    bill_number = data.get('bill_number') or data.get('invoice_number')
    if not bill_number or not str(bill_number).strip():
        return jsonify({"success": False, "error": "Bill Number is required"}), 400
    bill_number = str(bill_number).strip().upper()

    supplier_name = data.get('supplier_name') or data.get('vendor_name')
    if not supplier_name or not str(supplier_name).strip():
        return jsonify({"success": False, "error": "Supplier Name is required"}), 400
    supplier_name = str(supplier_name).strip()

    raw_amount = data.get('bill_amount') or data.get('amount')
    try:
        bill_amount = float(raw_amount)
        if bill_amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Bill Amount must be greater than zero"}), 400

    bill_date = data.get('bill_date')
    if not bill_date:
        return jsonify({"success": False, "error": "Bill Date is required"}), 400
    try:
        datetime.strptime(str(bill_date)[:10], '%Y-%m-%d')
        bill_date = str(bill_date)[:10]
    except ValueError:
        return jsonify({"success": False, "error": "Bill Date must be in YYYY-MM-DD format"}), 400

    due_date = data.get('due_date')
    if not due_date:
        return jsonify({"success": False, "error": "Due Date is required"}), 400
    try:
        datetime.strptime(str(due_date)[:10], '%Y-%m-%d')
        due_date = str(due_date)[:10]
    except ValueError:
        return jsonify({"success": False, "error": "Due Date must be in YYYY-MM-DD format"}), 400

    if due_date < bill_date:
        return jsonify({"success": False, "error": "Due Date cannot precede Bill Date"}), 400

    raw_paid = data.get('amount_paid', 0.0)
    try:
        amount_paid = float(raw_paid or 0.0)
        if amount_paid < 0:
            return jsonify({"success": False, "error": "Amount Paid cannot be negative"}), 400
        if amount_paid > bill_amount:
            return jsonify({"success": False, "error": "Amount Paid cannot exceed the Bill Amount"}), 400
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid Amount Paid format"}), 400

    supplier_contact = str(data.get('supplier_contact') or '').strip()
    description = str(data.get('description') or data.get('notes') or '').strip()
    payment_terms = str(data.get('payment_terms') or 'Net 30').strip()
    category = str(data.get('category') or 'Supplier Payment').strip()
    priority = str(data.get('priority') or 'STANDARD').strip().upper()

    conn = get_db_connection()
    cursor = conn.cursor()

    # Check for duplicate bill number
    cursor.execute("SELECT id FROM payables WHERE bill_number = ? OR invoice_number = ?;", (bill_number, bill_number))
    if cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "error": f"Bill number '{bill_number}' already exists"}), 400

    initial_outstanding = bill_amount - amount_paid
    initial_status = derive_bill_status(initial_outstanding, due_date)
    db_status = 'PAID' if initial_status == 'Paid' else ('OVERDUE' if initial_status == 'Overdue' else 'PENDING')

    cursor.execute("""
        INSERT INTO payables (
            bill_number, invoice_number, supplier_name, vendor_name,
            supplier_contact, bill_date, due_date, bill_amount, amount,
            description, notes, payment_terms, category, priority, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
    """, (
        bill_number,
        bill_number,
        supplier_name,
        supplier_name,
        supplier_contact,
        bill_date,
        due_date,
        bill_amount,
        bill_amount,
        description,
        description,
        payment_terms,
        category,
        priority,
        db_status
    ))
    new_id = cursor.lastrowid

    # If initial payment was made, record disbursement and cash outflow transaction
    if amount_paid > 0:
        payment_method = str(data.get('payment_method') or 'Bank Transfer').strip()
        ref_no = str(data.get('reference_number') or f"PAY-{bill_number}-01").strip()
        
        cursor.execute("""
            INSERT INTO supplier_payments (
                bill_id, amount, payment_date, payment_method, reference_number, notes
            ) VALUES (?, ?, ?, ?, ?, ?);
        """, (
            new_id,
            amount_paid,
            bill_date,
            payment_method,
            ref_no,
            "Initial disbursement on bill entry"
        ))

        # Realize cash transaction in ledger
        cursor.execute("""
            INSERT INTO transactions (
                title, date, transaction_date, type, category, description,
                amount, status, payment_status, payment_method, counterparty,
                reference, reference_number, updated_at
            ) VALUES (?, ?, ?, 'OUTFLOW', 'Supplier Payment', ?, ?, 'COMPLETED', 'Completed', ?, ?, ?, ?, CURRENT_TIMESTAMP);
        """, (
            f"Supplier Payment - {bill_number}",
            bill_date,
            bill_date,
            f"Disbursement for Bill {bill_number} to {supplier_name}",
            amount_paid,
            payment_method,
            supplier_name,
            ref_no,
            ref_no
        ))

        # Deduct from business profile balance
        cursor.execute("UPDATE business_profile SET current_balance = current_balance - ?;", (amount_paid,))

    conn.commit()

    cursor.execute("SELECT * FROM payables WHERE id = ?;", (new_id,))
    created_row = cursor.fetchone()
    result = bill_row_to_dict(created_row, cursor)
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Bill #{bill_number} created successfully",
        "data": result
    }), 201

@payables_bp.route('/<bill_id>', methods=['PUT'])
def update_payable(bill_id):
    """Update bill metadata. Supports both bills and direct scheduled expense transactions."""
    data = request.get_json() or {}
    bill_id_str = str(bill_id)

    if bill_id_str.startswith('tx_'):
        tx_id = int(bill_id_str.replace('tx_', ''))
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
        tx = cursor.fetchone()
        if not tx:
            conn.close()
            return jsonify({"success": False, "error": f"Transaction #{tx_id} not found"}), 404

        supplier_name = str(data.get('supplier_name') or data.get('vendor_name') or tx['counterparty'] or tx['title']).strip()
        description = str(data.get('description') or tx['description'] or tx['title']).strip()
        due_date = data.get('due_date') or tx['due_date']
        raw_amt = data.get('bill_amount') or data.get('amount') or tx['amount']
        amt = float(raw_amt)

        cursor.execute("""
            UPDATE transactions
            SET title = ?, counterparty = ?, description = ?, due_date = ?, amount = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (supplier_name, supplier_name, description, due_date, amt, tx_id))
        conn.commit()
        cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
        updated_tx = cursor.fetchone()
        conn.close()
        return jsonify({
            "success": True,
            "message": "Direct payable transaction updated successfully",
            "data": {
                "id": f"tx_{updated_tx['id']}",
                "bill_number": updated_tx['reference_number'] or updated_tx['reference'] or f"EXP-{updated_tx['id']}",
                "supplier_name": updated_tx['counterparty'] or updated_tx['title'],
                "bill_amount": float(updated_tx['amount']),
                "amount": float(updated_tx['amount']),
                "outstanding_balance": float(updated_tx['amount']),
                "due_date": updated_tx['due_date'],
                "status": derive_bill_status(float(updated_tx['amount']), updated_tx['due_date']),
                "is_direct_expense": True
            }
        }), 200

    try:
        bill_int_id = int(bill_id)
    except ValueError:
        return jsonify({"success": False, "error": "Invalid bill ID"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM payables WHERE id = ?;", (bill_int_id,))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        return jsonify({"success": False, "error": f"Bill #{bill_id} not found"}), 404

    # Calculate existing amount paid
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM supplier_payments WHERE bill_id = ?;", (bill_int_id,))
    amount_paid = float(cursor.fetchone()['paid_sum'])

    supplier_name = str(data.get('supplier_name') or data.get('vendor_name') or existing['supplier_name'] or existing['vendor_name']).strip()
    supplier_contact = str(data.get('supplier_contact') if 'supplier_contact' in data else existing['supplier_contact'] or '').strip()
    description = str(data.get('description') if 'description' in data else existing['description'] or existing['notes'] or '').strip()
    payment_terms = str(data.get('payment_terms') or existing['payment_terms'] or 'Net 30').strip()
    category = str(data.get('category') or existing['category'] or 'Supplier Payment').strip()
    priority = str(data.get('priority') or existing['priority'] or 'STANDARD').strip().upper()

    bill_date = data.get('bill_date') or existing['bill_date'] or existing['created_at'][:10]
    due_date = data.get('due_date') or existing['due_date']

    if 'bill_date' in data and data['bill_date']:
        try:
            datetime.strptime(str(data['bill_date'])[:10], '%Y-%m-%d')
            bill_date = str(data['bill_date'])[:10]
        except ValueError:
            conn.close()
            return jsonify({"success": False, "error": "Invalid Bill Date format"}), 400

    if 'due_date' in data and data['due_date']:
        try:
            datetime.strptime(str(data['due_date'])[:10], '%Y-%m-%d')
            due_date = str(data['due_date'])[:10]
        except ValueError:
            conn.close()
            return jsonify({"success": False, "error": "Invalid Due Date format"}), 400

    if due_date < bill_date:
        conn.close()
        return jsonify({"success": False, "error": "Due Date cannot precede Bill Date"}), 400

    # Bill amount check
    if 'bill_amount' in data or 'amount' in data:
        raw_amount = data.get('bill_amount') or data.get('amount')
        try:
            bill_amount = float(raw_amount)
            if bill_amount <= 0:
                raise ValueError()
            if bill_amount < amount_paid:
                conn.close()
                return jsonify({
                    "success": False,
                    "error": f"Bill Amount (₹{bill_amount:,.2f}) cannot be less than already disbursed payments (₹{amount_paid:,.2f})"
                }), 400
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"success": False, "error": "Bill Amount must be greater than zero"}), 400
    else:
        bill_amount = float(existing['bill_amount'] or existing['amount'])

    outstanding = max(0.0, bill_amount - amount_paid)
    new_status = derive_bill_status(outstanding, due_date)
    db_status = 'PAID' if new_status == 'Paid' else ('OVERDUE' if new_status == 'Overdue' else 'PENDING')

    cursor.execute("""
        UPDATE payables
        SET supplier_name = ?,
            vendor_name = ?,
            supplier_contact = ?,
            bill_date = ?,
            due_date = ?,
            bill_amount = ?,
            amount = ?,
            description = ?,
            notes = ?,
            payment_terms = ?,
            category = ?,
            priority = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?;
    """, (
        supplier_name,
        supplier_name,
        supplier_contact,
        bill_date,
        due_date,
        bill_amount,
        bill_amount,
        description,
        description,
        payment_terms,
        category,
        priority,
        db_status,
        bill_int_id
    ))
    conn.commit()

    cursor.execute("SELECT * FROM payables WHERE id = ?;", (bill_int_id,))
    updated_row = cursor.fetchone()
    result = bill_row_to_dict(updated_row, cursor)
    conn.close()

    return jsonify({
        "success": True,
        "message": "Bill updated successfully",
        "data": result
    }), 200

@payables_bp.route('/<bill_id>', methods=['DELETE'])
def delete_payable(bill_id):
    """
    Delete a bill safely. Guards against deleting records with associated payments
    unless force=true is passed. Also supports direct scheduled transaction deletion.
    """
    bill_id_str = str(bill_id)
    if bill_id_str.startswith('tx_'):
        tx_id = int(bill_id_str.replace('tx_', ''))
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions WHERE id = ?;", (tx_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"Direct expense #{tx_id} deleted successfully"}), 200

    try:
        bill_int_id = int(bill_id)
    except ValueError:
        return jsonify({"success": False, "error": "Invalid bill ID"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM payables WHERE id = ?;", (bill_int_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"success": False, "error": f"Bill #{bill_id} not found"}), 404
    existing = dict(row)

    cursor.execute("SELECT COUNT(*) as pay_count, COALESCE(SUM(amount), 0) as pay_total FROM supplier_payments WHERE bill_id = ?;", (bill_int_id,))
    pay_info = cursor.fetchone()
    pay_count = int(pay_info['pay_count'])

    force = request.args.get('force', 'false').lower() == 'true'
    bill_label = existing.get('bill_number') or existing.get('invoice_number') or f"#{bill_id}"

    if pay_count > 0 and not force:
        conn.close()
        return jsonify({
            "success": False,
            "error": f"Cannot delete bill {bill_label} because it has {pay_count} recorded payment(s) totaling ₹{pay_info['pay_total']:,.2f}. Delete payments first or confirm with force=true."
        }), 400

    # If force is true, reconcile the cash balance before deleting payments
    if pay_count > 0 and force:
        revert_sum = float(pay_info['pay_total'])
        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (revert_sum,))
        cursor.execute("DELETE FROM supplier_payments WHERE bill_id = ?;", (bill_int_id,))

    cursor.execute("DELETE FROM payables WHERE id = ?;", (bill_int_id,))
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Bill {bill_label} deleted successfully"
    }), 200

@payables_bp.route('/<bill_id>/payments', methods=['POST'])
def record_supplier_payment(bill_id):
    """
    Record a supplier payment against a bill or direct scheduled expense.
    Supports partial and full disbursements, validates that payment does not exceed outstanding balance,
    creates a cash outflow transaction, and deducts from business cash balance.
    """
    data = request.get_json() or {}
    bill_id_str = str(bill_id)

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

    if bill_id_str.startswith('tx_'):
        tx_id = int(bill_id_str.replace('tx_', ''))
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
        ref_number = str(data.get('reference_number') or f"DISB-TX-{tx_id}-{datetime.now().strftime('%m%d')}").strip()

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
                ) VALUES (?, ?, ?, 'OUTFLOW', 'Supplier Payment', ?, ?, 'COMPLETED', 'Completed', ?, ?, ?, ?, CURRENT_TIMESTAMP);
            """, (
                f"Disbursement - {tx['title']}",
                payment_date,
                payment_date,
                f"Partial disbursement: {notes}" if notes else f"Partial disbursement for {tx['title']}",
                payment_amount,
                payment_method,
                tx['counterparty'] or tx['title'],
                ref_number,
                ref_number
            ))

        cursor.execute("UPDATE business_profile SET current_balance = current_balance - ?;", (payment_amount,))
        conn.commit()
        conn.close()
        return jsonify({
            "success": True,
            "message": f"Disbursement of ₹{payment_amount:,.2f} recorded successfully.",
            "data": {
                "amount": payment_amount,
                "outstanding_balance": rem_balance,
                "status": "Paid" if rem_balance <= 0.001 else "Pending"
            }
        }), 201

    try:
        bill_int_id = int(bill_id)
    except ValueError:
        return jsonify({"success": False, "error": "Invalid bill ID"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM payables WHERE id = ?;", (bill_int_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"success": False, "error": f"Bill #{bill_id} not found"}), 404
    existing = dict(row)

    bill_amount = float(existing['bill_amount'] or existing['amount'] or 0.0)

    # Calculate current amount paid and remaining balance
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM supplier_payments WHERE bill_id = ?;", (bill_id,))
    current_paid = float(cursor.fetchone()['paid_sum'])
    current_outstanding = max(0.0, round(bill_amount - current_paid, 2))

    if current_outstanding <= 0.001:
        conn.close()
        return jsonify({"success": False, "error": "This bill is already fully settled."}), 400

    raw_amount = data.get('amount')
    try:
        payment_amount = float(raw_amount)
        if payment_amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        conn.close()
        return jsonify({"success": False, "error": "Payment amount must be greater than zero."}), 400

    if round(payment_amount, 2) > round(current_outstanding, 2):
        conn.close()
        return jsonify({
            "success": False,
            "error": f"Payment amount (₹{payment_amount:,.2f}) exceeds outstanding balance of ₹{current_outstanding:,.2f}."
        }), 400

    payment_date = data.get('payment_date') or datetime.now().strftime('%Y-%m-%d')
    try:
        datetime.strptime(str(payment_date)[:10], '%Y-%m-%d')
        payment_date = str(payment_date)[:10]
    except ValueError:
        conn.close()
        return jsonify({"success": False, "error": "Payment date must be in YYYY-MM-DD format."}), 400

    payment_method = str(data.get('payment_method') or 'Bank Transfer').strip()
    bill_label = existing.get('bill_number') or existing.get('invoice_number') or f"BILL-{bill_id}"
    ref_number = str(data.get('reference_number') or f"DISB-{bill_label}-{datetime.now().strftime('%m%d')}").strip()
    notes = str(data.get('notes') or '').strip()
    supplier_name = existing.get('supplier_name') or existing.get('vendor_name') or 'Supplier'

    # Database transaction: payment record + cash outflow transaction + balance update + status update
    try:
        cursor.execute("""
            INSERT INTO supplier_payments (
                bill_id, amount, payment_date, payment_method, reference_number, notes
            ) VALUES (?, ?, ?, ?, ?, ?);
        """, (
            bill_id,
            payment_amount,
            payment_date,
            payment_method,
            ref_number,
            notes
        ))
        payment_id = cursor.lastrowid

        # Update remaining outstanding and derive new status
        new_outstanding = max(0.0, round(current_outstanding - payment_amount, 2))
        new_status = derive_bill_status(new_outstanding, existing['due_date'])
        db_status = 'PAID' if new_status == 'Paid' else ('OVERDUE' if new_status == 'Overdue' else 'PENDING')
        
        cursor.execute("UPDATE payables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", (db_status, bill_id))

        # Create cash transaction in transactions ledger
        cursor.execute("""
            INSERT INTO transactions (
                title, date, transaction_date, type, category, description,
                amount, status, payment_status, payment_method, counterparty,
                reference, reference_number, bill_id, updated_at
            ) VALUES (?, ?, ?, 'OUTFLOW', 'Supplier Payment', ?, ?, 'COMPLETED', 'Completed', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
        """, (
            f"Supplier Payment - {bill_label}",
            payment_date,
            payment_date,
            f"Disbursement for Bill {bill_label}: {notes}" if notes else f"Disbursement for Bill {bill_label}",
            payment_amount,
            payment_method,
            supplier_name,
            ref_number,
            ref_number,
            bill_id
        ))

        # Deduct from business cash balance
        cursor.execute("UPDATE business_profile SET current_balance = current_balance - ?;", (payment_amount,))

        conn.commit()

        cursor.execute("SELECT * FROM payables WHERE id = ?;", (bill_id,))
        updated_bill = bill_row_to_dict(cursor.fetchone(), cursor)

        conn.close()

        return jsonify({
            "success": True,
            "message": f"Disbursement of ₹{payment_amount:,.2f} recorded successfully for Bill #{bill_label}.",
            "data": {
                "payment_id": payment_id,
                "amount": payment_amount,
                "outstanding_balance": new_outstanding,
                "status": new_status,
                "bill": updated_bill
            }
        }), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({"success": False, "error": f"Failed to record disbursement: {str(e)}"}), 500

@payables_bp.route('/<bill_id>/pay', methods=['POST'])
def mark_payable_paid(bill_id):
    """
    Convenience endpoint to disburse the remaining outstanding balance of a bill or direct scheduled expense in full.
    """
    bill_id_str = str(bill_id)
    if bill_id_str.startswith('tx_'):
        tx_id = int(bill_id_str.replace('tx_', ''))
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
        cursor.execute("UPDATE business_profile SET current_balance = current_balance - ?;", (amt,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"Direct expense of ₹{amt:,.2f} settled in full and deducted from cash balance."}), 200

    try:
        bill_int_id = int(bill_id)
    except ValueError:
        return jsonify({"success": False, "error": "Invalid bill ID"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM payables WHERE id = ?;", (bill_int_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"success": False, "error": "Bill not found"}), 404

    bill_amount = float(row['bill_amount'] or row['amount'] or 0.0)
    cursor.execute("SELECT COALESCE(SUM(amount), 0) as paid_sum FROM supplier_payments WHERE bill_id = ?;", (bill_int_id,))
    current_paid = float(cursor.fetchone()['paid_sum'])
    outstanding = max(0.0, round(bill_amount - current_paid, 2))
    conn.close()

    if outstanding <= 0.001:
        return jsonify({"success": True, "message": "Bill is already fully settled."}), 200

    # Delegate to record_supplier_payment
    request_data = {
        "amount": outstanding,
        "payment_date": datetime.now().strftime('%Y-%m-%d'),
        "payment_method": "Bank Transfer",
        "notes": "Settled in full via Quick Action"
    }
    
    with payables_bp.test_request_context(json=request_data):
        return record_supplier_payment(bill_int_id)
