import sys
import unittest
import json
from decimal import Decimal
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app
from backend.database import get_db_connection

class TestForecastEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def setUp(self):
        self.today = datetime.now()
        self.today_str = self.today.strftime('%Y-%m-%d')

    def test_forecast_periods_7_30_60(self):
        """Test 7-day, 30-day, and 60-day forecast generation."""
        for days in [7, 30, 60]:
            res = self.client.get(f'/api/forecast?days={days}')
            self.assertEqual(res.status_code, 200)
            data = res.get_json()['data']
            self.assertEqual(len(data['timeline']), days)
            self.assertEqual(data['forecast_days'], days)
            self.assertIn('summary', data)
            self.assertIn('projected_ending_cash', data['summary'])
            self.assertIn('lowest_projected_balance', data['summary'])
            self.assertIn('first_risk_date', data['summary'])
            self.assertIn('forecast_net_movement', data['summary'])

    def test_settings_persistence(self):
        """Test opening-balance and minimum-cash-buffer settings persistence in DB."""
        new_ob = 350000.00
        new_buffer = 75000.00
        put_res = self.client.put('/api/forecast/settings', json={
            "opening_balance": new_ob,
            "minimum_cash_buffer": new_buffer
        })
        self.assertEqual(put_res.status_code, 200, put_res.get_data(as_text=True))
        self.assertEqual(put_res.get_json()['data']['opening_balance'], new_ob)
        self.assertEqual(put_res.get_json()['data']['minimum_cash_buffer'], new_buffer)

        # Retrieve settings via GET
        get_res = self.client.get('/api/forecast/settings')
        self.assertEqual(get_res.status_code, 200)
        retrieved = get_res.get_json()['data']
        self.assertEqual(retrieved['opening_balance'], new_ob)
        self.assertEqual(retrieved['minimum_cash_buffer'], new_buffer)

        # Check forecast reflects these settings
        fore_res = self.client.get('/api/forecast?days=7')
        self.assertEqual(fore_res.status_code, 200)
        f_data = fore_res.get_json()['data']
        self.assertEqual(f_data['starting_balance'], new_ob)
        self.assertEqual(f_data['minimum_cash_buffer'], new_buffer)

    def test_future_receivable_and_partial_payments(self):
        """
        Test:
        - Future customer invoice contributes to expected inflows on expected date.
        - Partially paid invoice only contributes outstanding balance.
        - Fully paid invoice is excluded from future inflows.
        """
        today = datetime.now()
        future_day_3 = (today + timedelta(days=3)).strftime('%Y-%m-%d')
        future_day_5 = (today + timedelta(days=5)).strftime('%Y-%m-%d')
        inv_num_partial = f"TEST-REC-P-{int(today.timestamp())}"
        inv_num_full = f"TEST-REC-F-{int(today.timestamp())}"

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            # Insert a future invoice of ₹50,000 due in 3 days
            cursor.execute("""
                INSERT INTO receivables (
                    invoice_number, customer_name, invoice_amount, amount, due_date,
                    expected_payment_date, status, risk_level
                ) VALUES (?, 'Test Client A', 50000.00, 50000.00, ?, ?, 'PENDING', 'LOW');
            """, (inv_num_partial, future_day_3, future_day_3))
            inv_id_partial = cursor.lastrowid

            # Insert partial payment of ₹20,000
            cursor.execute("""
                INSERT INTO customer_payments (
                    invoice_id, amount, payment_date, payment_method, reference_number, notes
                ) VALUES (?, 20000.00, ?, 'Bank Transfer', 'REF-PART-01', 'Partial deposit');
            """, (inv_id_partial, today.strftime('%Y-%m-%d')))

            # Insert fully paid invoice of ₹40,000
            cursor.execute("""
                INSERT INTO receivables (
                    invoice_number, customer_name, invoice_amount, amount, due_date,
                    expected_payment_date, status, risk_level
                ) VALUES (?, 'Test Client B', 40000.00, 40000.00, ?, ?, 'PAID', 'LOW');
            """, (inv_num_full, future_day_5, future_day_5))
            inv_id_full = cursor.lastrowid

            cursor.execute("""
                INSERT INTO customer_payments (
                    invoice_id, amount, payment_date, payment_method, reference_number, notes
                ) VALUES (?, 40000.00, ?, 'Bank Transfer', 'REF-FULL-01', 'Fully paid');
            """, (inv_id_full, today.strftime('%Y-%m-%d')))

            conn.commit()
        finally:
            conn.close()

        # Run 7-day forecast
        res = self.client.get('/api/forecast?days=7')
        self.assertEqual(res.status_code, 200)
        timeline = res.get_json()['data']['timeline']

        day_3_entry = next((item for item in timeline if item['date'] == future_day_3), None)
        day_5_entry = next((item for item in timeline if item['date'] == future_day_5), None)

        self.assertIsNotNone(day_3_entry)
        self.assertIsNotNone(day_5_entry)

        # Day 3 must include the outstanding ₹30,000 (₹50k - ₹20k), NOT ₹50,000
        inflow_item = next((it for it in day_3_entry['inflows_breakdown'] if it['reference'] == inv_num_partial), None)
        self.assertIsNotNone(inflow_item)
        self.assertEqual(inflow_item['amount'], 30000.00)

        # Day 5 must NOT include the fully paid invoice
        full_item = next((it for it in day_5_entry['inflows_breakdown'] if it['reference'] == inv_num_full), None)
        self.assertIsNone(full_item, "Fully paid invoice must be excluded from future inflows")

    def test_future_payable_and_partial_payments(self):
        """
        Test:
        - Future supplier bill contributes to expected outflows on due date.
        - Partially paid bill only contributes outstanding balance.
        - Fully paid bill is excluded from future outflows.
        """
        today = datetime.now()
        future_day_4 = (today + timedelta(days=4)).strftime('%Y-%m-%d')
        future_day_6 = (today + timedelta(days=6)).strftime('%Y-%m-%d')
        bill_num_partial = f"TEST-PAY-P-{int(today.timestamp())}"
        bill_num_full = f"TEST-PAY-F-{int(today.timestamp())}"

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO payables (
                    invoice_number, bill_number, supplier_name, vendor_name, bill_amount, amount, due_date, status, priority, category
                ) VALUES (?, ?, 'Test Vendor A', 'Test Vendor A', 15000.00, 15000.00, ?, 'PENDING', 'STANDARD', 'General');
            """, (bill_num_partial, bill_num_partial, future_day_4))
            bill_id_partial = cursor.lastrowid

            cursor.execute("""
                INSERT INTO supplier_payments (
                    bill_id, amount, payment_date, payment_method, reference_number, notes
                ) VALUES (?, 5000.00, ?, 'Bank Transfer', 'REF-PAY-01', 'Partial supplier payment');
            """, (bill_id_partial, today.strftime('%Y-%m-%d')))

            cursor.execute("""
                INSERT INTO payables (
                    invoice_number, bill_number, supplier_name, vendor_name, bill_amount, amount, due_date, status, priority, category
                ) VALUES (?, ?, 'Test Vendor B', 'Test Vendor B', 25000.00, 25000.00, ?, 'PAID', 'STANDARD', 'General');
            """, (bill_num_full, bill_num_full, future_day_6))
            bill_id_full = cursor.lastrowid

            cursor.execute("""
                INSERT INTO supplier_payments (
                    bill_id, amount, payment_date, payment_method, reference_number, notes
                ) VALUES (?, 25000.00, ?, 'Bank Transfer', 'REF-PAY-02', 'Fully paid bill');
            """, (bill_id_full, today.strftime('%Y-%m-%d')))

            conn.commit()
        finally:
            conn.close()

        res = self.client.get('/api/forecast?days=7')
        self.assertEqual(res.status_code, 200)
        timeline = res.get_json()['data']['timeline']

        day_4_entry = next((item for item in timeline if item['date'] == future_day_4), None)
        day_6_entry = next((item for item in timeline if item['date'] == future_day_6), None)

        self.assertIsNotNone(day_4_entry)
        self.assertIsNotNone(day_6_entry)

        # Day 4 must reflect ₹10,000 outstanding (₹15,000 - ₹5,000), not ₹15,000
        outflow_item = next((it for it in day_4_entry['outflows_breakdown'] if it['reference'] == bill_num_partial), None)
        self.assertIsNotNone(outflow_item)
        self.assertEqual(outflow_item['amount'], 10000.00)

        # Day 6 must NOT include the fully paid bill
        full_item = next((it for it in day_6_entry['outflows_breakdown'] if it['reference'] == bill_num_full), None)
        self.assertIsNone(full_item, "Fully paid bill must be excluded from future outflows")

    def test_historical_and_linked_transaction_deduplication(self):
        """
        Test:
        - Completed historical transactions on or before start date are NOT counted again.
        - Transactions linked to invoices or bills are not double counted.
        - Future unlinked direct transactions are correctly counted on their scheduled date.
        """
        today = datetime.now()
        hist_date = (today - timedelta(days=3)).strftime('%Y-%m-%d')
        future_day_2 = (today + timedelta(days=2)).strftime('%Y-%m-%d')

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            # Historical completed transaction: ₹80,000
            cursor.execute("""
                INSERT INTO transactions (
                    title, description, transaction_date, date, type, category, amount, payment_status, status
                ) VALUES ('Past Rent Payment', 'Past Rent Payment', ?, ?, 'OUTFLOW', 'Rent', 80000.00, 'Completed', 'COMPLETED');
            """, (hist_date, hist_date))

            # Linked payment transaction for a future date
            cursor.execute("""
                INSERT INTO transactions (
                    title, description, transaction_date, date, type, category, amount, payment_status, status, invoice_id
                ) VALUES ('Linked Payment Tx', 'Linked Payment Tx', ?, ?, 'INFLOW', 'Customer Payment', 99000.00, 'Completed', 'COMPLETED', 999);
            """, (future_day_2, future_day_2))

            # Direct unlinked scheduled expense for future day 2: ₹12,000
            cursor.execute("""
                INSERT INTO transactions (
                    title, description, transaction_date, date, type, category, amount, payment_status, status
                ) VALUES ('Scheduled Generator Fuel', 'Scheduled Generator Fuel', ?, ?, 'OUTFLOW', 'Utilities', 12000.00, 'Pending', 'PENDING');
            """, (future_day_2, future_day_2))
            fuel_tx_id = cursor.lastrowid

            conn.commit()
        finally:
            conn.close()

        res = self.client.get('/api/forecast?days=7')
        self.assertEqual(res.status_code, 200)
        timeline = res.get_json()['data']['timeline']

        # Historical transaction should never appear in future timeline
        for day in timeline:
            self.assertFalse(any('Past Rent Payment' in it.get('description', '') for it in day['outflows_breakdown']))
            self.assertFalse(any('Linked Payment Tx' in it.get('description', '') for it in day['inflows_breakdown']))

        # Direct fuel transaction must be present on future day 2
        day_2_entry = next((item for item in timeline if item['date'] == future_day_2), None)
        fuel_item = next((it for it in day_2_entry['outflows_breakdown'] if it['reference'] == f"TX-{fuel_tx_id}"), None)
        self.assertIsNotNone(fuel_item)
        self.assertEqual(fuel_item['amount'], 12000.00)

    def test_risk_classification_buffer_and_negative(self):
        """
        Test:
        - Critical risk when projected balance becomes negative (< 0).
        - High Risk when projected balance is nonnegative but below minimum buffer (0 <= balance < buffer).
        - Healthy when projected balance is >= buffer.
        """
        self.client.put('/api/forecast/settings', json={
            "opening_balance": 50000.00,
            "minimum_cash_buffer": 100000.00
        })

        today = datetime.now()
        tomorrow = (today + timedelta(days=1)).strftime('%Y-%m-%d')
        bill_num = f"MASSIVE-OUTFLOW-{int(today.timestamp())}"

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO payables (
                    invoice_number, bill_number, supplier_name, vendor_name, bill_amount, amount, due_date, status, category
                ) VALUES (?, ?, 'Critical Supplier', 'Critical Supplier', 80000.00, 80000.00, ?, 'PENDING', 'General');
            """, (bill_num, bill_num, tomorrow))
            conn.commit()
        finally:
            conn.close()

        res = self.client.get('/api/forecast?days=7')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()['data']
        timeline = data['timeline']

        # Day 0 closing balance is below ₹100,000 buffer
        self.assertIn(timeline[0]['risk_status'], ['High Risk', 'Critical'])
        self.assertTrue(timeline[0]['is_below_buffer'])

        # Day 1 closing balance is negative (< 0) -> Critical (< 0)
        day_1 = timeline[1]
        self.assertEqual(day_1['risk_status'], 'Critical')
        self.assertEqual(day_1['risk_code'], 'CRITICAL')
        self.assertTrue(day_1['is_negative'])
        self.assertTrue(day_1['is_below_buffer'])
        self.assertLess(day_1['closing_balance'], 0.0)

        # Check summary metrics
        self.assertIsNotNone(data['first_critical_date'])
        self.assertLess(data['lowest_projected_balance'], 0.0)
        self.assertTrue(data['is_shortfall_predicted'])

if __name__ == '__main__':
    unittest.main()
