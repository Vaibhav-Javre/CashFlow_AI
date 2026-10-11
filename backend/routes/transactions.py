from flask import Blueprint, jsonify, request
from datetime import datetime
from backend.database import get_db_connection

transactions_bp = Blueprint('transactions', __name__, url_prefix='/api/transactions')

def normalize_type(t):
    """Normalize transaction type to standard Income or Expense representation."""
    if not t:
        return 'Income'
    t_upper = str(t).strip().upper()
    if t_upper in ('INCOME', 'INFLOW'):
        return 'Income'
    if t_upper in ('EXPENSE', 'OUTFLOW'):
        return 'Expense'
    return t.capitalize()

def normalize_status(s):
    """Normalize payment status to Completed, Pending, or Overdue."""
    if not s:
        return 'Completed'
    s_upper = str(s).strip().upper()
    if s_upper == 'COMPLETED':
        return 'Completed'
    if s_upper == 'PENDING':
        return 'Pending'
    if s_upper == 'OVERDUE':
        return 'Overdue'
    return s.capitalize()

def row_to_dict(r):
    """Convert a database row into a standardized transaction dictionary."""
    d = dict(r)
    # Ensure title and transaction_date are present
    d['title'] = d.get('title') or d.get('description') or 'Untitled Transaction'
    d['transaction_date'] = d.get('transaction_date') or d.get('date') or datetime.now().strftime('%Y-%m-%d')
    d['date'] = d['transaction_date']
    d['type'] = normalize_type(d.get('type'))
    d['payment_status'] = normalize_status(d.get('payment_status') or d.get('status'))
    d['status'] = d['payment_status']
    d['payment_method'] = d.get('payment_method') or 'Bank Transfer'
    d['reference'] = d['reference_number']
    d['amount'] = float(d.get('amount', 0.0))
    d['invoice_id'] = d.get('invoice_id')
    d['bill_id'] = d.get('bill_id')
    return d

@transactions_bp.route('', methods=['GET'])
def list_transactions():
    """
    List transactions with support for search, type, category, status,
    date range filtering, sorting, and pagination.
    """
    tx_type = request.args.get('type')
    category = request.args.get('category')
    status = request.args.get('status') or request.args.get('payment_status')
    search = request.args.get('search')
    start_date = request.args.get('start_date') or request.args.get('date_from')
    end_date = request.args.get('end_date') or request.args.get('date_to')
    sort_by = request.args.get('sort_by', 'date')
    sort_order = request.args.get('sort_order', 'desc').lower()
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))

    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM transactions WHERE 1=1"
    count_query = "SELECT COUNT(*) as total FROM transactions WHERE 1=1"
    params = []

    if tx_type and tx_type.upper() != 'ALL':
        norm = normalize_type(tx_type)
        if norm == 'Income':
            query += " AND UPPER(type) IN ('INCOME', 'INFLOW')"
            count_query += " AND UPPER(type) IN ('INCOME', 'INFLOW')"
        else:
            query += " AND UPPER(type) IN ('EXPENSE', 'OUTFLOW')"
            count_query += " AND UPPER(type) IN ('EXPENSE', 'OUTFLOW')"

    if category and category.strip() and category.upper() != 'ALL':
        query += " AND category = ?"
        count_query += " AND category = ?"
        params.append(category.strip())

    if status and status.strip() and status.upper() != 'ALL':
        norm_st = normalize_status(status)
        query += " AND (UPPER(payment_status) = ? OR UPPER(status) = ?)"
        count_query += " AND (UPPER(payment_status) = ? OR UPPER(status) = ?)"
        params.extend([norm_st.upper(), norm_st.upper()])

    if start_date:
        query += " AND COALESCE(transaction_date, date) >= ?"
        count_query += " AND COALESCE(transaction_date, date) >= ?"
        params.append(start_date)

    if end_date:
        query += " AND COALESCE(transaction_date, date) <= ?"
        count_query += " AND COALESCE(transaction_date, date) <= ?"
        params.append(end_date)

    if search and search.strip():
        term = f"%{search.strip()}%"
        search_filter = " AND (title LIKE ? OR description LIKE ? OR counterparty LIKE ? OR reference_number LIKE ? OR reference LIKE ?)"
        query += search_filter
        count_query += search_filter
        params.extend([term, term, term, term, term])

    # Get total count for pagination
    cursor.execute(count_query, params)
    total_records = cursor.fetchone()['total']

    # Ordering
    order_dir = "ASC" if sort_order == "asc" else "DESC"
    if sort_by == 'amount':
        query += f" ORDER BY amount {order_dir}, id {order_dir}"
    elif sort_by == 'title':
        query += f" ORDER BY COALESCE(title, description) {order_dir}, id {order_dir}"
    else:
        query += f" ORDER BY COALESCE(transaction_date, date) {order_dir}, id {order_dir}"

    if limit > 0:
        offset = (page - 1) * limit
        query += " LIMIT ? OFFSET ?"
        fetch_params = params + [limit, offset]
    else:
        fetch_params = params

    cursor.execute(query, fetch_params)
    rows = cursor.fetchall()
    conn.close()

    total_pages = (total_records + limit - 1) // limit if limit > 0 else 1

    return jsonify({
        "success": True,
        "count": len(rows),
        "total": total_records,
        "page": page,
        "pages": total_pages,
        "data": [row_to_dict(r) for r in rows]
    }), 200

@transactions_bp.route('/<int:tx_id>', methods=['GET'])
def get_transaction(tx_id):
    """Retrieve a single transaction by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"success": False, "error": f"Transaction #{tx_id} not found"}), 404

    return jsonify({
        "success": True,
        "data": row_to_dict(row)
    }), 200

@transactions_bp.route('/summary', methods=['GET'])
def get_transactions_summary():
    """
    Calculate and return dynamic financial summaries from transactions
    filtered by optional date range, type, category, or status.
    """
    start_date = request.args.get('start_date') or request.args.get('date_from')
    end_date = request.args.get('end_date') or request.args.get('date_to')
    category = request.args.get('category')
    search = request.args.get('search')

    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM transactions WHERE 1=1"
    params = []

    if start_date:
        query += " AND COALESCE(transaction_date, date) >= ?"
        params.append(start_date)
    if end_date:
        query += " AND COALESCE(transaction_date, date) <= ?"
        params.append(end_date)
    if category and category.strip() and category.upper() != 'ALL':
        query += " AND category = ?"
        params.append(category.strip())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query += " AND (title LIKE ? OR description LIKE ? OR counterparty LIKE ? OR reference_number LIKE ? OR reference LIKE ?)"
        params.extend([term, term, term, term, term])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    total_income = 0.0
    total_expenses = 0.0
    completed_income = 0.0
    completed_expenses = 0.0
    pending_income = 0.0
    pending_expenses = 0.0
    overdue_income = 0.0
    overdue_expenses = 0.0

    for r in rows:
        d = row_to_dict(r)
        amt = d['amount']
        is_inc = (d['type'] == 'Income')
        st = d['payment_status']

        if is_inc:
            total_income += amt
            if st == 'Completed':
                completed_income += amt
            elif st == 'Pending':
                pending_income += amt
            elif st == 'Overdue':
                overdue_income += amt
        else:
            total_expenses += amt
            if st == 'Completed':
                completed_expenses += amt
            elif st == 'Pending':
                pending_expenses += amt
            elif st == 'Overdue':
                overdue_expenses += amt

    net_cash_flow = total_income - total_expenses
    net_realized_cash_flow = completed_income - completed_expenses

    return jsonify({
        "success": True,
        "summary": {
            "total_income": round(total_income, 2),
            "total_expenses": round(total_expenses, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "total_transactions": len(rows),
            "completed_income": round(completed_income, 2),
            "completed_expenses": round(completed_expenses, 2),
            "net_realized_cash_flow": round(net_realized_cash_flow, 2),
            "pending_income": round(pending_income, 2),
            "pending_expenses": round(pending_expenses, 2),
            "overdue_income": round(overdue_income, 2),
            "overdue_expenses": round(overdue_expenses, 2)
        }
    }), 200

@transactions_bp.route('', methods=['POST'])
def create_transaction():
    """Create a new financial transaction with rigorous validation."""
    data = request.get_json() or {}

    # Required field validations
    title = data.get('title') or data.get('description')
    if not title or not str(title).strip():
        return jsonify({"success": False, "error": "Transaction Title is required"}), 400

    raw_type = data.get('type')
    if not raw_type:
        return jsonify({"success": False, "error": "Transaction Type (Income or Expense) is required"}), 400

    tx_type = normalize_type(raw_type)
    if tx_type not in ('Income', 'Expense'):
        return jsonify({"success": False, "error": "Transaction Type must be Income or Expense"}), 400

    raw_amount = data.get('amount')
    try:
        amount = float(raw_amount)
        if amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Amount must be a positive number greater than zero"}), 400

    tx_date = data.get('transaction_date') or data.get('date')
    if not tx_date:
        return jsonify({"success": False, "error": "Transaction Date is required"}), 400
    try:
        datetime.strptime(str(tx_date)[:10], '%Y-%m-%d')
        tx_date = str(tx_date)[:10]
    except ValueError:
        return jsonify({"success": False, "error": "Transaction Date must be in YYYY-MM-DD format"}), 400

    category = data.get('category')
    if not category or not str(category).strip():
        return jsonify({"success": False, "error": "Category is required"}), 400

    payment_method = data.get('payment_method') or 'Bank Transfer'
    counterparty = data.get('counterparty', '')
    description = data.get('description', '')
    payment_status = normalize_status(data.get('payment_status') or data.get('status') or 'Completed')
    due_date = data.get('due_date')
    if due_date:
        try:
            datetime.strptime(str(due_date)[:10], '%Y-%m-%d')
            due_date = str(due_date)[:10]
        except ValueError:
            due_date = None

    ref_number = data.get('reference_number') or data.get('reference', '')

    invoice_id = data.get('invoice_id')
    bill_id = data.get('bill_id')

    conn = get_db_connection()
    cursor = conn.cursor()

    db_type = 'INFLOW' if tx_type == 'Income' else 'OUTFLOW'
    db_status = 'PENDING' if payment_status in ('Pending', 'Overdue') else 'COMPLETED'

    cursor.execute("""
        INSERT INTO transactions (
            title, date, transaction_date, type, category, description,
            amount, status, payment_status, payment_method, counterparty,
            reference, reference_number, due_date, invoice_id, bill_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
    """, (
        str(title).strip(),
        tx_date,
        tx_date,
        db_type,
        str(category).strip(),
        str(description).strip() if description else str(title).strip(),
        amount,
        db_status,
        payment_status,
        str(payment_method).strip(),
        str(counterparty).strip(),
        str(ref_number).strip(),
        str(ref_number).strip(),
        due_date,
        invoice_id,
        bill_id
    ))

    new_id = cursor.lastrowid

    # Financial realization: only completed transactions alter the real cash balance
    if payment_status == 'Completed':
        delta = amount if tx_type == 'Income' else -amount
        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (delta,))
        cursor.execute("UPDATE forecast_settings SET opening_balance = (SELECT current_balance FROM business_profile LIMIT 1), updated_at = CURRENT_TIMESTAMP;")

    conn.commit()

    cursor.execute("SELECT * FROM transactions WHERE id = ?;", (new_id,))
    created_row = cursor.fetchone()
    conn.close()

    return jsonify({
        "success": True,
        "message": "Transaction created successfully",
        "data": row_to_dict(created_row)
    }), 201

@transactions_bp.route('/<int:tx_id>', methods=['PUT'])
def update_transaction(tx_id):
    """Update an existing financial transaction with balance reconciliation."""
    data = request.get_json() or {}

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
    existing = cursor.fetchone()

    if not existing:
        conn.close()
        return jsonify({"success": False, "error": f"Transaction #{tx_id} not found"}), 404

    old = row_to_dict(existing)

    # Validate updates
    title = data.get('title') or data.get('description') or old['title']
    raw_type = data.get('type') or old['type']
    tx_type = normalize_type(raw_type)

    if 'amount' in data:
        try:
            amount = float(data['amount'])
            if amount <= 0:
                raise ValueError()
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"success": False, "error": "Amount must be a positive number greater than zero"}), 400
    else:
        amount = old['amount']

    tx_date = data.get('transaction_date') or data.get('date') or old['transaction_date']
    try:
        datetime.strptime(str(tx_date)[:10], '%Y-%m-%d')
        tx_date = str(tx_date)[:10]
    except ValueError:
        conn.close()
        return jsonify({"success": False, "error": "Transaction Date must be in YYYY-MM-DD format"}), 400

    category = data.get('category') or old['category']
    payment_method = data.get('payment_method') or old['payment_method']
    counterparty = data.get('counterparty') if 'counterparty' in data else old.get('counterparty', '')
    description = data.get('description') if 'description' in data else old.get('description', '')
    payment_status = normalize_status(data.get('payment_status') or data.get('status') or old['payment_status'])
    due_date = data.get('due_date') if 'due_date' in data else old.get('due_date')
    ref_number = data.get('reference_number') or data.get('reference') if ('reference_number' in data or 'reference' in data) else old.get('reference_number', '')

    # Reconcile realized cash balance:
    # 1. Revert previous completed impact
    if old['payment_status'] == 'Completed':
        revert_delta = -old['amount'] if old['type'] == 'Income' else old['amount']
        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (revert_delta,))

    # 2. Apply new completed impact
    if payment_status == 'Completed':
        apply_delta = amount if tx_type == 'Income' else -amount
        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (apply_delta,))

    cursor.execute("UPDATE forecast_settings SET opening_balance = (SELECT current_balance FROM business_profile LIMIT 1), updated_at = CURRENT_TIMESTAMP;")

    db_type = 'INFLOW' if tx_type == 'Income' else 'OUTFLOW'
    db_status = 'PENDING' if payment_status in ('Pending', 'Overdue') else 'COMPLETED'

    cursor.execute("""
        UPDATE transactions
        SET title = ?,
            date = ?,
            transaction_date = ?,
            type = ?,
            category = ?,
            description = ?,
            amount = ?,
            status = ?,
            payment_status = ?,
            payment_method = ?,
            counterparty = ?,
            reference = ?,
            reference_number = ?,
            due_date = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?;
    """, (
        str(title).strip(),
        tx_date,
        tx_date,
        db_type,
        str(category).strip(),
        str(description).strip() if description else str(title).strip(),
        amount,
        db_status,
        payment_status,
        str(payment_method).strip(),
        str(counterparty).strip(),
        str(ref_number).strip(),
        str(ref_number).strip(),
        due_date,
        tx_id
    ))

    conn.commit()

    cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
    updated_row = cursor.fetchone()
    conn.close()

    return jsonify({
        "success": True,
        "message": "Transaction updated successfully",
        "data": row_to_dict(updated_row)
    }), 200

@transactions_bp.route('/<int:tx_id>', methods=['DELETE'])
def delete_transaction(tx_id):
    """Delete a transaction with proper cash balance reversal if completed."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE id = ?;", (tx_id,))
    existing = cursor.fetchone()

    if not existing:
        conn.close()
        return jsonify({"success": False, "error": f"Transaction #{tx_id} not found"}), 404

    old = row_to_dict(existing)

    # Revert cash impact if it was completed
    if old['payment_status'] == 'Completed':
        revert_delta = -old['amount'] if old['type'] == 'Income' else old['amount']
        cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (revert_delta,))
        cursor.execute("UPDATE forecast_settings SET opening_balance = (SELECT current_balance FROM business_profile LIMIT 1), updated_at = CURRENT_TIMESTAMP;")

    cursor.execute("DELETE FROM transactions WHERE id = ?;", (tx_id,))
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "message": f"Transaction #{tx_id} deleted successfully"
    }), 200
