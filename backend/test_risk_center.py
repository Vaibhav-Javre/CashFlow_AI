import unittest
import sqlite3
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import datetime, timedelta
from decimal import Decimal

from backend.app import create_app
from backend.config import Config
from backend.database import get_db_connection, init_db
from backend.services.forecast_service import ForecastService
from backend.services.risk_service import RiskService

class TestRiskCenter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_db = 'backend/test_risk_cashflow.db'
        cls.orig_db = Config.DATABASE_PATH
        Config.DATABASE_PATH = cls.test_db

    @classmethod
    def tearDownClass(cls):
        Config.DATABASE_PATH = cls.orig_db
        if os.path.exists(cls.test_db):
            os.remove(cls.test_db)

    def setUp(self):
        if os.path.exists(self.test_db):
            os.remove(self.test_db)
        init_db()

    def test_healthy_forecast(self):
        """Test healthy condition where projected balance remains comfortably above minimum buffer."""
        # Set large opening balance of 10,00,000 and small buffer of 50,000, mark overdue as paid
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE forecast_settings SET opening_balance = 1000000.0, minimum_cash_buffer = 50000.0, start_date = '2026-10-10';")
        cursor.execute("UPDATE business_profile SET current_balance = 1000000.0, target_reserve = 50000.0;")
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        cursor.execute("UPDATE risk_alerts SET status = 'RESOLVED';")
        conn.commit()
        conn.close()

        analysis = RiskService.get_risk_center_analysis(days=30)
        self.assertEqual(analysis['overall_risk'], 'Healthy')
        self.assertEqual(analysis['first_risk_date'], 'No risk detected')
        self.assertEqual(analysis['potential_shortfall'], 0.0)
        self.assertFalse(analysis['has_negative_balance'])
        self.assertEqual(analysis['risk_dates_count'], 0)
        self.assertEqual(analysis['distinct_risk_periods_count'], 0)

    def test_balance_below_minimum_buffer_high_risk(self):
        """Test balance falling below buffer but remaining >= 0 (Classification: High)."""
        conn = get_db_connection()
        cursor = conn.cursor()
        # Starting balance 80,000, buffer 100,000, bill 20,000 on day 2 -> lowest balance 60,000 (below buffer, positive)
        cursor.execute("UPDATE forecast_settings SET opening_balance = 80000.0, minimum_cash_buffer = 100000.0, start_date = '2026-10-10';")
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        cursor.execute("""
            INSERT INTO payables (bill_number, supplier_name, due_date, amount, status)
            VALUES ('BILL-HIGH-01', 'Test Vendor', '2026-10-12', 20000.0, 'PENDING');
        """)
        conn.commit()
        conn.close()

        analysis = RiskService.get_risk_center_analysis(days=30)
        self.assertEqual(analysis['overall_risk'], 'High')
        self.assertEqual(analysis['lowest_projected_balance'], 60000.0)
        # Potential Shortfall = max(0, 100000 - 60000) = 40000
        self.assertEqual(analysis['potential_shortfall'], 40000.0)
        self.assertEqual(analysis['buffer_deficit'], 40000.0)
        self.assertEqual(analysis['negative_balance_deficit'], 0.0)
        self.assertFalse(analysis['has_negative_balance'])
        self.assertEqual(analysis['first_risk_date'], '2026-10-10')

    def test_negative_projected_cash_balance_critical(self):
        """Test projected balance becoming negative (Classification: Critical)."""
        conn = get_db_connection()
        cursor = conn.cursor()
        # Starting balance 50,000, buffer 30,000, huge bill 80,000 on day 3 -> lowest balance -30,000
        cursor.execute("UPDATE forecast_settings SET opening_balance = 50000.0, minimum_cash_buffer = 30000.0, start_date = '2026-10-10';")
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        cursor.execute("""
            INSERT INTO payables (bill_number, supplier_name, due_date, amount, status)
            VALUES ('BILL-CRIT-01', 'Big Supplier', '2026-10-13', 80000.0, 'PENDING');
        """)
        conn.commit()
        conn.close()

        analysis = RiskService.get_risk_center_analysis(days=30)
        self.assertEqual(analysis['overall_risk'], 'Critical')
        self.assertTrue(analysis['has_negative_balance'])
        self.assertEqual(analysis['lowest_projected_balance'], -30000.0)
        # Potential Shortfall = max(0, 30000 - (-30000)) = 60000
        self.assertEqual(analysis['potential_shortfall'], 60000.0)
        # Negative Balance Deficit = max(0, -(-30000)) = 30000
        self.assertEqual(analysis['negative_balance_deficit'], 30000.0)
        self.assertIsNotNone(analysis['first_critical_date'])

    def test_classification_priority_critical_over_others(self):
        """Verify priority order: Critical > High > Moderate > Healthy."""
        conn = get_db_connection()
        cursor = conn.cursor()
        # Even with overdue invoices (moderate trigger) and below buffer (high trigger),
        # if balance is negative it MUST be Critical
        cursor.execute("UPDATE forecast_settings SET opening_balance = 10000.0, minimum_cash_buffer = 40000.0, start_date = '2026-10-10';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        cursor.execute("""
            INSERT INTO payables (bill_number, supplier_name, due_date, amount, status)
            VALUES ('BILL-PRIO-01', 'Heavy Bill', '2026-10-12', 150000.0, 'PENDING');
        """)
        conn.commit()
        conn.close()

        analysis = RiskService.get_risk_center_analysis(days=30)
        self.assertEqual(analysis['overall_risk'], 'Critical')

    def test_distinct_risk_periods_vs_risk_dates(self):
        """Verify repeated consecutive risk dates are grouped into distinct risk periods."""
        conn = get_db_connection()
        cursor = conn.cursor()
        # Starting balance 40,000, buffer 50,000.
        # Days 10 to 14 are below buffer.
        # Day 15 customer pays 50,000 -> balance becomes 90,000 (healthy).
        # Day 20 another bill of 50,000 -> balance dips to 40,000 until day 22.
        cursor.execute("UPDATE forecast_settings SET opening_balance = 40000.0, minimum_cash_buffer = 50000.0, start_date = '2026-10-10';")
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        cursor.execute("""
            INSERT INTO receivables (invoice_number, customer_name, due_date, expected_payment_date, amount, status)
            VALUES ('REC-RECOVERY', 'Client A', '2026-10-15', '2026-10-15', 50000.0, 'PENDING');
        """)
        cursor.execute("""
            INSERT INTO payables (bill_number, supplier_name, due_date, amount, status)
            VALUES ('PAY-DIP-2', 'Supplier B', '2026-10-20', 50000.0, 'PENDING');
        """)
        conn.commit()
        conn.close()

        analysis = RiskService.get_risk_center_analysis(days=25)
        # Dates 10-14 is Period 1 (5 days).
        # Dates 15-19 is Healthy.
        # Dates 20-25 is Period 2 (6 days).
        self.assertGreater(analysis['risk_dates_count'], 2)
        self.assertEqual(analysis['distinct_risk_periods_count'], 2)
        periods = analysis['distinct_risk_periods']
        self.assertEqual(len(periods), 2)
        self.assertEqual(periods[0]['start_date'], '2026-10-10')
        self.assertEqual(periods[0]['end_date'], '2026-10-14')
        self.assertEqual(periods[1]['start_date'], '2026-10-20')

    def test_timing_mismatch_detection(self):
        """Test cause detection when supplier bill is due before expected customer receipts."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE forecast_settings SET opening_balance = 80000.0, minimum_cash_buffer = 50000.0, start_date = '2026-10-10';")
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        # Supplier bill due 2026-10-15 for 60,000
        # Customer receipt arrives 2026-10-18 for 75,000 (3 days later)
        cursor.execute("""
            INSERT INTO payables (bill_number, supplier_name, due_date, amount, status)
            VALUES ('BILL-TIMING-1', 'Steel Co', '2026-10-15', 60000.0, 'PENDING');
        """)
        cursor.execute("""
            INSERT INTO receivables (invoice_number, customer_name, due_date, expected_payment_date, amount, status)
            VALUES ('INV-TIMING-1', 'Auto Parts Ltd', '2026-10-18', '2026-10-18', 75000.0, 'PENDING');
        """)
        conn.commit()
        conn.close()

        analysis = RiskService.get_risk_center_analysis(days=30)
        timing_causes = [c for c in analysis['causes'] if c['cause_type'] == 'TIMING_MISMATCH']
        self.assertGreaterEqual(len(timing_causes), 1)
        mismatch = timing_causes[0]
        self.assertEqual(mismatch['counterparty'], 'Steel Co')
        self.assertEqual(mismatch['paired_customer'], 'Auto Parts Ltd')
        self.assertIn('Steel Co', mismatch['short_explanation'])
        self.assertIn('Auto Parts Ltd', mismatch['short_explanation'])

    def test_overdue_invoice_cause_and_action(self):
        """Test that overdue customer invoices are identified as causes and priority actions."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE forecast_settings SET opening_balance = 200000.0, minimum_cash_buffer = 50000.0, start_date = '2026-10-10';")
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        cursor.execute("""
            INSERT INTO receivables (invoice_number, customer_name, due_date, expected_payment_date, amount, status, days_overdue)
            VALUES ('INV-OVERDUE-99', 'Late Payer Inc', '2026-09-15', '2026-10-25', 45000.0, 'OVERDUE', 25);
        """)
        conn.commit()
        conn.close()

        analysis = RiskService.get_risk_center_analysis(days=30)
        overdue_causes = [c for c in analysis['causes'] if c['cause_type'] == 'OVERDUE_INVOICE']
        self.assertGreaterEqual(len(overdue_causes), 1)
        self.assertEqual(overdue_causes[0]['related_record_number'], 'INV-OVERDUE-99')

        # Check priority action exists
        rec_actions = [a for a in analysis['priority_actions'] if a['target_number'] == 'INV-OVERDUE-99']
        self.assertGreaterEqual(len(rec_actions), 1)
        self.assertEqual(rec_actions[0]['urgency'], 'HIGH')

    def test_dashboard_and_risk_center_consistency(self):
        """Verify dashboard summary endpoint and risk center API return matching evaluations."""
        app = create_app()
        client = app.test_client()

        res_risk = client.get('/api/risk-center?days=30')
        self.assertEqual(res_risk.status_code, 200)
        risk_data = res_risk.get_json()['data']

        res_dash = client.get('/api/dashboard/summary')
        self.assertEqual(res_dash.status_code, 200)
        dash_data = res_dash.get_json()['data']

        self.assertEqual(risk_data['overall_risk'], dash_data['risk_analysis']['overall_risk'])
        self.assertEqual(risk_data['lowest_projected_balance'], dash_data['risk_analysis']['lowest_projected_balance'])
        self.assertEqual(risk_data['first_risk_date'], dash_data['risk_analysis']['first_risk_date'])

    def test_empty_database_handling(self):
        """Test graceful handling when tables have zero transactions or records."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM receivables;")
        cursor.execute("DELETE FROM payables;")
        cursor.execute("DELETE FROM transactions;")
        cursor.execute("DELETE FROM risk_alerts;")
        cursor.execute("UPDATE forecast_settings SET opening_balance = 100000.0, minimum_cash_buffer = 50000.0, start_date = '2026-10-10';")
        conn.commit()
        conn.close()

        analysis = RiskService.get_risk_center_analysis(days=30)
        self.assertIn(analysis['overall_risk'], ['Healthy', 'Moderate', 'High', 'Critical'])
        self.assertEqual(analysis['lowest_projected_balance'], 100000.0)
        self.assertEqual(analysis['potential_shortfall'], 0.0)
        self.assertEqual(analysis['first_risk_date'], 'No risk detected')

if __name__ == '__main__':
    unittest.main()
