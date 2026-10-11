import os
import sys
import unittest
import tempfile
from decimal import Decimal
from datetime import datetime, timedelta
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import Config
from backend.database import get_db_connection, init_db
from backend.app import create_app
from backend.services.forecast_service import ForecastService
from backend.services.risk_service import RiskService
from backend.services.scenario_service import ScenarioService

class TestDeterministicFinancialPipeline(unittest.TestCase):
    """
    Deterministic tests verifying financial calculation accuracy,
    risk detection, and non-mutation guarantees in an isolated SQLite database.
    """

    def setUp(self):
        # Create an isolated temporary database for each test
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        self.orig_db_path = Config.DATABASE_PATH
        Config.DATABASE_PATH = self.temp_db.name

        # Initialize schema and seed cleanly
        init_db()

        self.app = create_app()
        self.client = self.app.test_client()
        self.today = datetime.now()
        self.today_str = self.today.strftime('%Y-%m-%d')

    def tearDown(self):
        Config.DATABASE_PATH = self.orig_db_path
        if os.path.exists(self.temp_db.name):
            try:
                os.remove(self.temp_db.name)
            except Exception:
                pass

    def test_deterministic_benchmark_specification(self):
        """
        Deterministic Test Case per Specification:
        * Opening balance: ₹50,000
        * Minimum cash buffer: ₹20,000
        * Expected inflow on Day 3: ₹30,000
        * Expected outflow on Day 5: ₹40,000

        Expected result:
        * Projected closing balance after Day 3: ₹80,000
        * Projected closing balance after Day 5: ₹40,000
        * The balance never falls below the ₹20,000 minimum buffer.
        * No Critical or High risk should be triggered by these cash movements alone.
        """
        conn = get_db_connection()
        cursor = conn.cursor()

        # 1. Clear any seeded transactions, receivables, payables
        cursor.execute("DELETE FROM transactions;")
        cursor.execute("DELETE FROM receivables;")
        cursor.execute("DELETE FROM payables;")
        cursor.execute("DELETE FROM customer_payments;")
        cursor.execute("DELETE FROM supplier_payments;")

        # Set settings: Opening balance = 50,000, Buffer = 20,000
        cursor.execute("""
            UPDATE forecast_settings
            SET opening_balance = 50000.0, minimum_cash_buffer = 20000.0
            WHERE id = 1;
        """)

        day_3_str = (self.today + timedelta(days=3)).strftime('%Y-%m-%d')
        day_5_str = (self.today + timedelta(days=5)).strftime('%Y-%m-%d')

        # Day 3: Inflow of 30,000 via Receivable
        cursor.execute("""
            INSERT INTO receivables (
                invoice_number, customer_name, invoice_amount, amount, due_date,
                expected_payment_date, status, risk_level
            ) VALUES ('INV-DET-01', 'Deterministic Client', 30000.0, 30000.0, ?, ?, 'PENDING', 'LOW');
        """, (day_3_str, day_3_str))

        # Day 5: Outflow of 40,000 via Payable (due_date determines payment schedule)
        cursor.execute("""
            INSERT INTO payables (
                bill_number, vendor_name, bill_amount, amount, due_date,
                status, priority
            ) VALUES ('BILL-DET-01', 'Deterministic Vendor', 40000.0, 40000.0, ?, 'PENDING', 'MEDIUM');
        """, (day_5_str,))

        conn.commit()
        conn.close()

        # Run 7-day forecast
        forecast = ForecastService.generate_forecast(days=7)
        timeline = forecast['timeline']
        summary = forecast['summary']

        # Assert timeline has 7 days (index 0 = today, index 3 = Day 3, index 5 = Day 5)
        self.assertEqual(len(timeline), 7)

        # Day 0, Day 1, Day 2 balances should be 50,000
        self.assertEqual(timeline[0]['projected_balance'], 50000.0)
        self.assertEqual(timeline[1]['projected_balance'], 50000.0)
        self.assertEqual(timeline[2]['projected_balance'], 50000.0)

        # Day 3 (index 3) closing balance: 50,000 + 30,000 = 80,000
        self.assertEqual(timeline[3]['date'], day_3_str)
        self.assertEqual(timeline[3]['expected_inflows'], 30000.0)
        self.assertEqual(timeline[3]['expected_outflows'], 0.0)
        self.assertEqual(timeline[3]['projected_balance'], 80000.0)

        # Day 4 (index 4) balance should remain 80,000
        self.assertEqual(timeline[4]['projected_balance'], 80000.0)

        # Day 5 (index 5) closing balance: 80,000 - 40,000 = 40,000
        self.assertEqual(timeline[5]['date'], day_5_str)
        self.assertEqual(timeline[5]['expected_inflows'], 0.0)
        self.assertEqual(timeline[5]['expected_outflows'], 40000.0)
        self.assertEqual(timeline[5]['projected_balance'], 40000.0)

        # Day 6 (index 6) balance remains 40,000
        self.assertEqual(timeline[6]['projected_balance'], 40000.0)

        # Summary assertions
        self.assertEqual(forecast['starting_balance'], 50000.0)
        self.assertEqual(summary['opening_balance'], 50000.0)
        self.assertEqual(summary['projected_ending_cash'], 40000.0)
        self.assertEqual(summary['lowest_projected_balance'], 40000.0)
        self.assertEqual(summary['first_risk_date'], 'No risk detected')

        # Risk Engine Assessment: verify never below buffer (40,000 >= 20,000), no Critical or High risk
        risk_data = RiskService.get_risk_analysis(days=7)
        self.assertIn(risk_data['overall_risk'], ['Healthy', 'Moderate'])
        self.assertNotEqual(risk_data['overall_risk'], 'Critical')
        self.assertNotEqual(risk_data['overall_risk'], 'High')
        self.assertEqual(risk_data['potential_shortfall'], 0.0)
        self.assertEqual(risk_data['negative_balance_deficit'], 0.0)
        self.assertFalse(risk_data['has_negative_balance'])

    def test_buffer_shortfall_high_risk(self):
        """
        Verify that when balance falls below minimum cash buffer but remains positive,
        it classifies as HIGH risk with exact shortfall amount.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions;")
        cursor.execute("DELETE FROM receivables;")
        cursor.execute("DELETE FROM payables;")
        cursor.execute("DELETE FROM customer_payments;")
        cursor.execute("DELETE FROM supplier_payments;")

        # Opening balance = 50,000, Buffer = 20,000
        cursor.execute("""
            UPDATE forecast_settings
            SET opening_balance = 50000.0, minimum_cash_buffer = 20000.0
            WHERE id = 1;
        """)

        # Outflow on Day 2 of ₹35,000 -> Closing balance = ₹15,000
        # Buffer shortfall = ₹20,000 - ₹15,000 = ₹5,000
        day_2_str = (self.today + timedelta(days=2)).strftime('%Y-%m-%d')
        cursor.execute("""
            INSERT INTO payables (
                bill_number, vendor_name, bill_amount, amount, due_date,
                status, priority
            ) VALUES ('BILL-HIGH-01', 'Buffer Test Vendor', 35000.0, 35000.0, ?, 'PENDING', 'HIGH');
        """, (day_2_str,))
        conn.commit()
        conn.close()

        risk_data = RiskService.get_risk_analysis(days=7)

        self.assertEqual(risk_data['overall_risk'], 'High')
        self.assertEqual(risk_data['lowest_projected_balance'], 15000.0)
        self.assertEqual(risk_data['potential_shortfall'], 5000.0)
        self.assertEqual(risk_data['buffer_deficit'], 5000.0)
        self.assertEqual(risk_data['negative_balance_deficit'], 0.0)
        self.assertEqual(risk_data['first_risk_date'], day_2_str)

    def test_negative_balance_critical_risk(self):
        """
        Verify that when projected balance dips below 0,
        it classifies as CRITICAL risk with separate negative deficit and buffer shortfall.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions;")
        cursor.execute("DELETE FROM receivables;")
        cursor.execute("DELETE FROM payables;")
        cursor.execute("DELETE FROM customer_payments;")
        cursor.execute("DELETE FROM supplier_payments;")

        # Opening balance = 50,000, Buffer = 20,000
        cursor.execute("""
            UPDATE forecast_settings
            SET opening_balance = 50000.0, minimum_cash_buffer = 20000.0
            WHERE id = 1;
        """)

        # Outflow on Day 2 of ₹60,000 -> Closing balance = -₹10,000
        # Negative deficit = ₹10,000
        # Buffer shortfall = ₹20,000 - (-₹10,000) = ₹30,000
        day_2_str = (self.today + timedelta(days=2)).strftime('%Y-%m-%d')
        cursor.execute("""
            INSERT INTO payables (
                bill_number, vendor_name, bill_amount, amount, due_date,
                status, priority
            ) VALUES ('BILL-CRIT-01', 'Critical Outflow Vendor', 60000.0, 60000.0, ?, 'PENDING', 'HIGH');
        """, (day_2_str,))
        conn.commit()
        conn.close()

        risk_data = RiskService.get_risk_analysis(days=7)

        self.assertEqual(risk_data['overall_risk'], 'Critical')
        self.assertEqual(risk_data['lowest_projected_balance'], -10000.0)
        self.assertEqual(risk_data['negative_balance_deficit'], 10000.0)
        self.assertEqual(risk_data['potential_shortfall'], 30000.0)
        self.assertEqual(risk_data['buffer_deficit'], 30000.0)
        self.assertEqual(risk_data['first_risk_date'], day_2_str)

    def test_partial_payment_and_outstanding_balance_accuracy(self):
        """
        Verify partial payments update outstanding balance and forecast only includes outstanding.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions;")
        cursor.execute("DELETE FROM receivables;")
        cursor.execute("DELETE FROM payables;")
        cursor.execute("DELETE FROM customer_payments;")
        cursor.execute("DELETE FROM supplier_payments;")

        cursor.execute("""
            UPDATE forecast_settings
            SET opening_balance = 100000.0, minimum_cash_buffer = 25000.0
            WHERE id = 1;
        """)

        day_4_str = (self.today + timedelta(days=4)).strftime('%Y-%m-%d')
        cursor.execute("""
            INSERT INTO receivables (
                invoice_number, customer_name, invoice_amount, amount, due_date,
                expected_payment_date, status, risk_level
            ) VALUES ('INV-PART-01', 'Partial Test Customer', 50000.0, 50000.0, ?, ?, 'PARTIAL', 'LOW');
        """, (day_4_str, day_4_str))
        rec_id = cursor.lastrowid

        # Record partial payment of ₹30,000 received on Day 0
        cursor.execute("""
            INSERT INTO customer_payments (
                invoice_id, amount, payment_date, payment_method, reference_number, notes
            ) VALUES (?, 30000.0, ?, 'NEFT', 'NEFT-123', 'First tranche');
        """, (rec_id, self.today_str))

        conn.commit()
        conn.close()

        forecast = ForecastService.generate_forecast(days=7)
        timeline = forecast['timeline']

        # On Day 4 (index 4), projected inflow must be outstanding ₹20,000, NOT the original ₹50,000
        self.assertEqual(timeline[4]['date'], day_4_str)
        self.assertEqual(timeline[4]['expected_inflows'], 20000.0)
        self.assertEqual(timeline[4]['projected_balance'], 120000.0)

    def test_what_if_simulator_does_not_mutate_actual_records(self):
        """
        Verify that simulating or saving What-If scenarios does not alter base transactions,
        receivables, payables, or actual forecast settings.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions;")
        cursor.execute("DELETE FROM receivables;")
        cursor.execute("DELETE FROM payables;")
        cursor.execute("DELETE FROM customer_payments;")
        cursor.execute("DELETE FROM supplier_payments;")

        cursor.execute("""
            UPDATE forecast_settings
            SET opening_balance = 100000.0, minimum_cash_buffer = 20000.0
            WHERE id = 1;
        """)
        conn.commit()

        # Count base records before scenario
        cursor.execute("SELECT COUNT(*) as c FROM receivables;")
        rec_count_before = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(*) as c FROM payables;")
        pay_count_before = cursor.fetchone()['c']
        conn.close()

        # Run preview with hypothetical adjustments (+₹500,000 inflow, -₹300,000 outflow)
        preview_res = ScenarioService.preview_scenario(
            adjustments=[
                {
                    "adjustment_type": "new_income",
                    "hypothetical_amount": 500000.0,
                    "hypothetical_date": (self.today + timedelta(days=10)).strftime('%Y-%m-%d'),
                    "description": "Large Angel Investment"
                },
                {
                    "adjustment_type": "new_expense",
                    "hypothetical_amount": 300000.0,
                    "hypothetical_date": (self.today + timedelta(days=12)).strftime('%Y-%m-%d'),
                    "description": "Factory Machine Purchase"
                }
            ],
            days=30
        )
        self.assertIsNotNone(preview_res)
        self.assertIn('comparison', preview_res)
        self.assertEqual(preview_res['comparison']['projected_ending_cash']['delta'], 200000.0)

        # Save scenario to database
        save_res = ScenarioService.create_scenario(
            name="Saved What-If Scenario",
            description="Simulation for board",
            adjustments=[
                {
                    "adjustment_type": "new_income",
                    "hypothetical_amount": 75000.0,
                    "hypothetical_date": (self.today + timedelta(days=15)).strftime('%Y-%m-%d'),
                    "description": "Government Subsidy"
                }
            ]
        )
        self.assertIsNotNone(save_res)

        # Check that actual base database tables remain completely untouched
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as c FROM receivables;")
        rec_count_after = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(*) as c FROM payables;")
        pay_count_after = cursor.fetchone()['c']
        cursor.execute("SELECT opening_balance FROM forecast_settings WHERE id = 1;")
        ob = cursor.fetchone()['opening_balance']
        conn.close()

        self.assertEqual(rec_count_before, rec_count_after)
        self.assertEqual(pay_count_before, pay_count_after)
        self.assertEqual(ob, 100000.0)

if __name__ == '__main__':
    unittest.main()
