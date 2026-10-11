from datetime import datetime, timedelta
import pandas as pd
from backend.database import get_db_connection

class FinanceService:
    @staticmethod
    def get_summary():
        conn = get_db_connection()
        cursor = conn.cursor()

        # Business profile
        cursor.execute("SELECT * FROM business_profile LIMIT 1;")
        profile = cursor.fetchone()
        if not profile:
            conn.close()
            return {}

        current_balance = float(profile['current_balance'])
        target_reserve = float(profile['target_reserve'])
        monthly_burn = float(profile['monthly_burn'])
        currency = profile['currency']

        # Receivables stats (calculated from true outstanding balances)
        cursor.execute("""
            SELECT 
                r.id,
                COALESCE(r.invoice_amount, r.amount, 0) as inv_amount,
                COALESCE(SUM(p.amount), 0) as paid_sum,
                r.due_date
            FROM receivables r
            LEFT JOIN customer_payments p ON r.id = p.invoice_id
            GROUP BY r.id;
        """)
        rec_rows = cursor.fetchall()
        today_str = datetime.now().strftime('%Y-%m-%d')
        total_receivables = 0.0
        overdue_receivables = 0.0
        overdue_invoices_count = 0
        for r in rec_rows:
            bal = max(0.0, float(r['inv_amount']) - float(r['paid_sum']))
            if bal > 0.001:
                total_receivables += bal
                if str(r['due_date'])[:10] < today_str:
                    overdue_receivables += bal
                    overdue_invoices_count += 1

        # Direct scheduled receivables pending in transactions
        cursor.execute("""
            SELECT 
                amount,
                COALESCE(due_date, transaction_date, date) as target_date,
                COALESCE(payment_status, status) as p_status
            FROM transactions
            WHERE UPPER(type) IN ('INCOME', 'INFLOW')
              AND UPPER(COALESCE(payment_status, status, '')) IN ('PENDING', 'OVERDUE')
              AND invoice_id IS NULL;
        """)
        for pi in cursor.fetchall():
            pi_amt = float(pi['amount'] or 0.0)
            pi_date = str(pi['target_date'] or '')[:10]
            pi_status = str(pi['p_status'] or '').upper()
            total_receivables += pi_amt
            if pi_status == 'OVERDUE' or (pi_date and pi_date < today_str):
                overdue_receivables += pi_amt
                overdue_invoices_count += 1

        # Payables stats (calculated from true outstanding balances)
        cursor.execute("""
            SELECT 
                b.id,
                COALESCE(b.bill_amount, b.amount, 0) as bill_amount,
                COALESCE(SUM(p.amount), 0) as paid_sum,
                b.priority,
                b.due_date
            FROM payables b
            LEFT JOIN supplier_payments p ON b.id = p.bill_id
            GROUP BY b.id;
        """)
        pay_rows = cursor.fetchall()
        total_payables = 0.0
        critical_payables = 0.0
        total_bills = 0
        for b in pay_rows:
            bal = max(0.0, float(b['bill_amount']) - float(b['paid_sum']))
            if bal > 0.001:
                total_payables += bal
                total_bills += 1
                if str(b['priority']).upper() == 'CRITICAL':
                    critical_payables += bal

        # Direct scheduled expenses (e.g. Employee Salaries, Electricity, Rent due on 1 Nov) pending in transactions
        cursor.execute("""
            SELECT 
                amount,
                COALESCE(due_date, transaction_date, date) as target_date,
                COALESCE(payment_status, status) as p_status,
                title
            FROM transactions
            WHERE UPPER(type) IN ('EXPENSE', 'OUTFLOW')
              AND UPPER(COALESCE(payment_status, status, '')) IN ('PENDING', 'OVERDUE')
              AND bill_id IS NULL;
        """)
        for pe in cursor.fetchall():
            pe_amt = float(pe['amount'] or 0.0)
            pe_date = str(pe['target_date'] or '')[:10]
            pe_status = str(pe['p_status'] or '').upper()

            total_payables += pe_amt
            total_bills += 1
            if pe_status == 'OVERDUE' or (pe_date and pe_date < today_str):
                critical_payables += pe_amt

        # Transactions (last 30 days)
        cursor.execute("""
            SELECT 
                COALESCE(SUM(CASE WHEN UPPER(type) IN ('INFLOW', 'INCOME') THEN amount ELSE 0 END), 0) as total_inflows_30d,
                COALESCE(SUM(CASE WHEN UPPER(type) IN ('OUTFLOW', 'EXPENSE') THEN amount ELSE 0 END), 0) as total_outflows_30d
            FROM transactions
            WHERE COALESCE(transaction_date, date) >= date('now', '-30 days');
        """)
        tx_stats = cursor.fetchone()
        inflows_30d = float(tx_stats['total_inflows_30d'])
        outflows_30d = float(tx_stats['total_outflows_30d'])
        net_cashflow_30d = inflows_30d - outflows_30d

        # Runway calculations
        daily_burn = monthly_burn / 30.0 if monthly_burn > 0 else 1.0
        runway_days = round(current_balance / daily_burn, 1)
        runway_months = round(runway_days / 30.0, 1)

        # Health score calculation (0 - 100)
        # Factors: reserve coverage, overdue receivables burden, critical payables pressure
        reserve_ratio = min(current_balance / target_reserve if target_reserve > 0 else 1.0, 1.5)
        overdue_penalty = (overdue_receivables / current_balance) * 20 if current_balance > 0 else 20
        critical_penalty = (critical_payables / current_balance) * 20 if current_balance > 0 else 20

        raw_score = (reserve_ratio * 60) - overdue_penalty - critical_penalty + 30

        if current_balance < 0.0:
            health_score = max(10, min(35, round(raw_score)))
            health_status = 'Critical Cash Shortfall'
            health_color = 'red'
        elif current_balance < target_reserve:
            health_score = max(36, min(54, round(raw_score)))
            health_status = 'Caution - Reserve Buffer Breached'
            health_color = 'amber'
        else:
            health_score = max(55, min(95, round(raw_score)))
            if health_score >= 80:
                health_status = 'Healthy & Resilient'
                health_color = 'green'
            else:
                health_status = 'Caution - Monitor Outflows'
                health_color = 'amber'

        conn.close()

        return {
            "business_name": profile['name'],
            "industry": profile['industry'],
            "currency": currency,
            "current_balance": current_balance,
            "target_reserve": target_reserve,
            "monthly_burn": monthly_burn,
            "daily_burn": round(daily_burn, 2),
            "runway_days": runway_days,
            "runway_months": runway_months,
            "inflows_30d": inflows_30d,
            "outflows_30d": outflows_30d,
            "net_cashflow_30d": net_cashflow_30d,
            "total_receivables": total_receivables,
            "overdue_receivables": overdue_receivables,
            "overdue_invoices_count": overdue_invoices_count,
            "total_payables": total_payables,
            "critical_payables": critical_payables,
            "total_bills": total_bills,
            "health_score": health_score,
            "health_status": health_status,
            "health_color": health_color
        }

    @staticmethod
    def get_spending_breakdown():
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT category, SUM(amount) as total_amount
            FROM transactions
            WHERE UPPER(type) IN ('OUTFLOW', 'EXPENSE')
            GROUP BY category
            ORDER BY total_amount DESC;
        """)
        rows = cursor.fetchall()
        conn.close()
        return [{"category": row["category"], "amount": float(row["total_amount"])} for row in rows]

    @staticmethod
    def get_recent_transactions(limit=10):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, date, transaction_date, due_date, type, category, description,
                   amount, status, payment_status, counterparty, reference, reference_number
            FROM transactions
            ORDER BY COALESCE(due_date, transaction_date, date) DESC, id DESC
            LIMIT ?;
        """, (limit,))
        rows = cursor.fetchall()
        conn.close()
        result = []
        for row in rows:
            d = dict(row)
            d['title'] = d.get('title') or d.get('description') or 'Transaction'
            d['due_date'] = d.get('due_date') or d.get('transaction_date') or d.get('date')
            d['payment_status'] = d.get('payment_status') or d.get('status') or 'Pending'
            result.append(d)
        return result
