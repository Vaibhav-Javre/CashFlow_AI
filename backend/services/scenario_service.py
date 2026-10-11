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

class ScenarioService:
    @staticmethod
    def validate_adjustments(adjustments):
        """
        Validate adjustment structures, types, dates, and amounts.
        Validates linked IDs against actual database records.
        Does NOT modify any database records.
        """
        if adjustments is None:
            return []
        if not isinstance(adjustments, list):
            raise ValueError("Adjustments must be a list of adjustment objects.")

        validated = []
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            for idx, adj in enumerate(adjustments):
                if not isinstance(adj, dict):
                    raise ValueError(f"Adjustment at index {idx} must be a dictionary.")

                adj_type = str(adj.get('adjustment_type', '')).strip().lower()
                if adj_type not in ['customer_payment', 'supplier_payment', 'new_income', 'new_expense']:
                    raise ValueError(f"Unsupported adjustment type '{adj_type}' at index {idx}. Allowed: customer_payment, supplier_payment, new_income, new_expense.")

                # Validate hypothetical date
                hypo_date = str(adj.get('hypothetical_date', '')).strip()
                if not hypo_date or len(hypo_date) < 10:
                    raise ValueError(f"Invalid hypothetical date '{hypo_date}' at index {idx}. Must be YYYY-MM-DD.")
                try:
                    datetime.strptime(hypo_date[:10], '%Y-%m-%d')
                    hypo_date = hypo_date[:10]
                except ValueError:
                    raise ValueError(f"Invalid date format '{hypo_date}' at index {idx}. Expected YYYY-MM-DD.")

                # Validate hypothetical amount
                try:
                    hypo_amt = float(adj.get('hypothetical_amount', 0))
                    if hypo_amt < 0:
                        raise ValueError(f"Hypothetical amount at index {idx} must be non-negative.")
                except (TypeError, ValueError) as e:
                    raise ValueError(f"Invalid hypothetical amount at index {idx}: {str(e)}")

                rel_type = adj.get('related_record_type')
                rel_id = adj.get('related_record_id')
                orig_date = adj.get('original_date')
                orig_amt = _safe_float(adj.get('original_amount'))
                desc = str(adj.get('description', '')).strip()

                if adj_type == 'customer_payment':
                    if not rel_id:
                        raise ValueError(f"Customer payment adjustment at index {idx} requires 'related_record_id'.")
                    try:
                        rel_id = int(rel_id)
                    except (ValueError, TypeError):
                        raise ValueError(f"Invalid customer invoice ID '{rel_id}' at index {idx}.")

                    cursor.execute("SELECT id, invoice_number, customer_name, COALESCE(invoice_amount, amount) as amount, due_date, expected_payment_date FROM receivables WHERE id = ?;", (rel_id,))
                    rec = cursor.fetchone()
                    if not rec:
                        raise ValueError(f"Customer invoice with ID {rel_id} does not exist in the database.")
                    
                    rel_type = 'receivable'
                    orig_date = str(rec['expected_payment_date'] or rec['due_date'])[:10]
                    orig_amt = float(rec['amount'] or 0)
                    if not desc:
                        desc = f"Adjusted receipt for {rec['invoice_number']} ({rec['customer_name']})"

                elif adj_type == 'supplier_payment':
                    if not rel_id:
                        raise ValueError(f"Supplier payment adjustment at index {idx} requires 'related_record_id'.")
                    try:
                        rel_id = int(rel_id)
                    except (ValueError, TypeError):
                        raise ValueError(f"Invalid supplier bill ID '{rel_id}' at index {idx}.")

                    cursor.execute("SELECT id, COALESCE(bill_number, invoice_number) as bill_number, COALESCE(supplier_name, vendor_name) as vendor_name, COALESCE(bill_amount, amount) as amount, due_date FROM payables WHERE id = ?;", (rel_id,))
                    pay = cursor.fetchone()
                    if not pay:
                        raise ValueError(f"Supplier bill with ID {rel_id} does not exist in the database.")

                    rel_type = 'payable'
                    orig_date = str(pay['due_date'])[:10]
                    orig_amt = float(pay['amount'] or 0)
                    if not desc:
                        desc = f"Adjusted payment for {pay['bill_number'] or rel_id} ({pay['vendor_name']})"

                elif adj_type == 'new_income':
                    rel_type = None
                    rel_id = None
                    if not desc:
                        desc = "Hypothetical Additional Sales/Income"

                elif adj_type == 'new_expense':
                    rel_type = None
                    rel_id = None
                    if not desc:
                        desc = "Hypothetical Business Expense"

                validated.append({
                    "id": adj.get('id'),
                    "adjustment_type": adj_type,
                    "related_record_type": rel_type,
                    "related_record_id": rel_id,
                    "original_date": orig_date,
                    "original_amount": orig_amt,
                    "hypothetical_date": hypo_date,
                    "hypothetical_amount": hypo_amt,
                    "description": desc
                })
        finally:
            conn.close()

        return validated

    @staticmethod
    def _evaluate_risk_level(forecast):
        """
        Evaluate overall risk classification strictly by rule precedence:
        Critical > High > Moderate > Healthy.
        """
        lowest = _safe_float(forecast.get('lowest_projected_balance'))
        buffer = _safe_float(forecast.get('minimum_cash_buffer'))
        first_crit = forecast.get('first_critical_date')

        if lowest < 0.0 or first_crit is not None:
            return "Critical"
        elif lowest < buffer:
            return "High"
        elif forecast.get('has_risk', False) or forecast.get('is_shortfall_predicted', False):
            return "Moderate"
        else:
            return "Healthy"

    @staticmethod
    def preview_scenario(adjustments=None, days=30):
        """
        Runs baseline forecast and adjusted scenario forecast using the exact same
        forecasting engine. Compares metrics, timelines, and risks without modifying
        any real database records.
        """
        try:
            days = int(days)
            if days not in [7, 30, 60]:
                if days < 1 or days > 365:
                    days = 30
        except (ValueError, TypeError):
            days = 30

        validated_adjustments = ScenarioService.validate_adjustments(adjustments)

        # 1. Baseline forecast (no adjustments)
        baseline = ForecastService.generate_forecast(days=days)

        # 2. Scenario forecast (with validated in-memory adjustments)
        scenario = ForecastService.generate_forecast(days=days, adjustments=validated_adjustments)

        # 3. Risk classifications
        baseline_risk = ScenarioService._evaluate_risk_level(baseline)
        scenario_risk = ScenarioService._evaluate_risk_level(scenario)

        # 4. Metric comparisons and deltas
        base_ending = _safe_float(baseline.get('projected_ending_cash'))
        scen_ending = _safe_float(scenario.get('projected_ending_cash'))
        ending_delta = round(scen_ending - base_ending, 2)

        base_lowest = _safe_float(baseline.get('lowest_projected_balance'))
        scen_lowest = _safe_float(scenario.get('lowest_projected_balance'))
        lowest_delta = round(scen_lowest - base_lowest, 2)

        base_buffer = _safe_float(baseline.get('minimum_cash_buffer'))
        scen_buffer = _safe_float(scenario.get('minimum_cash_buffer'))

        base_shortfall = max(0.0, base_buffer - base_lowest)
        scen_shortfall = max(0.0, scen_buffer - scen_lowest)
        shortfall_delta = round(scen_shortfall - base_shortfall, 2)

        base_inflows = _safe_float(baseline.get('total_expected_inflows'))
        scen_inflows = _safe_float(scenario.get('total_expected_inflows'))
        inflows_delta = round(scen_inflows - base_inflows, 2)

        base_outflows = _safe_float(baseline.get('total_expected_outflows'))
        scen_outflows = _safe_float(scenario.get('total_expected_outflows'))
        outflows_delta = round(scen_outflows - base_outflows, 2)

        base_net = _safe_float(baseline.get('forecast_net_movement'))
        scen_net = _safe_float(scenario.get('forecast_net_movement'))
        net_delta = round(scen_net - base_net, 2)

        # 5. Dual-series chart timeline
        base_timeline = baseline.get('timeline', [])
        scen_timeline = scenario.get('timeline', [])

        comparison_timeline = []
        for i in range(len(base_timeline)):
            b_pt = base_timeline[i]
            s_pt = scen_timeline[i] if i < len(scen_timeline) else b_pt

            b_bal = _safe_float(b_pt.get('closing_balance'))
            s_bal = _safe_float(s_pt.get('closing_balance'))
            delta = round(s_bal - b_bal, 2)

            comparison_timeline.append({
                "date": b_pt['date'],
                "baseline_balance": b_bal,
                "scenario_balance": s_bal,
                "minimum_cash_buffer": base_buffer,
                "baseline_inflow": _safe_float(b_pt.get('expected_inflows')),
                "scenario_inflow": _safe_float(s_pt.get('expected_inflows')),
                "baseline_outflow": _safe_float(b_pt.get('expected_outflows')),
                "scenario_outflow": _safe_float(s_pt.get('expected_outflows')),
                "balance_delta": delta,
                "is_scenario_below_buffer": s_bal < base_buffer,
                "is_scenario_negative": s_bal < 0.0
            })

        return {
            "forecast_days": days,
            "start_date": baseline.get('start_date'),
            "end_date": baseline.get('end_date'),
            "minimum_cash_buffer": base_buffer,
            "adjustments_count": len(validated_adjustments),
            "adjustments": validated_adjustments,
            "comparison": {
                "projected_ending_cash": {
                    "baseline": base_ending,
                    "scenario": scen_ending,
                    "delta": ending_delta,
                    "improved": ending_delta > 0
                },
                "lowest_projected_balance": {
                    "baseline": base_lowest,
                    "scenario": scen_lowest,
                    "delta": lowest_delta,
                    "improved": lowest_delta > 0,
                    "baseline_trough_date": baseline.get('trough_date'),
                    "scenario_trough_date": scenario.get('trough_date')
                },
                "first_risk_date": {
                    "baseline": baseline.get('first_risk_date') or "No risk detected",
                    "scenario": scenario.get('first_risk_date') or "No risk detected",
                    "changed": baseline.get('first_risk_date') != scenario.get('first_risk_date')
                },
                "first_critical_date": {
                    "baseline": baseline.get('first_critical_date') or "None",
                    "scenario": scenario.get('first_critical_date') or "None",
                    "changed": baseline.get('first_critical_date') != scenario.get('first_critical_date')
                },
                "potential_shortfall": {
                    "baseline": base_shortfall,
                    "scenario": scen_shortfall,
                    "delta": shortfall_delta,
                    "improved": shortfall_delta < 0
                },
                "total_inflows": {
                    "baseline": base_inflows,
                    "scenario": scen_inflows,
                    "delta": inflows_delta,
                    "improved": inflows_delta > 0
                },
                "total_outflows": {
                    "baseline": base_outflows,
                    "scenario": scen_outflows,
                    "delta": outflows_delta,
                    "improved": outflows_delta < 0
                },
                "net_movement": {
                    "baseline": base_net,
                    "scenario": scen_net,
                    "delta": net_delta,
                    "improved": net_delta > 0
                },
                "overall_risk": {
                    "baseline": baseline_risk,
                    "scenario": scenario_risk,
                    "improved": (baseline_risk in ['Critical', 'High'] and scenario_risk in ['Moderate', 'Healthy'])
                }
            },
            "timeline": comparison_timeline,
            "disclaimer": "Hypothetical projection for management scenario planning. Does not alter real invoices, bills, or bank accounts."
        }

    @staticmethod
    def list_scenarios():
        """Retrieve all saved scenarios with adjustment counts."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id, s.name, s.description, s.created_at, s.updated_at,
                   COUNT(a.id) as adjustments_count
            FROM scenarios s
            LEFT JOIN scenario_adjustments a ON s.id = a.scenario_id
            GROUP BY s.id
            ORDER BY s.updated_at DESC;
        """)
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows

    @staticmethod
    def get_scenario(scenario_id):
        """Retrieve a saved scenario and all its adjustments."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scenarios WHERE id = ?;", (scenario_id,))
        scen = cursor.fetchone()
        if not scen:
            conn.close()
            return None

        result = dict(scen)
        cursor.execute("""
            SELECT id, adjustment_type, related_record_type, related_record_id,
                   original_date, original_amount, hypothetical_date, hypothetical_amount,
                   description, created_at
            FROM scenario_adjustments
            WHERE scenario_id = ?
            ORDER BY id ASC;
        """, (scenario_id,))
        result['adjustments'] = [dict(a) for a in cursor.fetchall()]
        conn.close()
        return result

    @staticmethod
    def create_scenario(name, description, adjustments):
        """Save a new scenario and its adjustments in a database transaction."""
        name_clean = str(name or '').strip()
        if not name_clean:
            raise ValueError("Scenario name cannot be empty.")

        validated_adjustments = ScenarioService.validate_adjustments(adjustments)

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO scenarios (name, description, created_at, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
            """, (name_clean, description or ''))
            scenario_id = cursor.lastrowid

            for adj in validated_adjustments:
                cursor.execute("""
                    INSERT INTO scenario_adjustments (
                        scenario_id, adjustment_type, related_record_type, related_record_id,
                        original_date, original_amount, hypothetical_date, hypothetical_amount,
                        description, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
                """, (
                    scenario_id,
                    adj['adjustment_type'],
                    adj.get('related_record_type'),
                    adj.get('related_record_id'),
                    adj.get('original_date'),
                    adj.get('original_amount'),
                    adj['hypothetical_date'],
                    adj['hypothetical_amount'],
                    adj.get('description', '')
                ))

            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

        return ScenarioService.get_scenario(scenario_id)

    @staticmethod
    def update_scenario(scenario_id, name, description, adjustments):
        """Update an existing scenario and replace its adjustments in a database transaction."""
        name_clean = str(name or '').strip()
        if not name_clean:
            raise ValueError("Scenario name cannot be empty.")

        validated_adjustments = ScenarioService.validate_adjustments(adjustments)

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT id FROM scenarios WHERE id = ?;", (scenario_id,))
            if not cursor.fetchone():
                return None

            cursor.execute("""
                UPDATE scenarios
                SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?;
            """, (name_clean, description or '', scenario_id))

            cursor.execute("DELETE FROM scenario_adjustments WHERE scenario_id = ?;", (scenario_id,))

            for adj in validated_adjustments:
                cursor.execute("""
                    INSERT INTO scenario_adjustments (
                        scenario_id, adjustment_type, related_record_type, related_record_id,
                        original_date, original_amount, hypothetical_date, hypothetical_amount,
                        description, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP);
                """, (
                    scenario_id,
                    adj['adjustment_type'],
                    adj.get('related_record_type'),
                    adj.get('related_record_id'),
                    adj.get('original_date'),
                    adj.get('original_amount'),
                    adj['hypothetical_date'],
                    adj['hypothetical_amount'],
                    adj.get('description', '')
                ))

            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

        return ScenarioService.get_scenario(scenario_id)

    @staticmethod
    def delete_scenario(scenario_id):
        """Delete a scenario and cascade-delete its adjustments."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM scenario_adjustments WHERE scenario_id = ?;", (scenario_id,))
        cursor.execute("DELETE FROM scenarios WHERE id = ?;", (scenario_id,))
        rows = cursor.rowcount
        conn.commit()
        conn.close()
        return rows > 0

    @staticmethod
    def duplicate_scenario(scenario_id):
        """Duplicate an existing scenario and all its adjustments."""
        orig = ScenarioService.get_scenario(scenario_id)
        if not orig:
            return None

        dup_name = f"{orig['name']} (Copy)"
        dup_desc = orig.get('description') or ''
        dup_adjs = orig.get('adjustments') or []

        return ScenarioService.create_scenario(dup_name, dup_desc, dup_adjs)
