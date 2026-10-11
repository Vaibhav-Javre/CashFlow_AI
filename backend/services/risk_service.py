import sqlite3
from datetime import datetime, timedelta
from decimal import Decimal
from backend.database import get_db_connection
from backend.services.forecast_service import ForecastService

def _safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

class RiskService:
    @staticmethod
    def get_risk_analysis(days=30):
        """
        Unified alias for risk analysis. Maintains backward compatibility with legacy
        consumers while providing complete AI Risk Center intelligence.
        """
        return RiskService.get_risk_center_analysis(days=days)

    @staticmethod
    def get_risk_center_analysis(days=30):
        """
        Dedicated service for explainable, rule-based financial risk detection.
        Reuses ForecastService as the single source of truth for projected balances.
        """
        try:
            days = int(days)
            if days not in [7, 30, 60]:
                if days < 1 or days > 365:
                    days = 30
        except (TypeError, ValueError):
            days = 30

        # 1. Retrieve single source of truth from forecasting engine
        forecast = ForecastService.generate_forecast(days=days)

        timeline = forecast.get('timeline', [])
        starting_balance = _safe_float(forecast.get('starting_balance', 0.0))
        minimum_cash_buffer = _safe_float(forecast.get('minimum_cash_buffer', 0.0))
        lowest_projected_balance = _safe_float(forecast.get('lowest_projected_balance', 0.0))
        trough_date = forecast.get('trough_date')
        first_risk_date = forecast.get('first_risk_date')
        first_critical_date = forecast.get('first_critical_date')

        # 2. Deficit calculations
        # Potential Shortfall = max(0, Minimum Cash Buffer - Lowest Projected Balance)
        potential_shortfall = max(0.0, minimum_cash_buffer - lowest_projected_balance)
        buffer_deficit = max(0.0, minimum_cash_buffer - lowest_projected_balance)
        negative_balance_deficit = max(0.0, -lowest_projected_balance)
        has_negative_balance = lowest_projected_balance < 0.0

        # 3. Analyze daily timeline: classify each date & identify distinct contiguous risk periods
        risk_dates_count = 0
        negative_dates_count = 0
        distinct_risk_periods = []
        current_period = None

        enriched_timeline = []
        for day in timeline:
            d_date = day['date']
            closing = _safe_float(day.get('closing_balance', 0.0))
            inflows = _safe_float(day.get('expected_inflows', 0.0))
            outflows = _safe_float(day.get('expected_outflows', 0.0))

            day_buf_def = max(0.0, minimum_cash_buffer - closing)
            day_neg_def = max(0.0, -closing)

            is_neg = closing < 0.0
            is_below_buffer = closing < minimum_cash_buffer

            if is_neg:
                day_severity = 'CRITICAL'
                negative_dates_count += 1
            elif is_below_buffer:
                day_severity = 'HIGH'
            else:
                day_severity = 'HEALTHY'

            is_risk_day = is_neg or is_below_buffer

            if is_risk_day:
                risk_dates_count += 1
                if current_period is None:
                    current_period = {
                        "start_date": d_date,
                        "end_date": d_date,
                        "duration_days": 1,
                        "lowest_balance": closing,
                        "trough_date": d_date,
                        "max_shortfall": day_buf_def,
                        "max_negative_deficit": day_neg_def,
                        "severity": day_severity,
                        "dates": [d_date]
                    }
                else:
                    current_period["end_date"] = d_date
                    current_period["duration_days"] += 1
                    current_period["dates"].append(d_date)
                    if closing < current_period["lowest_balance"]:
                        current_period["lowest_balance"] = closing
                        current_period["trough_date"] = d_date
                    if day_buf_def > current_period["max_shortfall"]:
                        current_period["max_shortfall"] = day_buf_def
                    if day_neg_def > current_period["max_negative_deficit"]:
                        current_period["max_negative_deficit"] = day_neg_def
                    if day_severity == 'CRITICAL':
                        current_period["severity"] = 'CRITICAL'
            else:
                if current_period is not None:
                    distinct_risk_periods.append(current_period)
                    current_period = None

            enriched_timeline.append({
                **day,
                "buffer_deficit": round(day_buf_def, 2),
                "negative_balance_deficit": round(day_neg_def, 2),
                "risk_severity": day_severity,
                "is_risk": is_risk_day
            })

        if current_period is not None:
            distinct_risk_periods.append(current_period)

        # 4. Database queries for cause detection, debtor concentration, aging, and active alerts
        conn = get_db_connection()
        cursor = conn.cursor()

        # Active risk alerts table records
        cursor.execute("""
            SELECT id, title, severity, shortfall_amount, projected_date, root_cause, mitigation_action, status, created_at
            FROM risk_alerts
            WHERE status = 'ACTIVE'
            ORDER BY 
                CASE severity 
                    WHEN 'CRITICAL' THEN 1 
                    WHEN 'WARNING' THEN 2 
                    WHEN 'INFO' THEN 3 
                    ELSE 4 
                END;
        """)
        alerts = [dict(row) for row in cursor.fetchall()]

        # Receivables customer concentration
        cursor.execute("""
            SELECT customer_name, SUM(amount) as total_amount, COUNT(*) as invoice_count
            FROM receivables
            WHERE status != 'PAID'
            GROUP BY customer_name
            ORDER BY total_amount DESC;
        """)
        debtor_concentration = [dict(row) for row in cursor.fetchall()]
        total_open_receivables = sum(d['total_amount'] for d in debtor_concentration) or 1.0

        max_concentration = 0.0
        for debtor in debtor_concentration:
            pct = round((debtor['total_amount'] / total_open_receivables) * 100, 1)
            debtor['concentration_pct'] = pct
            if pct > max_concentration:
                max_concentration = pct

        # Aging brackets
        cursor.execute("""
            SELECT 
                SUM(CASE WHEN days_overdue = 0 THEN amount ELSE 0 END) as current_bucket,
                SUM(CASE WHEN days_overdue BETWEEN 1 AND 15 THEN amount ELSE 0 END) as days_1_15,
                SUM(CASE WHEN days_overdue BETWEEN 16 AND 30 THEN amount ELSE 0 END) as days_16_30,
                SUM(CASE WHEN days_overdue > 30 THEN amount ELSE 0 END) as days_31_plus
            FROM receivables
            WHERE status != 'PAID';
        """)
        aging_row = cursor.fetchone()
        aging = {
            "current": _safe_float(aging_row['current_bucket'] if aging_row else 0),
            "days_1_15": _safe_float(aging_row['days_1_15'] if aging_row else 0),
            "days_16_30": _safe_float(aging_row['days_16_30'] if aging_row else 0),
            "days_31_plus": _safe_float(aging_row['days_31_plus'] if aging_row else 0)
        }

        # Open receivables (with customer and invoice details)
        cursor.execute("""
            SELECT id, invoice_number, customer_name, due_date, expected_payment_date, amount, status, days_overdue
            FROM receivables
            WHERE status != 'PAID'
            ORDER BY due_date ASC;
        """)
        open_receivables = [dict(row) for row in cursor.fetchall()]
        overdue_receivables = [r for r in open_receivables if r['status'] == 'OVERDUE' or _safe_float(r['days_overdue']) > 0]
        total_overdue_amt = sum(_safe_float(r['amount']) for r in overdue_receivables)

        # Open payables within horizon
        cursor.execute("""
            SELECT id, bill_number, invoice_number, supplier_name, vendor_name, due_date, amount, status, priority, category
            FROM payables
            WHERE status != 'PAID'
            ORDER BY due_date ASC;
        """)
        open_payables = [dict(row) for row in cursor.fetchall()]
        for p in open_payables:
            if not p['bill_number']:
                p['bill_number'] = p['invoice_number'] or f"BILL-{p['id']}"
            if not p['supplier_name']:
                p['supplier_name'] = p['vendor_name'] or "Vendor"

        # Check for near-term material obligation (next 7 days consuming > 50% buffer margin)
        start_dt = datetime.strptime(forecast.get('start_date', datetime.now().strftime('%Y-%m-%d'))[:10], '%Y-%m-%d')
        seven_days_dt = start_dt + timedelta(days=7)
        buffer_margin = max(1.0, lowest_projected_balance - minimum_cash_buffer)
        has_near_term_large_obligation = False
        for p in open_payables:
            try:
                p_dt = datetime.strptime(str(p['due_date'])[:10], '%Y-%m-%d')
                if start_dt <= p_dt <= seven_days_dt:
                    if _safe_float(p['amount']) > (0.50 * buffer_margin):
                        has_near_term_large_obligation = True
                        break
            except Exception:
                pass

        conn.close()

        # 5. Explainable Overall Risk Classification (Priority: Critical > High > Moderate > Healthy)
        is_currently_below_buffer = starting_balance < minimum_cash_buffer
        is_currently_negative = starting_balance < 0.0

        if has_negative_balance or first_critical_date is not None or is_currently_negative:
            overall_risk = "Critical"
            classification_rule = "Critical: Liquid cash is negative or projected to become negative at least once during the selected forecast period."
        elif lowest_projected_balance < minimum_cash_buffer or is_currently_below_buffer:
            overall_risk = "High"
            classification_rule = "High: Cash balance is currently below or projected to fall below the configured minimum safe buffer."
        elif len(overdue_receivables) > 0 or max_concentration > 30.0 or has_near_term_large_obligation or len(alerts) > 0:
            overall_risk = "Moderate"
            mod_reasons = []
            if len(overdue_receivables) > 0:
                mod_reasons.append(f"{len(overdue_receivables)} customer invoice(s) are overdue totaling ₹{total_overdue_amt:,.2f}")
            if max_concentration > 30.0:
                mod_reasons.append(f"Top debtor accounts for {max_concentration:.1f}% of total open receivables")
            if has_near_term_large_obligation:
                mod_reasons.append("Material upcoming supplier obligation due within 7 days")
            if len(alerts) > 0:
                mod_reasons.append(f"{len(alerts)} active operational alert(s) logged")
            classification_rule = f"Moderate: Projected balance remains above minimum buffer, but requires management review ({'; '.join(mod_reasons)})."
        else:
            overall_risk = "Healthy"
            classification_rule = "Healthy: No configured risk condition is triggered. Projected closing balance safely exceeds the minimum cash buffer throughout the period."

        # 6. Section 5: Identify Causes of Risk ("Why Is My Cash at Risk?")
        causes = []
        # A. Timing Mismatches (Supplier bill due before expected customer receipts)
        for p in open_payables:
            p_amt = _safe_float(p['amount'])
            p_due = str(p['due_date'])[:10]
            try:
                p_dt = datetime.strptime(p_due, '%Y-%m-%d')
            except ValueError:
                continue

            for r in open_receivables:
                r_amt = _safe_float(r['amount'])
                r_date = str(r['expected_payment_date'] or r['due_date'])[:10]
                try:
                    r_dt = datetime.strptime(r_date, '%Y-%m-%d')
                except ValueError:
                    continue

                gap_days = (r_dt - p_dt).days
                # If supplier payment occurs 1 to 14 days before expected customer receipts
                if 1 <= gap_days <= 14 and (p_amt >= 10000 or r_amt >= 10000):
                    causes.append({
                        "cause_type": "TIMING_MISMATCH",
                        "title": f"Timing Mismatch: Supplier Bill Due Before Customer Receipts",
                        "date": p_due,
                        "amount": p_amt,
                        "related_record_type": "payable",
                        "related_record_id": p['id'],
                        "related_record_number": p['bill_number'],
                        "counterparty": p['supplier_name'],
                        "paired_receivable_number": r['invoice_number'],
                        "paired_customer": r['customer_name'],
                        "paired_date": r_date,
                        "short_explanation": f"Supplier payment of ₹{p_amt:,.2f} for {p['supplier_name']} is scheduled for {p_due}, which occurs {gap_days} days before expected customer receipts of ₹{r_amt:,.2f} from {r['customer_name']} on {r_date}.",
                        "why_it_matters": f"Paying {p['supplier_name']} {gap_days} days before receipts arrive drains liquidity before cash replenishment occurs, creating a temporary cash deficit."
                    })
                    break  # Match one key receipt pair per payable

        # B. Overdue Customer Invoices
        for r in overdue_receivables:
            r_amt = _safe_float(r['amount'])
            days_od = int(r.get('days_overdue', 0))
            causes.append({
                "cause_type": "OVERDUE_INVOICE",
                "title": f"Overdue Customer Invoice: {r['customer_name']}",
                "date": str(r['due_date'])[:10],
                "amount": r_amt,
                "related_record_type": "receivable",
                "related_record_id": r['id'],
                "related_record_number": r['invoice_number'],
                "counterparty": r['customer_name'],
                "short_explanation": f"Customer invoice {r['invoice_number']} for ₹{r_amt:,.2f} is {days_od} days overdue (originally due {str(r['due_date'])[:10]}).",
                "why_it_matters": f"Uncollected invoice revenue directly locks ₹{r_amt:,.2f} of working capital that could otherwise protect the minimum cash buffer."
            })

        # C. Clustered Expenses / Same-day obligations
        bills_by_date = {}
        for p in open_payables:
            d_str = str(p['due_date'])[:10]
            bills_by_date.setdefault(d_str, []).append(p)

        for b_date, b_list in bills_by_date.items():
            if len(b_list) >= 2:
                clustered_amt = sum(_safe_float(x['amount']) for x in b_list)
                names = ", ".join(x['supplier_name'] for x in b_list)
                causes.append({
                    "cause_type": "CLUSTERED_OUTFLOWS",
                    "title": f"Clustered Obligations on {b_date}",
                    "date": b_date,
                    "amount": clustered_amt,
                    "related_record_type": "payables_batch",
                    "related_record_id": b_list[0]['id'],
                    "related_record_number": f"{len(b_list)} bills",
                    "counterparty": names,
                    "short_explanation": f"{len(b_list)} supplier payments totaling ₹{clustered_amt:,.2f} are scheduled on {b_date} ({names}).",
                    "why_it_matters": "Simultaneous disbursements compress liquid funds in a single day, increasing exposure to sudden buffer dips."
                })

        # D. Large Single Obligations
        for p in open_payables:
            p_amt = _safe_float(p['amount'])
            if p_amt >= (0.30 * minimum_cash_buffer) or p_amt >= (0.25 * starting_balance):
                # Avoid exact duplicate of clustered card
                if not any(c['cause_type'] == 'LARGE_OBLIGATION' and c['related_record_id'] == p['id'] for c in causes):
                    causes.append({
                        "cause_type": "LARGE_OBLIGATION",
                        "title": f"Large Single Obligation: {p['supplier_name']}",
                        "date": str(p['due_date'])[:10],
                        "amount": p_amt,
                        "related_record_type": "payable",
                        "related_record_id": p['id'],
                        "related_record_number": p['bill_number'],
                        "counterparty": p['supplier_name'],
                        "short_explanation": f"Single high-value payment of ₹{p_amt:,.2f} due on {str(p['due_date'])[:10]} for {p['supplier_name']}.",
                        "why_it_matters": f"A single large disbursement absorbs a major portion of liquid reserves ({round((p_amt/max(1, minimum_cash_buffer))*100, 1)}% of minimum buffer)."
                    })

        # If buffer is breached or starting cash is below buffer, ensure it is highlighted as a primary root cause
        if is_currently_below_buffer or lowest_projected_balance < minimum_cash_buffer:
            causes.insert(0, {
                "cause_type": "BUFFER_BREACH",
                "title": "Available Cash Below Safe Reserve Buffer" if is_currently_below_buffer else "Projected Reserve Buffer Breach",
                "date": first_risk_date or forecast.get('start_date'),
                "amount": potential_shortfall,
                "related_record_type": "reserve_buffer",
                "related_record_id": None,
                "related_record_number": "Reserve Cushion",
                "counterparty": "Liquidity Reserve",
                "short_explanation": f"Current liquid balance of ₹{starting_balance:,.2f} is ₹{potential_shortfall:,.2f} below your configured minimum safe reserve buffer of ₹{minimum_cash_buffer:,.2f}.",
                "why_it_matters": "Operating below safe buffer thresholds leaves your business vulnerable to unforeseen disbursements and working capital shocks."
            })

        # If risks exist but no specific cause matched, provide honest explainable status
        if (overall_risk in ['Critical', 'High']) and len(causes) == 0:
            causes.append({
                "cause_type": "STRUCTURAL_DEFICIT",
                "title": "Structural Cash Outflow Concentration",
                "date": trough_date or forecast.get('start_date'),
                "amount": potential_shortfall,
                "related_record_type": "forecast",
                "related_record_id": None,
                "related_record_number": "Forecast Trend",
                "counterparty": "Multiple Operating Accounts",
                "short_explanation": f"The forecast indicates a projected cash shortfall of ₹{potential_shortfall:,.2f}, with cumulative outflows outpacing collections.",
                "why_it_matters": "While no single isolated transaction dominates, recurring operational burn requires balance review."
            })

        # If completely healthy, provide a positive confirmation
        if overall_risk == 'Healthy' and len(causes) == 0:
            causes.append({
                "cause_type": "HEALTHY_COVERAGE",
                "title": "Healthy Liquidity Coverage",
                "date": forecast.get('start_date'),
                "amount": lowest_projected_balance,
                "related_record_type": "forecast",
                "related_record_id": None,
                "related_record_number": "Healthy Reserve",
                "counterparty": "All Counterparties",
                "short_explanation": f"Projected cash balance maintains an adequate margin above the configured ₹{minimum_cash_buffer:,.2f} buffer throughout the {days}-day period.",
                "why_it_matters": "Expected inflows and cash on hand adequately support all scheduled disbursements."
            })

        # 7. Section 7: Upcoming Risk Events (deduplicated, actionable)
        risk_events = []

        # Convert distinct risk periods into primary events
        for period in distinct_risk_periods:
            if period['severity'] == 'CRITICAL':
                risk_events.append({
                    "id": f"event-crit-{period['start_date']}",
                    "severity": "CRITICAL",
                    "date": period['start_date'],
                    "end_date": period['end_date'],
                    "duration_days": period['duration_days'],
                    "title": f"Negative Cash Deficit ({period['start_date']})",
                    "description": f"Projected closing balance becomes negative at ₹{period['lowest_balance']:,.2f} for {period['duration_days']} consecutive day(s).",
                    "potential_amount_at_risk": period['max_negative_deficit'],
                    "related_record_type": "forecast_period",
                    "related_record_id": None,
                    "related_record_label": f"Trough on {period['trough_date']}",
                    "mitigation_hint": "Arrange emergency working capital, expedite overdue receivables, or request vendor payment grace periods immediately."
                })
            else:
                risk_events.append({
                    "id": f"event-high-{period['start_date']}",
                    "severity": "HIGH",
                    "date": period['start_date'],
                    "end_date": period['end_date'],
                    "duration_days": period['duration_days'],
                    "title": f"Cash Buffer Breach ({period['start_date']})",
                    "description": f"Projected balance falls below configured buffer (₹{minimum_cash_buffer:,.2f}) to a low of ₹{period['lowest_balance']:,.2f}.",
                    "potential_amount_at_risk": period['max_shortfall'],
                    "related_record_type": "forecast_period",
                    "related_record_id": None,
                    "related_record_label": f"Buffer deficit of ₹{period['max_shortfall']:,.2f}",
                    "mitigation_hint": "Follow up on overdue invoices or stagger upcoming supplier payments to maintain safe liquidity cushion."
                })

        # Generate dynamic alert when cash is below buffer or shortfall projected
        if is_currently_below_buffer or lowest_projected_balance < minimum_cash_buffer:
            dyn_alert_title = "Immediate Action: Cash Reserve Depleted Below Buffer" if is_currently_below_buffer else "Projected Cash Reserve Buffer Breach"
            dynamic_alert = {
                "id": "dyn-buffer-breach",
                "title": dyn_alert_title,
                "severity": "CRITICAL" if (is_currently_negative or has_negative_balance) else "WARNING",
                "shortfall_amount": potential_shortfall,
                "projected_date": forecast.get('start_date') if is_currently_below_buffer else first_risk_date,
                "root_cause": f"Cash position (₹{min(starting_balance, lowest_projected_balance):,.2f}) falls below configured safety cushion (₹{minimum_cash_buffer:,.2f}) by ₹{potential_shortfall:,.2f}.",
                "mitigation_action": "Pause discretionary expenditures, accelerate customer collections, and negotiate 15-day extensions on upcoming non-essential bills.",
                "status": "ACTIVE"
            }
            if not any(a.get('id') == 'dyn-buffer-breach' or a.get('title') == dyn_alert_title for a in alerts):
                alerts.insert(0, dynamic_alert)

        # Include active DB alerts as events (allowing manual resolution if needed)
        for alert in alerts:
            # Check if this alert date/title is already represented
            if not any(e.get('title') == alert['title'] for e in risk_events):
                risk_events.append({
                    "id": alert['id'],
                    "db_alert_id": alert['id'],
                    "severity": alert['severity'],
                    "date": alert['projected_date'] or forecast.get('start_date'),
                    "title": alert['title'],
                    "description": alert['root_cause'],
                    "potential_amount_at_risk": _safe_float(alert['shortfall_amount']),
                    "related_record_type": "risk_alert",
                    "related_record_id": alert['id'],
                    "related_record_label": f"Alert #{alert['id']}",
                    "mitigation_hint": alert['mitigation_action']
                })

        # 8. Section 8: Priority Actions (Rule-based, actionable recommendations)
        priority_actions = []

        # Action 0: Immediate Buffer Replenishment if breached
        if is_currently_below_buffer or lowest_projected_balance < minimum_cash_buffer:
            priority_actions.append({
                "action_id": "act-buffer-replenish",
                "priority_rank": 0,
                "urgency": "CRITICAL" if (is_currently_negative or has_negative_balance) else "HIGH",
                "category": "Capital Preservation",
                "title": "Restore Minimum Cash Reserve Cushion",
                "recommended_action": f"Immediate capital recovery required. Defer non-critical vendor disbursements, accelerate customer collections, or inject working capital to restore the ₹{minimum_cash_buffer:,.2f} reserve.",
                "reason": f"Current cash (₹{starting_balance:,.2f}) is ₹{potential_shortfall:,.2f} below the safety threshold required to cover operating commitments.",
                "potential_impact_amount": potential_shortfall,
                "target_type": "reserve_buffer",
                "target_id": None,
                "target_number": "Buffer Alert"
            })

        # Action 1: Overdue Invoices
        for r in overdue_receivables[:2]:
            r_amt = _safe_float(r['amount'])
            days_od = int(r.get('days_overdue', 0))
            priority_actions.append({
                "action_id": f"act-rec-{r['id']}",
                "priority_rank": 1,
                "urgency": "HIGH",
                "category": "Receivables Collection",
                "title": f"Follow Up on Overdue Invoice: {r['customer_name']}",
                "recommended_action": f"Contact {r['customer_name']} regarding invoice {r['invoice_number']} (₹{r_amt:,.2f}), which is {days_od} days past due.",
                "reason": f"Collecting ₹{r_amt:,.2f} provides immediate cash recovery to reinforce the safety buffer before upcoming disbursements.",
                "potential_impact_amount": r_amt,
                "target_type": "receivable",
                "target_id": r['id'],
                "target_number": r['invoice_number']
            })

        # Action 2: Timing Mismatches
        mismatch_causes = [c for c in causes if c['cause_type'] == 'TIMING_MISMATCH']
        for m in mismatch_causes[:2]:
            priority_actions.append({
                "action_id": f"act-timing-{m['related_record_id']}",
                "priority_rank": 2,
                "urgency": "HIGH" if overall_risk in ['Critical', 'High'] else "MEDIUM",
                "category": "Payables Rescheduling",
                "title": f"Negotiate Timing Adjustment with {m['counterparty']}",
                "recommended_action": f"Review supplier bill {m['related_record_number']} (₹{m['amount']:,.2f}) due {m['date']}. Request a 3 to 5 day payment window or two-part installment.",
                "reason": f"Aligns the disbursement with customer receipts arriving from {m.get('paired_customer', 'customers')} on {m.get('paired_date', 'next week')}, avoiding an avoidable cash dip.",
                "potential_impact_amount": m['amount'],
                "target_type": "payable",
                "target_id": m['related_record_id'],
                "target_number": m['related_record_number']
            })

        # Action 3: Large / Clustered Outflows
        large_causes = [c for c in causes if c['cause_type'] in ['CLUSTERED_OUTFLOWS', 'LARGE_OBLIGATION']]
        for l in large_causes[:1]:
            priority_actions.append({
                "action_id": f"act-stagger-{l['related_record_id']}",
                "priority_rank": 3,
                "urgency": "MEDIUM",
                "category": "Cash Smoothing",
                "title": f"Stagger Disbursements for {l['counterparty']}",
                "recommended_action": f"Check whether payment {l['related_record_number']} (₹{l['amount']:,.2f}) on {l['date']} can be split into weekly tranches.",
                "reason": "Prevents sharp single-day cash drawdown and preserves liquid operational buffer.",
                "potential_impact_amount": l['amount'],
                "target_type": "payable",
                "target_id": l['related_record_id'],
                "target_number": l['related_record_number']
            })

        # Action 4: Settings Verification
        priority_actions.append({
            "action_id": "act-settings-verify",
            "priority_rank": 4,
            "urgency": "LOW",
            "category": "Data Quality",
            "title": "Verify Opening Cash Balance & Buffer Setting",
            "recommended_action": f"Confirm that the configured starting balance (₹{starting_balance:,.2f}) matches your bank statement as of {forecast.get('start_date')}.",
            "reason": "A precise starting baseline ensures all forward-looking risk calculations reflect actual reconciled funds.",
            "potential_impact_amount": 0.0,
            "target_type": "forecast_settings",
            "target_id": 1,
            "target_number": "Settings"
        })

        # Sort priority actions by rank
        priority_actions.sort(key=lambda x: x['priority_rank'])

        return {
            "forecast_days": days,
            "start_date": forecast.get('start_date'),
            "end_date": forecast.get('end_date'),
            "overall_risk": overall_risk,
            "risk_status": overall_risk,
            "classification_rule": classification_rule,
            "first_risk_date": first_risk_date or "No risk detected",
            "first_critical_date": first_critical_date,
            "lowest_projected_balance": lowest_projected_balance,
            "trough_date": trough_date,
            "minimum_cash_buffer": minimum_cash_buffer,
            "potential_shortfall": potential_shortfall,
            "buffer_deficit": buffer_deficit,
            "negative_balance_deficit": negative_balance_deficit,
            "has_negative_balance": has_negative_balance,
            "is_shortfall_predicted": first_risk_date is not None,
            "risk_dates_count": risk_dates_count,
            "negative_dates_count": negative_dates_count,
            "distinct_risk_periods_count": len(distinct_risk_periods),
            "distinct_risk_periods": distinct_risk_periods,
            "causes": causes,
            "risk_events": risk_events,
            "priority_actions": priority_actions,
            "debtor_concentration": debtor_concentration,
            "aging_breakdown": aging,
            "timeline": enriched_timeline,
            "disclaimer": "Rule-based explainable financial risk detection. Suggestions are informational for management review and do not constitute professional financial or contractual advice.",
            # Backward compatibility fields for existing consumers and test suites:
            "alerts": alerts,
            "critical_count": len([a for a in alerts if a['severity'] == 'CRITICAL']) + (1 if overall_risk == 'Critical' else 0),
            "warning_count": len([a for a in alerts if a['severity'] == 'WARNING']) + (1 if overall_risk in ['High', 'Moderate'] else 0)
        }
