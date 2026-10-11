import sqlite3
from datetime import datetime, timedelta
from backend.database import get_db_connection
from backend.services.forecast_service import ForecastService
from backend.services.risk_service import RiskService

def _safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

class RecommendationService:
    @staticmethod
    def evaluate_rules(days=30):
        """
        Evaluate deterministic, explainable financial recommendation rules
        against current forecast, risks, receivables, payables, and transactions.
        Returns a list of structured recommendation dicts.
        """
        # 1. Fetch single source of truth from forecasting and risk analysis
        forecast = ForecastService.generate_forecast(days=days)
        risk_analysis = RiskService.get_risk_center_analysis(days=days)

        starting_balance = _safe_float(forecast.get('starting_balance', 0.0))
        minimum_cash_buffer = _safe_float(forecast.get('minimum_cash_buffer', 0.0))
        lowest_projected_balance = _safe_float(forecast.get('lowest_projected_balance', 0.0))
        trough_date = forecast.get('trough_date')
        first_risk_date = forecast.get('first_risk_date')
        first_critical_date = forecast.get('first_critical_date')
        is_shortfall = forecast.get('is_shortfall_predicted', False) or (lowest_projected_balance < minimum_cash_buffer)
        has_negative_cash = lowest_projected_balance < 0.0 or (first_critical_date is not None)
        today_str = datetime.now().strftime('%Y-%m-%d')

        conn = get_db_connection()
        cursor = conn.cursor()

        # Fetch open receivables
        cursor.execute("""
            SELECT id, invoice_number, customer_name, due_date, expected_payment_date, amount, status, days_overdue
            FROM receivables
            WHERE status != 'PAID'
            ORDER BY due_date ASC;
        """)
        open_receivables = [dict(r) for r in cursor.fetchall()]

        # Fetch open payables
        cursor.execute("""
            SELECT id, bill_number, invoice_number, supplier_name, vendor_name, due_date, amount, status, priority, category
            FROM payables
            WHERE status != 'PAID'
            ORDER BY due_date ASC;
        """)
        open_payables = [dict(p) for p in cursor.fetchall()]
        for p in open_payables:
            if not p.get('bill_number'):
                p['bill_number'] = p.get('invoice_number') or f"BILL-{p['id']}"
            if not p.get('supplier_name'):
                p['supplier_name'] = p.get('vendor_name') or "Vendor"

        # Fetch forecast settings
        cursor.execute("SELECT * FROM forecast_settings LIMIT 1;")
        settings_row = cursor.fetchone()
        conn.close()

        rules_output = []

        # ----------------------------------------------------
        # Rule 0: Buffer Shortfall Recovery & Liquidity Preservation
        # ----------------------------------------------------
        if is_shortfall or (starting_balance < minimum_cash_buffer):
            shortfall_amt = max(0.0, minimum_cash_buffer - min(starting_balance, lowest_projected_balance))
            rules_output.append({
                "rule_key": "BUFFER_SHORTFALL_RECOVERY",
                "category": "Capital Preservation",
                "title": "Replenish Operating Cash Reserve Buffer",
                "explanation": f"Liquid cash (₹{starting_balance:,.2f}) has breached your configured safety buffer of ₹{minimum_cash_buffer:,.2f} by ₹{shortfall_amt:,.2f}. Without corrective action, upcoming disbursements risk triggering an overdraft or payment failure.",
                "priority": "Critical" if (has_negative_cash or starting_balance < 0) else "High",
                "related_risk": f"Reserve buffer breached by ₹{shortfall_amt:,.2f}",
                "related_record_type": "reserve_buffer",
                "related_record_id": None,
                "related_record_reference": "Reserve Buffer",
                "counterparty": "Operating Reserve",
                "relevant_date": today_str,
                "suggested_action": "Pause discretionary expenses immediately, follow up on all customer collections, and negotiate 15-day extensions on upcoming non-essential bills.",
                "estimated_impact": shortfall_amt,
                "impact_description": f"Enforcing spending discipline and collection recovery closes the ₹{shortfall_amt:,.2f} buffer deficit.",
                "simulator_params": {
                    "early_settlement_pct": 2.0,
                    "vendor_stagger_pct": 50.0,
                    "amount": shortfall_amt
                }
            })

            rules_output.append({
                "rule_key": "DISCRETIONARY_OUTFLOW_FREEZE",
                "category": "Expense Optimization",
                "title": "Implement Temporary Freeze on Discretionary Outflows",
                "explanation": f"With cash reserves depleted below the ₹{minimum_cash_buffer:,.2f} threshold, non-essential operational disbursements must be paused to prevent liquidity shortfalls.",
                "priority": "High",
                "related_risk": "Uncontrolled discretionary outflows compounding buffer deficit",
                "related_record_type": "expense_policy",
                "related_record_id": None,
                "related_record_reference": "Expense Controls",
                "counterparty": "Internal Operations",
                "relevant_date": today_str,
                "suggested_action": "Audit scheduled payments for marketing, office upgrades, and non-critical subscriptions. Defer until reserve buffer exceeds 100%.",
                "estimated_impact": round(shortfall_amt * 0.35, 2),
                "impact_description": "Preserves essential liquid cash for core operations and debt service.",
                "simulator_params": {
                    "vendor_stagger_pct": 35.0,
                    "amount": round(shortfall_amt * 0.35, 2)
                }
            })

        # ----------------------------------------------------
        # Rule A: Overdue Customer Invoices
        # ----------------------------------------------------
        overdue_invoices = [r for r in open_receivables if r.get('status') == 'OVERDUE' or int(r.get('days_overdue') or 0) > 0]
        total_overdue_amt = sum(_safe_float(r['amount']) for r in overdue_invoices)

        for r in overdue_invoices:
            r_amt = _safe_float(r['amount'])
            days_od = int(r.get('days_overdue') or 0)
            inv_no = r.get('invoice_number') or f"INV-{r['id']}"
            c_name = r.get('customer_name') or "Customer"
            due_date = str(r.get('due_date') or today_str)[:10]

            # Priority classification
            if has_negative_cash and (days_od >= 30 or r_amt >= 20000):
                priority = 'Critical'
            elif is_shortfall or days_od >= 15 or r_amt >= 25000:
                priority = 'High'
            else:
                priority = 'Medium'

            rule_key = f"OVERDUE_INVOICE_{r['id']}"
            rules_output.append({
                "rule_key": rule_key,
                "category": "Receivables",
                "title": f"Follow Up on Overdue Invoice: {c_name}",
                "explanation": f"Follow up with {c_name} regarding invoice {inv_no}. ₹{r_amt:,.2f} remains outstanding and the invoice is {days_od} day(s) overdue (due {due_date}). Delays in customer receipts deplete cash reserves before scheduled supplier obligations arrive.",
                "priority": priority,
                "related_risk": f"Delayed receipt of ₹{r_amt:,.2f} overdue by {days_od} days",
                "related_record_type": "receivable",
                "related_record_id": r['id'],
                "related_record_reference": inv_no,
                "counterparty": c_name,
                "relevant_date": due_date,
                "suggested_action": f"Contact {c_name} regarding invoice {inv_no}. Request immediate settlement or propose a 2% prompt-payment incentive to recover funds within 48 hours.",
                "estimated_impact": r_amt,
                "impact_description": f"Expediting collection unlocks ₹{r_amt:,.2f} directly into liquid cash, reducing projected buffer shortfall.",
                "simulator_params": {
                    "early_settlement_pct": 2.0,
                    "target_invoice_id": r['id'],
                    "amount": r_amt
                }
            })

        # ----------------------------------------------------
        # Rule B: Incoming Payments After Supplier Due Dates (Timing Mismatches)
        # ----------------------------------------------------
        for p in open_payables:
            p_amt = _safe_float(p['amount'])
            p_due = str(p['due_date'])[:10]
            try:
                p_dt = datetime.strptime(p_due, '%Y-%m-%d')
            except ValueError:
                continue

            for r in open_receivables:
                r_amt = _safe_float(r['amount'])
                r_date = str(r.get('expected_payment_date') or r.get('due_date'))[:10]
                try:
                    r_dt = datetime.strptime(r_date, '%Y-%m-%d')
                except ValueError:
                    continue

                gap_days = (r_dt - p_dt).days
                # If supplier payment occurs 1 to 14 days before expected customer receipts
                if 1 <= gap_days <= 14 and (p_amt >= 10000 or r_amt >= 10000):
                    rule_key = f"TIMING_MISMATCH_{p['id']}"

                    if has_negative_cash:
                        priority = 'Critical'
                    elif is_shortfall:
                        priority = 'High'
                    else:
                        priority = 'Medium'

                    rules_output.append({
                        "rule_key": rule_key,
                        "category": "Payables",
                        "title": f"Timing Mismatch: {p['supplier_name']} vs {r['customer_name']}",
                        "explanation": f"Supplier payment of ₹{p_amt:,.2f} for {p['bill_number']} is due on {p_due}, which is {gap_days} day(s) before expected customer receipts of ₹{r_amt:,.2f} from {r['customer_name']} on {r_date}. Paying before receipts clear creates a temporary cash gap.",
                        "priority": priority,
                        "related_risk": f"Liquidity trough between {p_due} and {r_date}",
                        "related_record_type": "payable",
                        "related_record_id": p['id'],
                        "related_record_reference": p['bill_number'],
                        "counterparty": p['supplier_name'],
                        "relevant_date": p_due,
                        "suggested_action": f"Review supplier payment schedule. Contact {p['supplier_name']} to discuss a {gap_days + 3}-day grace period or 50% split payment to align disbursement with incoming receipts from {r['customer_name']}.",
                        "estimated_impact": p_amt,
                        "impact_description": f"Staggering or aligning this bill protects ₹{p_amt:,.2f} from exiting before incoming customer funds arrive.",
                        "simulator_params": {
                            "vendor_stagger_pct": 50.0,
                            "target_bill_id": p['id'],
                            "amount": p_amt
                        }
                    })
                    break  # One timing mismatch rule per payable

        # ----------------------------------------------------
        # Rule C: Upcoming Large Supplier Payments with Low Projected Balance
        # ----------------------------------------------------
        for p in open_payables:
            p_amt = _safe_float(p['amount'])
            p_due = str(p['due_date'])[:10]
            # Check if payable is large (> 35% buffer or > 25% starting balance)
            is_large = p_amt >= (0.35 * minimum_cash_buffer) or p_amt >= (0.25 * starting_balance)
            already_matched_timing = any(ro['rule_key'] == f"TIMING_MISMATCH_{p['id']}" for ro in rules_output)

            if is_large and not already_matched_timing:
                rule_key = f"LARGE_PAYABLE_{p['id']}"
                if has_negative_cash:
                    priority = 'Critical'
                elif is_shortfall:
                    priority = 'High'
                else:
                    priority = 'Medium'

                half_amt = round(p_amt * 0.5, 2)
                rules_output.append({
                    "rule_key": rule_key,
                    "category": "Payables",
                    "title": f"Review Large Supplier Obligation: {p['supplier_name']}",
                    "explanation": f"A major supplier payment of ₹{p_amt:,.2f} ({p['bill_number']}) is due on {p_due}. This single disbursement represents {round((p_amt/max(1, minimum_cash_buffer))*100, 1)}% of your configured minimum buffer (₹{minimum_cash_buffer:,.2f}).",
                    "priority": priority,
                    "related_risk": "High-value single disbursement compressing cash cushion",
                    "related_record_type": "payable",
                    "related_record_id": p['id'],
                    "related_record_reference": p['bill_number'],
                    "counterparty": p['supplier_name'],
                    "relevant_date": p_due,
                    "suggested_action": f"Confirm billing accuracy and evaluate requesting a 2-part tranche settlement (50% on {p_due}, 50% in 15 days) to preserve liquidity.",
                    "estimated_impact": half_amt,
                    "impact_description": f"Splitting into two tranches preserves ₹{half_amt:,.2f} in liquid reserves on {p_due}.",
                    "simulator_params": {
                        "vendor_stagger_pct": 50.0,
                        "target_bill_id": p['id'],
                        "amount": p_amt
                    }
                })

        # ----------------------------------------------------
        # Rule D: Multiple Payments Due on the Same Date (Clustered Outflows)
        # ----------------------------------------------------
        bills_by_date = {}
        for p in open_payables:
            d_str = str(p['due_date'])[:10]
            bills_by_date.setdefault(d_str, []).append(p)

        for b_date, b_list in bills_by_date.items():
            if len(b_list) >= 2:
                clustered_amt = sum(_safe_float(x['amount']) for x in b_list)
                if clustered_amt >= 20000 or clustered_amt >= (0.25 * minimum_cash_buffer):
                    rule_key = f"CLUSTERED_OUTFLOWS_{b_date}"
                    names = ", ".join(x['supplier_name'] for x in b_list[:3])
                    if len(b_list) > 3:
                        names += f" + {len(b_list)-3} more"

                    if has_negative_cash or (lowest_projected_balance < minimum_cash_buffer and b_date <= (trough_date or b_date)):
                        priority = 'High'
                    else:
                        priority = 'Medium'

                    smoothed_relief = round(clustered_amt * 0.4, 2)
                    rules_output.append({
                        "rule_key": rule_key,
                        "category": "Cash Smoothing",
                        "title": f"Stagger {len(b_list)} Payments Due on {b_date}",
                        "explanation": f"{len(b_list)} payments totaling ₹{clustered_amt:,.2f} are scheduled on the same date ({names}). Simultaneous outflows compress liquid funds in a single day.",
                        "priority": priority,
                        "related_risk": f"Clustered same-day disbursement of ₹{clustered_amt:,.2f}",
                        "related_record_type": "payables_batch",
                        "related_record_id": b_list[0]['id'],
                        "related_record_reference": f"{len(b_list)} bills batch",
                        "counterparty": names,
                        "relevant_date": b_date,
                        "suggested_action": f"Review obligations due on {b_date}. Verify which are contractually mandatory and discuss scheduling non-critical vendor disbursements across subsequent weeks.",
                        "estimated_impact": smoothed_relief,
                        "impact_description": f"Rescheduling non-urgent obligations smooths up to ₹{smoothed_relief:,.2f} away from {b_date}.",
                        "simulator_params": {
                            "vendor_stagger_pct": 40.0,
                            "date": b_date,
                            "amount": clustered_amt
                        }
                    })

        # ----------------------------------------------------
        # Rule E: Excessive Outstanding Receivables
        # ----------------------------------------------------
        total_open_rec_amt = sum(_safe_float(r['amount']) for r in open_receivables) or 1.0
        overdue_ratio = (total_overdue_amt / total_open_rec_amt) * 100

        if len(overdue_invoices) >= 2 and (overdue_ratio >= 25.0 or total_overdue_amt >= 30000):
            rule_key = "EXCESSIVE_OUTSTANDING_RECEIVABLES"
            priority = 'High' if (total_overdue_amt >= minimum_cash_buffer or is_shortfall) else 'Medium'
            rules_output.append({
                "rule_key": rule_key,
                "category": "Receivables",
                "title": "Systemic Receivables Overdue Exposure",
                "explanation": f"Overdue customer payments total ₹{total_overdue_amt:,.2f} across {len(overdue_invoices)} customer(s), representing {overdue_ratio:.1f}% of total open receivables. Delayed collections directly constrain working capital.",
                "priority": priority,
                "related_risk": "Receivables delay compressing cash runway",
                "related_record_type": "receivable_aggregate",
                "related_record_id": None,
                "related_record_reference": f"{len(overdue_invoices)} overdue invoices",
                "counterparty": f"{len(overdue_invoices)} Customers",
                "relevant_date": today_str,
                "suggested_action": "Conduct a weekly receivables aging audit. Focus follow-up efforts on overdue accounts >15 days and review credit terms for consistently late counterparties.",
                "estimated_impact": total_overdue_amt,
                "impact_description": f"Collecting outstanding overdue amounts restores up to ₹{total_overdue_amt:,.2f} in working capital.",
                "simulator_params": {
                    "early_settlement_pct": 2.0,
                    "amount": total_overdue_amt
                }
            })

        # ----------------------------------------------------
        # Rule F: Missing or Incomplete Financial Data
        # ----------------------------------------------------
        is_missing_settings = (not settings_row) or (starting_balance <= 0) or (minimum_cash_buffer <= 0)
        if is_missing_settings:
            rule_key = "MISSING_FINANCIAL_DATA"
            rules_output.append({
                "rule_key": rule_key,
                "category": "Data Quality",
                "title": "Complete Baseline Cash & Buffer Settings",
                "explanation": "Your cash-flow forecast requires a verified opening bank balance and target safety buffer. Forecast reliability depends on reconciled financial baselines.",
                "priority": "Medium",
                "related_risk": "Unverified starting cash baseline",
                "related_record_type": "forecast_settings",
                "related_record_id": 1,
                "related_record_reference": "Settings",
                "counterparty": "Internal Finance",
                "relevant_date": today_str,
                "suggested_action": "Navigate to Forecast Settings and update your opening cash balance and minimum cash buffer to match your latest reconciled bank records.",
                "estimated_impact": None,
                "impact_description": "Impact not estimated (data hygiene action)",
                "simulator_params": None
            })

        # ----------------------------------------------------
        # Rule G: Healthy Cash Position (Constructive Guidance)
        # ----------------------------------------------------
        if not is_shortfall and not has_negative_cash and len(overdue_invoices) == 0:
            rule_key = "HEALTHY_POSITION"
            rules_output.append({
                "rule_key": rule_key,
                "category": "Liquidity Management",
                "title": "Maintain Buffer Discipline & Monitor Inflows",
                "explanation": f"Projected cash balance safely maintains a healthy margin above your ₹{minimum_cash_buffer:,.2f} buffer across the next 30 days. No immediate liquidity shortages are detected.",
                "priority": "Low",
                "related_risk": "None (Healthy Cash Position)",
                "related_record_type": "forecast",
                "related_record_id": None,
                "related_record_reference": "Healthy Projection",
                "counterparty": "Operating Reserve",
                "relevant_date": today_str,
                "suggested_action": "Continue monitoring confirmed customer milestones, review upcoming discretionary expenditures, and maintain buffer discipline.",
                "estimated_impact": None,
                "impact_description": "Impact not estimated (maintenance advisory)",
                "simulator_params": None
            })

        return rules_output

    @staticmethod
    def sync_recommendations_with_db(evaluated_rules):
        """
        Safely synchronizes evaluated rules with the SQLite recommendations table:
        - Deduplicates via rule_key.
        - Preserves user lifecycle states ('Dismissed', 'Reviewed', 'Resolved').
        - Resolves recommendations whose conditions are no longer present.
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Fetch current stored recommendations
        cursor.execute("SELECT * FROM recommendations;")
        existing_rows = [dict(r) for r in cursor.fetchall()]
        existing_by_key = {r['rule_key']: r for r in existing_rows if r.get('rule_key')}

        active_rule_keys = {rule['rule_key'] for rule in evaluated_rules}

        # 2. Insert or update evaluated rules
        for rule in evaluated_rules:
            r_key = rule['rule_key']
            existing = existing_by_key.get(r_key)

            urg_val = 'HIGH' if str(rule.get('priority', '')).upper() in ['CRITICAL', 'HIGH'] else ('LOW' if str(rule.get('priority', '')).upper() == 'LOW' else 'MEDIUM')

            if existing:
                # Do not un-dismiss or un-resolve if the user explicitly acted
                current_status = existing.get('status') or 'New'
                if current_status not in ['Dismissed', 'Reviewed', 'Resolved']:
                    current_status = 'New'

                cursor.execute("""
                    UPDATE recommendations
                    SET category = ?,
                        title = ?,
                        explanation = ?,
                        description = ?,
                        priority = ?,
                        urgency = ?,
                        related_risk = ?,
                        related_record_type = ?,
                        related_record_id = ?,
                        relevant_date = ?,
                        suggested_action = ?,
                        action_cta = ?,
                        estimated_impact = ?,
                        impact_amount = ?,
                        impact_description = ?,
                        status = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?;
                """, (
                    rule.get('category', 'Working Capital'),
                    rule.get('title'),
                    rule.get('explanation'),
                    rule.get('explanation'),
                    rule.get('priority', 'Medium'),
                    urg_val,
                    rule.get('related_risk'),
                    rule.get('related_record_type'),
                    rule.get('related_record_id'),
                    rule.get('relevant_date'),
                    rule.get('suggested_action'),
                    rule.get('suggested_action')[:40],
                    rule.get('estimated_impact'),
                    rule.get('estimated_impact') or 0.0,
                    rule.get('impact_description'),
                    current_status,
                    existing['id']
                ))
            else:
                # Insert brand new recommendation
                cursor.execute("""
                    INSERT INTO recommendations (
                        rule_key, related_record_type, related_record_id, category,
                        title, explanation, description, priority, urgency,
                        related_risk, relevant_date, suggested_action, action_cta,
                        estimated_impact, impact_amount, impact_description, effort,
                        status, created_at, updated_at
                    ) VALUES (
                        ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, 'LOW',
                        'New', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    );
                """, (
                    rule.get('rule_key'),
                    rule.get('related_record_type'),
                    rule.get('related_record_id'),
                    rule.get('category', 'Working Capital'),
                    rule.get('title'),
                    rule.get('explanation'),
                    rule.get('explanation'),
                    rule.get('priority', 'Medium'),
                    urg_val,
                    rule.get('related_risk'),
                    rule.get('relevant_date'),
                    rule.get('suggested_action'),
                    rule.get('suggested_action')[:40],
                    rule.get('estimated_impact'),
                    rule.get('estimated_impact') or 0.0,
                    rule.get('impact_description')
                ))

        # 3. Mark stored recommendations as 'Resolved' if their underlying trigger has disappeared
        for r_key, ex_rec in existing_by_key.items():
            if r_key not in active_rule_keys and ex_rec.get('status') in ['New', 'Reviewed']:
                cursor.execute("""
                    UPDATE recommendations
                    SET status = 'Resolved', updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?;
                """, (ex_rec['id'],))

        conn.commit()
        conn.close()

    @staticmethod
    def get_recommendations(status=None, priority=None, limit=None):
        """
        Fetch recommendations with filtering and priority sorting:
        Critical > High > Medium > Low.
        """
        # Ensure latest rules are evaluated and synced
        try:
            evaluated = RecommendationService.evaluate_rules(days=30)
            RecommendationService.sync_recommendations_with_db(evaluated)
        except Exception as e:
            print(f"Warning: automatic rule sync notice: {e}")

        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM recommendations WHERE 1=1"
        params = []

        if status:
            if status.lower() == 'active':
                query += " AND status IN ('New', 'Reviewed', 'ACTIVE')"
            elif status.lower() != 'all':
                query += " AND UPPER(status) = UPPER(?)"
                params.append(status)
        else:
            # By default exclude Dismissed
            query += " AND status != 'Dismissed'"

        if priority and priority.lower() != 'all':
            query += " AND UPPER(priority) = UPPER(?)"
            params.append(priority)

        query += """
            ORDER BY 
                CASE UPPER(priority)
                    WHEN 'CRITICAL' THEN 1
                    WHEN 'HIGH' THEN 2
                    WHEN 'MEDIUM' THEN 3
                    WHEN 'LOW' THEN 4
                    ELSE 5
                END,
                created_at DESC
        """

        if limit:
            query += " LIMIT ?"
            params.append(int(limit))

        cursor.execute(query, params)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()

        # Clean null values and add formatted helpers
        for r in rows:
            if r.get('estimated_impact') is None and r.get('impact_amount'):
                r['estimated_impact'] = float(r['impact_amount'])
            if r.get('priority') is None and r.get('urgency'):
                u = r['urgency'].upper()
                r['priority'] = 'High' if u == 'HIGH' else ('Low' if u == 'LOW' else 'Medium')
            if not r.get('explanation') and r.get('description'):
                r['explanation'] = r['description']
            if not r.get('suggested_action') and r.get('action_cta'):
                r['suggested_action'] = r['action_cta']

        return rows

    @staticmethod
    def get_recommendation_by_id(rec_id):
        """Fetch single recommendation by ID with supporting record details."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM recommendations WHERE id = ?;", (rec_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None

        rec = dict(row)
        rec_type = rec.get('related_record_type')
        rec_rec_id = rec.get('related_record_id')
        related_data = None

        if rec_type == 'receivable' and rec_rec_id:
            cursor.execute("SELECT * FROM receivables WHERE id = ?;", (rec_rec_id,))
            r_row = cursor.fetchone()
            if r_row:
                related_data = dict(r_row)
        elif rec_type == 'payable' and rec_rec_id:
            cursor.execute("SELECT * FROM payables WHERE id = ?;", (rec_rec_id,))
            p_row = cursor.fetchone()
            if p_row:
                related_data = dict(p_row)

        conn.close()
        rec['related_record_data'] = related_data
        return rec

    @staticmethod
    def update_status(rec_id, new_status):
        """Update recommendation lifecycle status ('Reviewed', 'Dismissed', 'Resolved', 'New')."""
        valid_statuses = ['NEW', 'REVIEWED', 'DISMISSED', 'RESOLVED', 'ACTIVE', 'APPLIED']
        if not new_status or new_status.upper() not in valid_statuses:
            raise ValueError(f"Invalid status: '{new_status}'. Allowed: New, Reviewed, Dismissed, Resolved.")

        normalized_status = new_status.capitalize()
        if normalized_status == 'Active':
            normalized_status = 'New'
        elif normalized_status == 'Applied':
            normalized_status = 'Resolved'

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE recommendations 
            SET status = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?;
        """, (normalized_status, rec_id))
        rows_affected = cursor.rowcount
        conn.commit()
        conn.close()

        if rows_affected == 0:
            return False
        return True

    @staticmethod
    def get_summary():
        """
        Calculate summary counts and potential cash-flow improvement:
        1. Critical Actions
        2. High-Priority Actions
        3. Other Suggestions (Medium + Low)
        4. Potential Cash-Flow Improvement (sum of calculable scenarios)
        """
        recs = RecommendationService.get_recommendations(status='active')

        critical_count = len([r for r in recs if r.get('priority', '').upper() == 'CRITICAL'])
        high_count = len([r for r in recs if r.get('priority', '').upper() == 'HIGH'])
        other_count = len([r for r in recs if r.get('priority', '').upper() in ['MEDIUM', 'LOW']])

        # Calculate potential improvement only from defined scenarios with numeric impact
        calculable_impacts = [_safe_float(r.get('estimated_impact')) for r in recs if _safe_float(r.get('estimated_impact')) > 0]
        total_potential_improvement = sum(calculable_impacts)
        has_calculated_improvement = len(calculable_impacts) > 0

        # Highest priority active recommendation for dashboard
        top_rec = recs[0] if len(recs) > 0 else None

        return {
            "critical_count": critical_count,
            "high_count": high_count,
            "other_count": other_count,
            "total_active_count": len(recs),
            "potential_cash_flow_improvement": total_potential_improvement if has_calculated_improvement else None,
            "has_calculated_improvement": has_calculated_improvement,
            "top_recommendation": top_rec
        }
