import calendar
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from backend.database import get_db_connection

fixed_expenses_bp = Blueprint('fixed_expenses', __name__, url_prefix='/api/confirmed-expenses')

def ensure_table(conn):
    """Ensure confirmed_expenses table and columns exist in the current business database."""
    conn.execute("""
    CREATE TABLE IF NOT EXISTS confirmed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        due_day INTEGER NOT NULL DEFAULT 28,
        due_date TEXT,
        payment_status TEXT DEFAULT 'Pending',
        is_month_end BOOLEAN DEFAULT 0,
        frequency TEXT DEFAULT 'Monthly',
        is_active BOOLEAN DEFAULT 1,
        counterparty TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    try:
        conn.execute("ALTER TABLE confirmed_expenses ADD COLUMN due_date TEXT;")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE confirmed_expenses ADD COLUMN payment_status TEXT DEFAULT 'Pending';")
    except Exception:
        pass
    conn.commit()

def calculate_target_due_date(due_day, is_month_end=False, custom_due_date=None):
    """Compute the upcoming due date string (YYYY-MM-DD) for a fixed expense."""
    if custom_due_date and str(custom_due_date).strip():
        try:
            return str(custom_due_date).strip()[:10]
        except Exception:
            pass

    now = datetime.now()
    today_str = now.strftime('%Y-%m-%d')
    year = now.year
    month = now.month

    # Check for current month first
    _, max_days = calendar.monthrange(year, month)
    target_day = max_days if is_month_end else min(int(due_day or 28), max_days)
    due_date = f"{year:04d}-{month:02d}-{target_day:02d}"

    # If the day in this month has already passed by more than 2 days, schedule for next month
    if due_date < today_str:
        next_month = month + 1 if month < 12 else 1
        next_year = year if month < 12 else year + 1
        _, next_max_days = calendar.monthrange(next_year, next_month)
        target_day = next_max_days if is_month_end else min(int(due_day or 28), next_max_days)
        due_date = f"{next_year:04d}-{next_month:02d}-{target_day:02d}"

    return due_date

def sync_scheduled_transactions(conn):
    """Schedule transactions in the business database for all active confirmed expenses with status support."""
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM confirmed_expenses WHERE is_active = 1;")
    expenses = cursor.fetchall()

    total_monthly_burn = 0.0

    for exp in expenses:
        exp_id = exp['id']
        title = exp['title']
        category = exp['category']
        amount = float(exp['amount'])
        due_day = exp['due_day']
        custom_date = exp['due_date'] if 'due_date' in exp.keys() else None
        p_status = exp['payment_status'] if ('payment_status' in exp.keys() and exp['payment_status']) else 'Pending'
        is_month_end = bool(exp['is_month_end'])
        counterparty = exp['counterparty'] or 'Fixed Monthly Commitment'

        total_monthly_burn += amount
        due_date = calculate_target_due_date(due_day, is_month_end, custom_date)
        ref_key = f"FIXED_{exp_id}_{due_date[:7]}"

        # Check if transaction for this specific item/month already exists
        cursor.execute("SELECT id, payment_status, amount FROM transactions WHERE reference = ? LIMIT 1;", (ref_key,))
        existing = cursor.fetchone()

        if existing:
            old_status = existing['payment_status']
            # Reconcile balance if marked Completed now
            if old_status != 'Completed' and p_status == 'Completed':
                cursor.execute("UPDATE business_profile SET current_balance = current_balance - ? WHERE id = 1;", (amount,))
            elif old_status == 'Completed' and p_status != 'Completed':
                cursor.execute("UPDATE business_profile SET current_balance = current_balance + ? WHERE id = 1;", (float(existing['amount']),))

            cursor.execute("""
                UPDATE transactions 
                SET title = ?, category = ?, amount = ?, date = ?, transaction_date = ?, due_date = ?,
                    counterparty = ?, payment_status = ?, status = ?
                WHERE id = ?;
            """, (title, category, amount, due_date, due_date, due_date, counterparty, p_status, p_status.upper(), existing['id']))
        else:
            # If inserted directly as Completed, deduct from current cash balance
            if p_status == 'Completed':
                cursor.execute("UPDATE business_profile SET current_balance = current_balance - ? WHERE id = 1;", (amount,))

            cursor.execute("""
                INSERT INTO transactions (
                    title, description, date, transaction_date, due_date,
                    type, category, amount, status, payment_status,
                    payment_method, counterparty, reference, reference_number
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                title,
                f"Confirmed fixed expense: {title}",
                due_date,
                due_date,
                due_date,
                'Expense',
                category,
                amount,
                p_status.upper(),
                p_status,
                'Bank Transfer',
                counterparty,
                ref_key,
                f"FIXED-{exp_id}"
            ))

    # Update monthly_burn in business_profile so runway reflects real fixed commitments
    cursor.execute("UPDATE business_profile SET monthly_burn = ? WHERE id = 1;", (total_monthly_burn,))
    conn.commit()

@fixed_expenses_bp.route('', methods=['GET'])
def get_confirmed_expenses():
    """List all confirmed fixed expenses for the calling business."""
    try:
        conn = get_db_connection()
        ensure_table(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM confirmed_expenses ORDER BY COALESCE(due_date, due_day) ASC, id ASC;")
        rows = cursor.fetchall()
        data = [dict(r) for r in rows]
        conn.close()

        total_sum = sum(float(r['amount']) for r in data if r.get('is_active', 1))
        return jsonify({
            "success": True,
            "data": data,
            "total_monthly_fixed": total_sum
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@fixed_expenses_bp.route('', methods=['POST'])
def save_confirmed_expenses():
    """
    Save or bulk-save confirmed fixed expenses with target due date & status options
    (Pending/Scheduled, Completed, Overdue) and schedule them into transactions.
    """
    try:
        payload = request.get_json() or {}
        items = payload.get('expenses')
        if items is None:
            # Single item wrapped
            items = [payload]

        if not isinstance(items, list):
            return jsonify({"success": False, "error": "Invalid format, expected list of expenses"}), 400

        conn = get_db_connection()
        ensure_table(conn)
        cursor = conn.cursor()

        saved_ids = []
        for item in items:
            title = str(item.get('title', '')).strip()
            if not title:
                continue

            category = str(item.get('category', 'Utilities')).strip()
            amount = float(item.get('amount', 0.0))
            due_day = int(item.get('due_day', 28)) if item.get('due_day') else 28
            due_date = str(item.get('due_date', '')).strip() or None
            payment_status = str(item.get('payment_status', item.get('status', 'Pending'))).strip().capitalize()
            if payment_status not in ('Pending', 'Completed', 'Overdue'):
                payment_status = 'Pending'

            is_month_end = 1 if item.get('is_month_end', False) or due_day >= 30 else 0
            is_active = 1 if item.get('is_active', True) else 0
            counterparty = str(item.get('counterparty', '')).strip() or 'Fixed Commitment'
            notes = str(item.get('notes', '')).strip()
            item_id = item.get('id')

            if item_id:
                # Update existing
                cursor.execute("""
                    UPDATE confirmed_expenses
                    SET title = ?, category = ?, amount = ?, due_day = ?, due_date = ?, payment_status = ?,
                        is_month_end = ?, is_active = ?, counterparty = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?;
                """, (title, category, amount, due_day, due_date, payment_status, is_month_end, is_active, counterparty, notes, item_id))
                saved_ids.append(item_id)
            else:
                # Insert new
                cursor.execute("""
                    INSERT INTO confirmed_expenses (
                        title, category, amount, due_day, due_date, payment_status,
                        is_month_end, is_active, counterparty, notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (title, category, amount, due_day, due_date, payment_status, is_month_end, is_active, counterparty, notes))
                saved_ids.append(cursor.lastrowid)

        conn.commit()

        # Synchronize into transactions table immediately
        sync_scheduled_transactions(conn)
        conn.close()

        return jsonify({
            "success": True,
            "message": f"Successfully saved and scheduled {len(saved_ids)} confirmed fixed expenses.",
            "saved_ids": saved_ids
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@fixed_expenses_bp.route('/<int:expense_id>', methods=['DELETE'])
def delete_confirmed_expense(expense_id):
    """Delete a confirmed fixed expense and remove any associated pending transaction."""
    try:
        conn = get_db_connection()
        ensure_table(conn)
        cursor = conn.cursor()

        # Delete associated pending transactions
        cursor.execute("""
            DELETE FROM transactions 
            WHERE reference LIKE ? AND payment_status = 'Pending';
        """, (f"FIXED_{expense_id}_%",))

        # Delete confirmed expense record
        cursor.execute("DELETE FROM confirmed_expenses WHERE id = ?;", (expense_id,))
        conn.commit()

        # Re-sync remaining
        sync_scheduled_transactions(conn)
        conn.close()

        return jsonify({
            "success": True,
            "message": f"Fixed expense #{expense_id} deleted."
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
