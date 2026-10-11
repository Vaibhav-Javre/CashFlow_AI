import sqlite3
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from backend.database import get_db_connection

def to_decimal(val, default='0.00'):
    """Safe conversion of any number or string to Decimal."""
    if val is None or val == '':
        return Decimal(str(default))
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(str(default))

def round_curr(dec_val):
    """Round Decimal to 2 decimal places and return as float for JSON serialization."""
    if not isinstance(dec_val, Decimal):
        dec_val = to_decimal(dec_val)
    return float(dec_val.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

class ForecastService:
    @staticmethod
    def get_settings():
        """
        Fetch configured forecast settings (user-provided opening balance,
        minimum cash buffer, and forecast start date).
        business_profile is the single source of truth for live balance and buffer.
        """
        conn = get_db_connection()
        try:
            cursor = conn.cursor()

            # Always fetch ground truth from business_profile
            cursor.execute("SELECT current_balance, target_reserve FROM business_profile LIMIT 1;")
            prof = cursor.fetchone()

            # Check if forecast_settings has custom notes or date
            cursor.execute("SELECT * FROM forecast_settings ORDER BY id ASC LIMIT 1;")
            f_row = cursor.fetchone()

            if prof:
                opening_balance = float(prof['current_balance'])
                minimum_cash_buffer = float(prof['target_reserve'])
            elif f_row:
                opening_balance = float(f_row['opening_balance'])
                minimum_cash_buffer = float(f_row['minimum_cash_buffer'])
            else:
                opening_balance = 500000.0
                minimum_cash_buffer = 200000.0

            start_date = datetime.now().strftime('%Y-%m-%d')
            notes = f_row['notes'] if f_row and f_row['notes'] else 'Live business cash baseline'

            # Keep forecast_settings in sync
            if f_row:
                cursor.execute("""
                    UPDATE forecast_settings
                    SET opening_balance = ?, minimum_cash_buffer = ?, start_date = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?;
                """, (opening_balance, minimum_cash_buffer, start_date, f_row['id']))
                conn.commit()
        finally:
            conn.close()

        return {
            "opening_balance": opening_balance,
            "minimum_cash_buffer": minimum_cash_buffer,
            "start_date": start_date,
            "notes": notes,
            "is_user_provided": True,
            "disclaimer": "Live business cash baseline calculated from verified transactions and profile settings."
        }

    @staticmethod
    def update_settings(opening_balance, minimum_cash_buffer, start_date=None, notes=None):
        """
        Validate and update forecast settings in database.
        Synchronizes both forecast_settings and business_profile.
        """
        try:
            ob_dec = to_decimal(opening_balance)
            mb_dec = to_decimal(minimum_cash_buffer)
            if mb_dec < Decimal('0'):
                raise ValueError("Minimum cash buffer must be non-negative.")
        except Exception as e:
            raise ValueError(f"Invalid monetary values: {str(e)}")

        start_date_str = str(start_date).strip() if start_date else datetime.now().strftime('%Y-%m-%d')
        try:
            datetime.strptime(start_date_str[:10], '%Y-%m-%d')
            start_date_str = start_date_str[:10]
        except ValueError:
            start_date_str = datetime.now().strftime('%Y-%m-%d')

        ob_float = round_curr(ob_dec)
        mb_float = round_curr(mb_dec)

        conn = get_db_connection()
        try:
            cursor = conn.cursor()

            # Update or insert into forecast_settings
            cursor.execute("SELECT id FROM forecast_settings LIMIT 1;")
            existing = cursor.fetchone()

            if existing:
                cursor.execute("""
                    UPDATE forecast_settings
                    SET opening_balance = ?, minimum_cash_buffer = ?, start_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?;
                """, (ob_float, mb_float, start_date_str, notes or 'User updated settings', existing['id']))
            else:
                cursor.execute("""
                    INSERT INTO forecast_settings (id, opening_balance, minimum_cash_buffer, start_date, notes)
                    VALUES (1, ?, ?, ?, ?);
                """, (ob_float, mb_float, start_date_str, notes or 'User configured settings'))

            # Keep business_profile in sync so entire app reflects updated cash position
            cursor.execute("""
                UPDATE business_profile
                SET current_balance = ?, target_reserve = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = (SELECT id FROM business_profile LIMIT 1);
            """, (ob_float, mb_float))

            conn.commit()
        finally:
            conn.close()

        return {
            "opening_balance": ob_float,
            "minimum_cash_buffer": mb_float,
            "start_date": start_date_str,
            "notes": notes or 'User-configured settings saved',
            "is_user_provided": True,
            "disclaimer": "User-provided starting cash balance, not automatically verified against a bank account."
        }

    @staticmethod
    def generate_forecast(days=30, start_date=None, opening_balance=None, minimum_cash_buffer=None, adjustments=None):
        """
        Database-connected, deterministic cash-flow forecasting engine.
        Calculates daily projected closing balances:
          Projected Closing Balance = Previous Closing Balance + Expected Inflows - Expected Outflows

        Data Sources:
          - Opening Balance: User-configured starting balance
          - Receivables: Open customer invoices (outstanding balance only: invoice_amount - sum(customer_payments))
            Expected payment date is due date or expected_payment_date. Fully paid records excluded.
          - Payables: Open supplier bills (outstanding balance only: bill_amount - sum(supplier_payments))
            Expected payment date is due date. Fully paid records excluded.
          - Transactions: Direct scheduled business expenses & expected additional income.
            Historical completed transactions on or before start_date are excluded (already in opening balance).
            Transactions linked to invoices or bills are excluded to strictly prevent double counting.
            Pending/Completed future transactions contribute on their scheduled dates.
            Overdue and cancelled transactions are excluded.

        Precision:
          - Uses Python's Decimal type for all monetary calculations.
        """
        # Validate forecast period
        try:
            days = int(days)
            if days <= 0:
                days = 30
            if days > 365:
                days = 365
        except (ValueError, TypeError):
            days = 30

        # Load persisted settings if not explicitly provided
        settings = ForecastService.get_settings()
        if opening_balance is None:
            opening_balance_dec = to_decimal(settings['opening_balance'])
        else:
            opening_balance_dec = to_decimal(opening_balance)

        if minimum_cash_buffer is None:
            min_buffer_dec = to_decimal(settings['minimum_cash_buffer'])
        else:
            min_buffer_dec = to_decimal(minimum_cash_buffer)

        # Establish start date
        if not start_date:
            start_date_str = settings.get('start_date') or datetime.now().strftime('%Y-%m-%d')
        else:
            start_date_str = str(start_date)[:10]

        try:
            start_dt = datetime.strptime(start_date_str, '%Y-%m-%d')
        except ValueError:
            start_dt = datetime.now()
            start_date_str = start_dt.strftime('%Y-%m-%d')

        # Build timeline date keys
        timeline_dates = [(start_dt + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(days)]
        end_date_str = timeline_dates[-1]

        # Containers for movements by date
        inflow_buckets = {d: [] for d in timeline_dates}
        outflow_buckets = {d: [] for d in timeline_dates}

        # Organize hypothetical adjustments for What-If scenario modeling (in-memory only)
        adj_list = adjustments or []
        rec_adj_map = {}
        pay_adj_map = {}
        extra_inflows = []
        extra_outflows = []

        for adj in adj_list:
            adj_type = adj.get('adjustment_type')
            if adj_type == 'customer_payment':
                rec_id = adj.get('related_record_id')
                if rec_id is not None:
                    try:
                        rec_adj_map[int(rec_id)] = adj
                    except (ValueError, TypeError):
                        pass
            elif adj_type == 'supplier_payment':
                pay_id = adj.get('related_record_id')
                if pay_id is not None:
                    try:
                        pay_adj_map[int(pay_id)] = adj
                    except (ValueError, TypeError):
                        pass
            elif adj_type == 'new_income':
                extra_inflows.append(adj)
            elif adj_type == 'new_expense':
                extra_outflows.append(adj)

        conn = get_db_connection()
        try:
            cursor = conn.cursor()

            # ---------------------------------------------------------
            # 1. RECEIVABLES (Customer Invoices)
            # ---------------------------------------------------------
            # Precompute customer payments per invoice
            cursor.execute("SELECT invoice_id, COALESCE(SUM(amount), 0) as paid_sum FROM customer_payments GROUP BY invoice_id;")
            rec_paid_map = {row['invoice_id']: to_decimal(row['paid_sum']) for row in cursor.fetchall()}

            # Fetch open receivables
            cursor.execute("""
                SELECT id, invoice_number, customer_name,
                       COALESCE(invoice_amount, amount, 0) as full_amount,
                       due_date, expected_payment_date, status, risk_level
                FROM receivables
                WHERE UPPER(status) != 'PAID';
            """)
            receivables = cursor.fetchall()

            # ---------------------------------------------------------
            # 2. PAYABLES (Supplier Bills)
            # ---------------------------------------------------------
            # Precompute supplier payments per bill
            cursor.execute("SELECT bill_id, COALESCE(SUM(amount), 0) as paid_sum FROM supplier_payments GROUP BY bill_id;")
            pay_paid_map = {row['bill_id']: to_decimal(row['paid_sum']) for row in cursor.fetchall()}

            cursor.execute("""
                SELECT id, COALESCE(bill_number, invoice_number) as bill_num,
                       COALESCE(supplier_name, vendor_name) as vendor_title,
                       COALESCE(bill_amount, amount, 0) as full_amount,
                       due_date, status, priority, category
                FROM payables
                WHERE UPPER(status) != 'PAID';
            """)
            payables = cursor.fetchall()

            # ---------------------------------------------------------
            # 3. DIRECT TRANSACTIONS (Scheduled Expenses & Additional Income)
            # ---------------------------------------------------------
            cursor.execute("""
                SELECT id, title, description, transaction_date, date, type, category,
                       amount, status, payment_status, counterparty, reference_number, invoice_id, bill_id
                FROM transactions
                WHERE COALESCE(transaction_date, date) >= ? AND COALESCE(transaction_date, date) <= ?;
            """, (start_date_str, end_date_str))
            transactions = cursor.fetchall()
        finally:
            conn.close()

        for rec in receivables:
            rec_id = rec['id']
            full_amt = to_decimal(rec['full_amount'])
            paid_amt = rec_paid_map.get(rec_id, Decimal('0.00'))
            outstanding = full_amt - paid_amt

            # Exclude if fully paid or non-positive
            if outstanding <= Decimal('0.00'):
                continue

            # Determine expected payment date: use expected_payment_date if set, else due_date
            exp_date = rec['expected_payment_date'] or rec['due_date']
            if exp_date and len(str(exp_date)) >= 10:
                exp_date = str(exp_date)[:10]

            # In-memory scenario adjustment (does not touch database records)
            is_adjusted = rec_id in rec_adj_map
            if is_adjusted:
                adj = rec_adj_map[rec_id]
                hypo_date = adj.get('hypothetical_date')
                if hypo_date and len(str(hypo_date)) >= 10:
                    exp_date = str(hypo_date)[:10]
                hypo_amt = adj.get('hypothetical_amount')
                if hypo_amt is not None:
                    outstanding = to_decimal(hypo_amt)

            if outstanding <= Decimal('0.00'):
                continue

            if exp_date in inflow_buckets:
                inflow_buckets[exp_date].append({
                    "id": f"rec-{rec_id}",
                    "source": "Receivable",
                    "source_type": "invoice",
                    "reference": rec['invoice_number'],
                    "entity": rec['customer_name'],
                    "description": f"Customer Invoice #{rec['invoice_number']} ({rec['customer_name']})" + (" (Hypothetical Adjustment)" if is_adjusted else ""),
                    "amount": outstanding,
                    "risk_level": rec['risk_level'] or 'LOW',
                    "is_scenario_adjusted": is_adjusted
                })

        for pay in payables:
            pay_id = pay['id']
            full_amt = to_decimal(pay['full_amount'])
            paid_amt = pay_paid_map.get(pay_id, Decimal('0.00'))
            outstanding = full_amt - paid_amt

            # Exclude if fully settled or non-positive
            if outstanding <= Decimal('0.00'):
                continue

            bill_date = pay['due_date']
            if bill_date and len(str(bill_date)) >= 10:
                bill_date = str(bill_date)[:10]

            # In-memory scenario adjustment (does not touch database records)
            is_adjusted = pay_id in pay_adj_map
            if is_adjusted:
                adj = pay_adj_map[pay_id]
                hypo_date = adj.get('hypothetical_date')
                if hypo_date and len(str(hypo_date)) >= 10:
                    bill_date = str(hypo_date)[:10]
                hypo_amt = adj.get('hypothetical_amount')
                if hypo_amt is not None:
                    outstanding = to_decimal(hypo_amt)

            if outstanding <= Decimal('0.00'):
                continue

            if bill_date in outflow_buckets:
                outflow_buckets[bill_date].append({
                    "id": f"pay-{pay_id}",
                    "source": "Payable",
                    "source_type": "bill",
                    "reference": pay['bill_num'] or f"BILL-{pay_id}",
                    "entity": pay['vendor_title'] or 'Supplier',
                    "description": f"Supplier Bill #{pay['bill_num'] or pay_id} ({pay['vendor_title'] or 'Supplier'})" + (" (Hypothetical Adjustment)" if is_adjusted else ""),
                    "amount": outstanding,
                    "priority": pay['priority'] or 'STANDARD',
                    "is_scenario_adjusted": is_adjusted
                })

        for tx in transactions:
            # 1. Skip if safely linked to an invoice or bill (handled by receivables/payables)
            if tx['invoice_id'] is not None or tx['bill_id'] is not None:
                continue

            # 2. Skip customer / supplier payment category to avoid duplicate counting with invoices/bills
            cat = str(tx['category'] or '').strip()
            if cat in ('Customer Payment', 'Supplier Payment'):
                continue

            # 3. Determine transaction date
            tx_date = tx['transaction_date'] or tx['date']
            if tx_date and len(str(tx_date)) >= 10:
                tx_date = str(tx_date)[:10]
            if tx_date not in inflow_buckets:
                continue

            # 4. Check payment status rules:
            p_status = str(tx['payment_status'] or tx['status'] or 'Completed').strip().upper()
            if p_status in ('CANCELLED', 'VOID', 'REJECTED'):
                continue
            if p_status == 'OVERDUE':
                # Past-due uncompleted transactions do not automatically clear in the future
                continue

            # 5. Historical completed transactions (<= start_date) are already captured in opening balance
            if tx_date <= start_date_str and p_status == 'COMPLETED':
                continue

            # Only include future movements or pending items for today
            amt = to_decimal(tx['amount'])
            if amt <= Decimal('0.00'):
                continue

            tx_type = str(tx['type'] or '').strip().upper()
            is_income = tx_type in ('INCOME', 'INFLOW')

            movement_info = {
                "id": f"tx-{tx['id']}",
                "source": "Direct Transaction",
                "source_type": "transaction",
                "reference": tx['reference_number'] or f"TX-{tx['id']}",
                "entity": tx['counterparty'] or ('Client' if is_income else 'Vendor'),
                "description": tx['title'] or tx['description'] or ('Scheduled Income' if is_income else 'Scheduled Expense'),
                "amount": amt,
                "category": cat or ('Revenue' if is_income else 'Operating Expense'),
                "payment_status": tx['payment_status'] or 'Completed'
            }

            if is_income:
                inflow_buckets[tx_date].append(movement_info)
            else:
                outflow_buckets[tx_date].append(movement_info)

        # Apply hypothetical new_income adjustments (in-memory only)
        for idx, inc in enumerate(extra_inflows):
            inc_date = str(inc.get('hypothetical_date') or '')[:10]
            inc_amt = to_decimal(inc.get('hypothetical_amount', 0))
            if inc_amt > Decimal('0.00') and inc_date in inflow_buckets:
                inflow_buckets[inc_date].append({
                    "id": f"hypo-inc-{idx}",
                    "source": "Hypothetical Scenario Income",
                    "source_type": "scenario_income",
                    "reference": inc.get('description') or "Hypothetical Sales",
                    "entity": "Hypothetical Inflow",
                    "description": inc.get('description') or "Hypothetical Additional Income",
                    "amount": inc_amt,
                    "risk_level": "LOW",
                    "is_scenario_adjusted": True
                })

        # Apply hypothetical new_expense adjustments (in-memory only)
        for idx, exp in enumerate(extra_outflows):
            exp_date = str(exp.get('hypothetical_date') or '')[:10]
            exp_amt = to_decimal(exp.get('hypothetical_amount', 0))
            if exp_amt > Decimal('0.00') and exp_date in outflow_buckets:
                outflow_buckets[exp_date].append({
                    "id": f"hypo-exp-{idx}",
                    "source": "Hypothetical Scenario Expense",
                    "source_type": "scenario_expense",
                    "reference": exp.get('description') or "Hypothetical Expense",
                    "entity": "Hypothetical Outflow",
                    "description": exp.get('description') or "Hypothetical One-Time Expense",
                    "amount": exp_amt,
                    "priority": "HIGH",
                    "is_scenario_adjusted": True
                })

        # ---------------------------------------------------------
        # 4. DAY-BY-DAY PROJECTION CALCULATION
        # ---------------------------------------------------------
        running_balance = opening_balance_dec
        min_balance = running_balance
        trough_date = timeline_dates[0]
        first_risk_date = timeline_dates[0] if opening_balance_dec < min_buffer_dec else None
        first_critical_date = timeline_dates[0] if opening_balance_dec < Decimal('0.00') else None
        total_inflows = Decimal('0.00')
        total_outflows = Decimal('0.00')

        timeline = []

        for d in timeline_dates:
            day_opening = running_balance
            day_inflow_items = inflow_buckets[d]
            day_outflow_items = outflow_buckets[d]

            day_inflow_total = sum((item['amount'] for item in day_inflow_items), Decimal('0.00'))
            day_outflow_total = sum((item['amount'] for item in day_outflow_items), Decimal('0.00'))
            day_net = day_inflow_total - day_outflow_total
            day_closing = day_opening + day_net
            running_balance = day_closing

            total_inflows += day_inflow_total
            total_outflows += day_outflow_total

            # Risk Classification:
            # 1. Critical: projected closing balance is negative (< 0)
            # 2. High Risk: nonnegative but below minimum cash buffer (0 <= balance < min_buffer)
            # 3. Healthy: meets or exceeds minimum cash buffer (balance >= min_buffer)
            if day_closing < Decimal('0.00'):
                risk_status = 'Critical'
                risk_code = 'CRITICAL'
                if first_critical_date is None:
                    first_critical_date = d
                if first_risk_date is None:
                    first_risk_date = d
            elif day_closing < min_buffer_dec:
                risk_status = 'High Risk'
                risk_code = 'HIGH_RISK'
                if first_risk_date is None:
                    first_risk_date = d
            else:
                risk_status = 'Healthy'
                risk_code = 'HEALTHY'

            if day_closing < min_balance:
                min_balance = day_closing
                trough_date = d

            timeline.append({
                "date": d,
                "opening_balance": round_curr(day_opening),
                "expected_inflows": round_curr(day_inflow_total),
                "inflow": round_curr(day_inflow_total),  # backwards compatibility
                "expected_outflows": round_curr(day_outflow_total),
                "outflow": round_curr(day_outflow_total),  # backwards compatibility
                "net_movement": round_curr(day_net),
                "net": round_curr(day_net),  # backwards compatibility
                "closing_balance": round_curr(day_closing),
                "projected_balance": round_curr(day_closing),  # backwards compatibility
                "minimum_cash_buffer": round_curr(min_buffer_dec),
                "safe_reserve": round_curr(min_buffer_dec),  # backwards compatibility
                "risk_status": risk_status,
                "risk_code": risk_code,
                "is_negative": day_closing < Decimal('0.00'),
                "is_below_buffer": day_closing < min_buffer_dec,
                "movements_count": len(day_inflow_items) + len(day_outflow_items),
                "inflows_breakdown": [{**item, "amount": round_curr(item['amount'])} for item in day_inflow_items],
                "outflows_breakdown": [{**item, "amount": round_curr(item['amount'])} for item in day_outflow_items]
            })

        projected_ending_cash = timeline[-1]['closing_balance'] if timeline else round_curr(opening_balance_dec)
        net_movement_total = total_inflows - total_outflows
        projected_shortfall = max(Decimal('0.00'), min_buffer_dec - min_balance)

        return {
            "forecast_days": days,
            "start_date": start_date_str,
            "end_date": end_date_str,
            "starting_balance": round_curr(opening_balance_dec),
            "opening_balance": round_curr(opening_balance_dec),
            "target_reserve": round_curr(min_buffer_dec),
            "minimum_cash_buffer": round_curr(min_buffer_dec),
            "projected_ending_cash": projected_ending_cash,
            "minimum_projected_balance": round_curr(min_balance),
            "lowest_projected_balance": round_curr(min_balance),
            "trough_date": trough_date,
            "lowest_balance_date": trough_date,
            "first_risk_date": first_risk_date,
            "first_critical_date": first_critical_date,
            "reserve_breach_date": first_risk_date,
            "projected_shortfall": round_curr(projected_shortfall),
            "is_shortfall_predicted": first_risk_date is not None,
            "has_risk": first_risk_date is not None,
            "total_expected_inflows": round_curr(total_inflows),
            "total_expected_outflows": round_curr(total_outflows),
            "forecast_net_movement": round_curr(net_movement_total),
            "net_cash_movement": round_curr(net_movement_total),
            "summary": {
                "projected_ending_cash": projected_ending_cash,
                "lowest_projected_balance": round_curr(min_balance),
                "first_risk_date": first_risk_date or "No risk detected",
                "first_critical_date": first_critical_date,
                "forecast_net_movement": round_curr(net_movement_total),
                "total_expected_inflows": round_curr(total_inflows),
                "total_expected_outflows": round_curr(total_outflows),
                "opening_balance": round_curr(opening_balance_dec),
                "minimum_cash_buffer": round_curr(min_buffer_dec),
                "has_risk": first_risk_date is not None,
                "risk_summary": f"Cash falls below buffer on {first_risk_date}" if first_risk_date else "No risk detected"
            },
            "settings": {
                "opening_balance": round_curr(opening_balance_dec),
                "minimum_cash_buffer": round_curr(min_buffer_dec),
                "start_date": start_date_str,
                "is_user_provided": True,
                "disclaimer": "User-provided starting cash balance, not automatically verified against a bank account."
            },
            "methodology": {
                "engine": "Deterministic Cash Movement Calculation",
                "formula": "Projected Closing Balance = Previous Closing Balance + Expected Inflows - Expected Outflows",
                "arithmetic": "Decimal-safe monetary arithmetic (Python Decimal)",
                "rules": {
                    "receivables": "Outstanding balance only (invoice_amount - paid). Due date or expected payment date.",
                    "payables": "Outstanding balance only (bill_amount - paid). Due date.",
                    "transactions": "Future direct income & expenses only. Deduplicated against invoices and bills.",
                    "historical_transactions": "Completed transactions on or before forecast start date are excluded (already part of opening cash balance)."
                }
            },
            "timeline": timeline
        }
