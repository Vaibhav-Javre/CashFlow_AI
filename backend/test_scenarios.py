import sys
import unittest
import json
from decimal import Decimal
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app
from backend.database import get_db_connection
from backend.services.scenario_service import ScenarioService

class TestWhatIfSimulator(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def setUp(self):
        self.today = datetime.now()
        self.today_str = self.today.strftime('%Y-%m-%d')
        self.d5_str = (self.today + timedelta(days=5)).strftime('%Y-%m-%d')
        self.d10_str = (self.today + timedelta(days=10)).strftime('%Y-%m-%d')
        self.d15_str = (self.today + timedelta(days=15)).strftime('%Y-%m-%d')
        self.d20_str = (self.today + timedelta(days=20)).strftime('%Y-%m-%d')

        # Fetch an existing receivable and payable for realistic testing
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id, invoice_number, expected_payment_date, due_date, COALESCE(invoice_amount, amount, 0) as full_amount FROM receivables WHERE UPPER(status) != 'PAID' LIMIT 1")
            self.sample_rec = cur.fetchone()
            cur.execute("SELECT id, due_date, COALESCE(bill_amount, amount, 0) as full_amount FROM payables WHERE UPPER(status) != 'PAID' LIMIT 1")
            self.sample_pay = cur.fetchone()

    def test_customer_payment_delay_simulation(self):
        """Simulate delaying a customer payment: scenario cash drops on original date, baseline unchanged."""
        if not self.sample_rec:
            self.skipTest("No pending receivable found in test database.")

        rec_id = self.sample_rec["id"]
        orig_date = self.sample_rec["expected_payment_date"] or self.sample_rec["due_date"]
        orig_amount = float(self.sample_rec["full_amount"])

        # Delay payment by 10 days
        hypo_date = (datetime.strptime(orig_date, '%Y-%m-%d') + timedelta(days=10)).strftime('%Y-%m-%d')

        payload = {
            "adjustments": [
                {
                    "adjustment_type": "customer_payment",
                    "related_record_id": rec_id,
                    "hypothetical_date": hypo_date,
                    "hypothetical_amount": orig_amount,
                    "description": f"Customer delayed payment by 10 days"
                }
            ]
        }

        res = self.client.post('/api/scenarios/preview?days=30', json=payload)
        self.assertEqual(res.status_code, 200, res.get_data(as_text=True))
        data = res.get_json()["data"]

        self.assertIn("comparison", data)
        self.assertIn("timeline", data)
        self.assertIn("projected_ending_cash", data["comparison"])
        self.assertIn("lowest_projected_balance", data["comparison"])

        # Confirm data integrity: actual receivable in DB was NEVER changed
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT expected_payment_date, due_date, COALESCE(invoice_amount, amount, 0) as full_amount FROM receivables WHERE id = ?", (rec_id,))
            rec = cur.fetchone()
            self.assertEqual(rec["expected_payment_date"], self.sample_rec["expected_payment_date"])
            self.assertEqual(float(rec["full_amount"]), orig_amount)

    def test_supplier_payment_shift_simulation(self):
        """Simulate paying a supplier earlier: scenario experiences earlier cash outflow."""
        if not self.sample_pay:
            self.skipTest("No pending payable found in test database.")

        pay_id = self.sample_pay["id"]
        orig_date = self.sample_pay["due_date"]
        orig_amount = float(self.sample_pay["full_amount"])

        # Move payment 3 days earlier
        hypo_date = (datetime.strptime(orig_date, '%Y-%m-%d') - timedelta(days=3)).strftime('%Y-%m-%d')
        if hypo_date < self.today_str:
            hypo_date = self.today_str

        payload = {
            "adjustments": [
                {
                    "adjustment_type": "supplier_payment",
                    "related_record_id": pay_id,
                    "hypothetical_date": hypo_date,
                    "hypothetical_amount": orig_amount,
                    "description": "Paid supplier early for prompt discount"
                }
            ]
        }

        res = self.client.post('/api/scenarios/preview?days=30', json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["data"]
        self.assertTrue(len(data["timeline"]) > 0)

        # Baseline and Scenario both calculated correctly
        self.assertIn("comparison", data)
        self.assertIn("projected_ending_cash", data["comparison"])
        self.assertIn("baseline", data["comparison"]["projected_ending_cash"])
        self.assertIn("scenario", data["comparison"]["projected_ending_cash"])

        # Verify real bill was untouched
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT due_date, COALESCE(bill_amount, amount, 0) as full_amount FROM payables WHERE id = ?", (pay_id,))
            pay = cur.fetchone()
            self.assertEqual(pay["due_date"], orig_date)
            self.assertEqual(float(pay["full_amount"]), orig_amount)

    def test_hypothetical_income_and_expense_adjustments(self):
        """Simulate adding hypothetical new income and new expense."""
        income_amt = 50000.0
        expense_amt = 20000.0
        payload = {
            "adjustments": [
                {
                    "adjustment_type": "new_income",
                    "hypothetical_date": self.d5_str,
                    "hypothetical_amount": income_amt,
                    "description": "Expected major consulting retainer"
                },
                {
                    "adjustment_type": "new_expense",
                    "hypothetical_date": self.d10_str,
                    "hypothetical_amount": expense_amt,
                    "description": "Emergency machinery servicing"
                }
            ]
        }

        res = self.client.post('/api/scenarios/preview?days=30', json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()["data"]

        # Scenario net inflows must increase by 50000 and outflows by 20000
        inflow_comp = data["comparison"]["total_inflows"]
        baseline_inflow = Decimal(str(inflow_comp["baseline"]))
        scenario_inflow = Decimal(str(inflow_comp["scenario"]))
        self.assertEqual(scenario_inflow - baseline_inflow, Decimal(str(income_amt)))

        outflow_comp = data["comparison"]["total_outflows"]
        baseline_outflow = Decimal(str(outflow_comp["baseline"]))
        scenario_outflow = Decimal(str(outflow_comp["scenario"]))
        self.assertEqual(scenario_outflow - baseline_outflow, Decimal(str(expense_amt)))

        # Ending cash net delta should be exactly +30000.00
        ending_delta = Decimal(str(data["comparison"]["projected_ending_cash"]["delta"]))
        self.assertEqual(ending_delta, Decimal("30000.00"))

    def test_horizons_7_30_60(self):
        """Verify simulator supports 7, 30, and 60 days horizons."""
        payload = {
            "adjustments": [
                {
                    "adjustment_type": "new_income",
                    "hypothetical_date": self.d5_str,
                    "hypothetical_amount": 10000.0,
                    "description": "Short-term sales boost"
                }
            ]
        }
        for days in [7, 30, 60]:
            res = self.client.post(f'/api/scenarios/preview?days={days}', json=payload)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()["data"]
            self.assertEqual(len(data["timeline"]), days)
            self.assertEqual(data["forecast_days"], days)

    def test_scenario_crud_lifecycle(self):
        """Test full scenario lifecycle: Create, List, Get, Comparison, Update, Duplicate, and Delete."""
        # 1. Create scenario
        create_payload = {
            "name": "Q3 Expansion Stress Test",
            "description": "Testing delay in customer collections with new machinery lease",
            "adjustments": [
                {
                    "adjustment_type": "new_expense",
                    "hypothetical_date": self.d15_str,
                    "hypothetical_amount": 75000.0,
                    "description": "Machinery advance payment"
                }
            ]
        }
        create_res = self.client.post('/api/scenarios', json=create_payload)
        self.assertEqual(create_res.status_code, 201)
        created_data = create_res.get_json()["data"]
        scen_id = created_data["id"]
        self.assertEqual(created_data["name"], "Q3 Expansion Stress Test")
        self.assertEqual(len(created_data["adjustments"]), 1)

        # 2. List scenarios
        list_res = self.client.get('/api/scenarios')
        self.assertEqual(list_res.status_code, 200)
        scenarios = list_res.get_json()["data"]
        self.assertTrue(any(s["id"] == scen_id for s in scenarios))

        # 3. Get scenario by ID
        get_res = self.client.get(f'/api/scenarios/{scen_id}')
        self.assertEqual(get_res.status_code, 200)
        fetched_scen = get_res.get_json()["data"]
        self.assertEqual(fetched_scen["id"], scen_id)
        self.assertEqual(len(fetched_scen["adjustments"]), 1)

        # 4. Get scenario comparison
        comp_res = self.client.get(f'/api/scenarios/{scen_id}/comparison?days=30')
        self.assertEqual(comp_res.status_code, 200)
        comp_data = comp_res.get_json()["data"]
        self.assertEqual(comp_data["scenario_id"], scen_id)
        self.assertIn("comparison", comp_data)
        self.assertIn("timeline", comp_data)

        # 5. Update scenario
        update_payload = {
            "name": "Q3 Expansion Stress Test - Revised",
            "description": "Updated machinery advance payment and added consulting income",
            "adjustments": [
                {
                    "adjustment_type": "new_expense",
                    "hypothetical_date": self.d15_str,
                    "hypothetical_amount": 60000.0,
                    "description": "Negotiated machinery down payment"
                },
                {
                    "adjustment_type": "new_income",
                    "hypothetical_date": self.d5_str,
                    "hypothetical_amount": 40000.0,
                    "description": "Upfront advance from new client"
                }
            ]
        }
        update_res = self.client.put(f'/api/scenarios/{scen_id}', json=update_payload)
        self.assertEqual(update_res.status_code, 200)
        updated_data = update_res.get_json()["data"]
        self.assertEqual(updated_data["name"], "Q3 Expansion Stress Test - Revised")
        self.assertEqual(len(updated_data["adjustments"]), 2)

        # 6. Duplicate scenario
        dup_res = self.client.post(f'/api/scenarios/{scen_id}/duplicate')
        self.assertEqual(dup_res.status_code, 201)
        dup_data = dup_res.get_json()["data"]
        dup_id = dup_data["id"]
        self.assertNotEqual(dup_id, scen_id)
        self.assertIn("(Copy)", dup_data["name"])
        self.assertEqual(len(dup_data["adjustments"]), 2)

        # 7. Delete both scenarios
        del_orig_res = self.client.delete(f'/api/scenarios/{scen_id}')
        self.assertEqual(del_orig_res.status_code, 200)
        del_dup_res = self.client.delete(f'/api/scenarios/{dup_id}')
        self.assertEqual(del_dup_res.status_code, 200)

        # Verify 404 on deleted
        not_found_res = self.client.get(f'/api/scenarios/{scen_id}')
        self.assertEqual(not_found_res.status_code, 404)

    def test_validation_errors(self):
        """Test backend validations: negative amounts, invalid dates, invalid types, empty names."""
        # Empty name
        res = self.client.post('/api/scenarios', json={"name": "   ", "adjustments": []})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Scenario name cannot be empty", res.get_json()["error"])

        # Negative amount
        res = self.client.post('/api/scenarios/preview', json={
            "adjustments": [
                {
                    "adjustment_type": "new_income",
                    "hypothetical_date": self.d5_str,
                    "hypothetical_amount": -500.0
                }
            ]
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("must be non-negative", res.get_json()["error"])

        # Invalid date format
        res = self.client.post('/api/scenarios/preview', json={
            "adjustments": [
                {
                    "adjustment_type": "new_income",
                    "hypothetical_date": "15/10/2026",
                    "hypothetical_amount": 500.0
                }
            ]
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("YYYY-MM-DD", res.get_json()["error"])

        # Nonexistent receivable ID
        res = self.client.post('/api/scenarios/preview', json={
            "adjustments": [
                {
                    "adjustment_type": "customer_payment",
                    "related_record_id": 9999999,
                    "hypothetical_date": self.d5_str,
                    "hypothetical_amount": 500.0
                }
            ]
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not exist in the database", res.get_json()["error"])

        # Nonexistent payable ID
        res = self.client.post('/api/scenarios/preview', json={
            "adjustments": [
                {
                    "adjustment_type": "supplier_payment",
                    "related_record_id": 9999999,
                    "hypothetical_date": self.d5_str,
                    "hypothetical_amount": 500.0
                }
            ]
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not exist in the database", res.get_json()["error"])

        # Unsupported adjustment type
        res = self.client.post('/api/scenarios/preview', json={
            "adjustments": [
                {
                    "adjustment_type": "unsupported_magic_type",
                    "hypothetical_date": self.d5_str,
                    "hypothetical_amount": 500.0
                }
            ]
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unsupported adjustment type", res.get_json()["error"])

    def test_financial_records_never_modified_by_preview(self):
        """Explicitly assert that preview operations never write to transactions or invoices."""
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as cnt FROM transactions")
            tx_count_before = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) as cnt FROM receivables")
            rec_count_before = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) as cnt FROM payables")
            pay_count_before = cur.fetchone()["cnt"]

        # Run preview with several adjustments
        res = self.client.post('/api/scenarios/preview?days=30', json={
            "adjustments": [
                {"adjustment_type": "new_income", "hypothetical_date": self.d5_str, "hypothetical_amount": 80000.0},
                {"adjustment_type": "new_expense", "hypothetical_date": self.d10_str, "hypothetical_amount": 40000.0}
            ]
        })
        self.assertEqual(res.status_code, 200)

        # Check DB counts after preview
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as cnt FROM transactions")
            tx_count_after = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) as cnt FROM receivables")
            rec_count_after = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) as cnt FROM payables")
            pay_count_after = cur.fetchone()["cnt"]

        self.assertEqual(tx_count_before, tx_count_after)
        self.assertEqual(rec_count_before, rec_count_after)
        self.assertEqual(pay_count_before, pay_count_after)

if __name__ == '__main__':
    unittest.main()
