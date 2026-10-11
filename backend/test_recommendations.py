import unittest
import sqlite3
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import datetime, timedelta
from backend.app import create_app
from backend.config import Config
from backend.database import get_db_connection, init_db
from backend.services.recommendation_service import RecommendationService

class TestRecommendations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_db = 'backend/test_recs_cashflow.db'
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

    def test_overdue_invoice_recommendation(self):
        """Test Rule A: Overdue customer invoice generates actionable recommendation."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        cursor.execute("""
            INSERT INTO receivables (invoice_number, customer_name, amount, due_date, status, days_overdue)
            VALUES ('INV-TEST-OD', 'Acme Corp', 42000.0, '2026-09-20', 'OVERDUE', 20);
        """)
        conn.commit()
        conn.close()

        recs = RecommendationService.evaluate_rules(days=30)
        od_recs = [r for r in recs if r['rule_key'].startswith('OVERDUE_INVOICE_')]
        self.assertGreaterEqual(len(od_recs), 1)
        r = od_recs[0]
        self.assertIn('Acme Corp', r['title'])
        self.assertIn('INV-TEST-OD', r['explanation'])
        self.assertEqual(r['estimated_impact'], 42000.0)
        self.assertEqual(r['relevant_date'], '2026-09-20')
        self.assertIn(r['priority'], ['Critical', 'High', 'Medium'])

    def test_timing_mismatch_recommendation(self):
        """Test Rule B: Supplier bill due before expected customer receipts generates timing mismatch."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        # Supplier bill due 2026-10-15
        cursor.execute("""
            INSERT INTO payables (bill_number, supplier_name, amount, due_date, status)
            VALUES ('BILL-GAP-01', 'Metalworks Ltd', 55000.0, '2026-10-15', 'PENDING');
        """)
        # Customer receipt arriving 2026-10-18 (3 days later)
        cursor.execute("""
            INSERT INTO receivables (invoice_number, customer_name, amount, due_date, expected_payment_date, status)
            VALUES ('INV-GAP-01', 'Buyer Inc', 70000.0, '2026-10-18', '2026-10-18', 'PENDING');
        """)
        conn.commit()
        conn.close()

        recs = RecommendationService.evaluate_rules(days=30)
        mismatch_recs = [r for r in recs if r['rule_key'].startswith('TIMING_MISMATCH_')]
        self.assertGreaterEqual(len(mismatch_recs), 1)
        m = mismatch_recs[0]
        self.assertIn('Metalworks Ltd', m['title'])
        self.assertIn('Buyer Inc', m['title'])
        self.assertEqual(m['estimated_impact'], 55000.0)
        self.assertEqual(m['relevant_date'], '2026-10-15')

    def test_clustered_outflows_recommendation(self):
        """Test Rule D: Multiple significant outflows on same date generates smoothing recommendation."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE payables SET status = 'PAID';")
        cursor.execute("""
            INSERT INTO payables (bill_number, supplier_name, amount, due_date, status)
            VALUES ('BILL-CLUST-1', 'Vendor A', 30000.0, '2026-10-22', 'PENDING');
        """)
        cursor.execute("""
            INSERT INTO payables (bill_number, supplier_name, amount, due_date, status)
            VALUES ('BILL-CLUST-2', 'Vendor B', 45000.0, '2026-10-22', 'PENDING');
        """)
        conn.commit()
        conn.close()

        recs = RecommendationService.evaluate_rules(days=30)
        clust_recs = [r for r in recs if r['rule_key'] == 'CLUSTERED_OUTFLOWS_2026-10-22']
        self.assertEqual(len(clust_recs), 1)
        c = clust_recs[0]
        self.assertIn('2026-10-22', c['title'])
        self.assertIn('Vendor A', c['explanation'])
        self.assertIn('Vendor B', c['explanation'])

    def test_healthy_forecast_recommendation(self):
        """Test Rule G: Healthy cash balance with no overdue receivables displays constructive guidance."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE forecast_settings SET opening_balance = 2000000.0, minimum_cash_buffer = 100000.0, start_date = '2026-10-10';")
        cursor.execute("UPDATE receivables SET status = 'PAID';")
        cursor.execute("UPDATE payables SET status = 'PAID';")
        conn.commit()
        conn.close()

        recs = RecommendationService.evaluate_rules(days=30)
        healthy_recs = [r for r in recs if r['rule_key'] == 'HEALTHY_POSITION']
        self.assertEqual(len(healthy_recs), 1)
        h = healthy_recs[0]
        self.assertEqual(h['priority'], 'Low')
        self.assertIsNone(h['estimated_impact'])

    def test_missing_settings_recommendation(self):
        """Test Rule F: Zero or missing opening balance generates data quality recommendation."""
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE forecast_settings SET opening_balance = 0.0, minimum_cash_buffer = 0.0;")
        conn.commit()
        conn.close()

        recs = RecommendationService.evaluate_rules(days=30)
        missing_recs = [r for r in recs if r['rule_key'] == 'MISSING_FINANCIAL_DATA']
        self.assertEqual(len(missing_recs), 1)
        self.assertEqual(missing_recs[0]['priority'], 'Medium')

    def test_lifecycle_reviewed_and_dismissed(self):
        """Test updating recommendation lifecycle states: Mark Reviewed and Dismiss."""
        # Sync initial recommendations
        recs = RecommendationService.get_recommendations()
        self.assertGreater(len(recs), 0)
        first_id = recs[0]['id']

        # 1. Mark Reviewed
        res = RecommendationService.update_status(first_id, 'Reviewed')
        self.assertTrue(res)
        rec = RecommendationService.get_recommendation_by_id(first_id)
        self.assertEqual(rec['status'], 'Reviewed')

        # 2. Dismiss
        res = RecommendationService.update_status(first_id, 'Dismissed')
        self.assertTrue(res)
        rec = RecommendationService.get_recommendation_by_id(first_id)
        self.assertEqual(rec['status'], 'Dismissed')

        # 3. Dismissed is excluded from active list by default
        active_recs = RecommendationService.get_recommendations(status='active')
        self.assertNotIn(first_id, [r['id'] for r in active_recs])

    def test_no_duplicates_on_repeated_refresh(self):
        """Verify repeated rule synchronization does not create duplicate recommendations."""
        evaluated = RecommendationService.evaluate_rules(days=30)
        RecommendationService.sync_recommendations_with_db(evaluated)
        count_first = len(RecommendationService.get_recommendations(status='all'))

        # Refresh again multiple times
        RecommendationService.sync_recommendations_with_db(evaluated)
        RecommendationService.sync_recommendations_with_db(evaluated)
        count_after = len(RecommendationService.get_recommendations(status='all'))

        self.assertEqual(count_first, count_after)

    def test_filtering_by_priority_and_status(self):
        """Test filtering endpoints by priority ('High') and status ('active')."""
        recs = RecommendationService.get_recommendations(status='active', priority='High')
        for r in recs:
            self.assertEqual(r['priority'].upper(), 'HIGH')
            self.assertIn(r['status'], ['New', 'Reviewed', 'ACTIVE'])

    def test_dashboard_integration(self):
        """Verify dashboard summary returns the top active recommendation."""
        app = create_app()
        client = app.test_client()
        res = client.get('/api/dashboard/summary')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()['data']

        self.assertIn('recommended_action', data)
        self.assertIn('recommendations_summary', data)
        if data['recommended_action']:
            top = data['recommended_action']
            self.assertIn('title', top)
            self.assertIn('priority', top)

    def test_rest_api_endpoints(self):
        """Test GET, PATCH status, and refresh REST endpoints."""
        app = create_app()
        client = app.test_client()

        # 1. GET /api/recommendations
        res = client.get('/api/recommendations')
        self.assertEqual(res.status_code, 200)
        recs = res.get_json()['data']
        self.assertGreater(len(recs), 0)
        first_id = recs[0]['id']

        # 2. GET /api/recommendations/summary
        res_sum = client.get('/api/recommendations/summary')
        self.assertEqual(res_sum.status_code, 200)
        self.assertIn('total_active_count', res_sum.get_json()['data'])

        # 3. GET /api/recommendations/<id>
        res_one = client.get(f'/api/recommendations/{first_id}')
        self.assertEqual(res_one.status_code, 200)

        # 4. PATCH /api/recommendations/<id>/status
        res_patch = client.patch(f'/api/recommendations/{first_id}/status', json={"status": "Reviewed"})
        self.assertEqual(res_patch.status_code, 200)

        # 5. POST /api/recommendations/refresh
        res_ref = client.post('/api/recommendations/refresh')
        self.assertEqual(res_ref.status_code, 200)

if __name__ == '__main__':
    unittest.main()
