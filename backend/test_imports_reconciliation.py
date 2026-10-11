import sys
import unittest
import io
import json
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app
from backend.database import get_db_connection

class TestImportsAndReconciliation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def setUp(self):
        self.today = datetime.now()
        self.today_str = self.today.strftime('%Y-%m-%d')
        self.d5_str = (self.today + timedelta(days=5)).strftime('%Y-%m-%d')

    def test_csv_bank_statement_preview_and_confirm(self):
        """Test importing a CSV bank statement: preview, column mapping, and confirmation into transactions."""
        import uuid
        uid = uuid.uuid4().hex[:6].upper()
        ref_unique = f"UTR-{uid}"
        csv_content = f"""Date,Narration,Withdrawal,Deposit,Ref No
2026-10-15,Client Wire Transfer - Delta Corp,0,55000.00,{ref_unique}
2026-10-16,Factory Nitrogen Refill,4500.00,0,ACH-441-{uid}
2026-10-17,Direct Vendor Payout,12000.00,0,ACH-889-{uid}
"""
        data = {
            'file': (io.BytesIO(csv_content.encode('utf-8')), f'test_statement_{uid}.csv'),
            'import_type': 'bank_statement'
        }

        # 1. Preview
        prev_res = self.client.post('/api/imports/preview', data=data, content_type='multipart/form-data')
        self.assertEqual(prev_res.status_code, 200, prev_res.get_data(as_text=True))
        prev_data = prev_res.get_json()['data']
        self.assertEqual(prev_data['total_rows'], 3)
        self.assertEqual(prev_data['valid_count'], 3)
        token = prev_data['token']

        # 2. Confirm
        confirm_payload = {
            'token': token,
            'filename': f'test_statement_{uid}.csv',
            'import_type': 'bank_statement',
            'column_mapping': prev_data['effective_mapping'],
            'skip_duplicates': True
        }
        conf_res = self.client.post('/api/imports/confirm', json=confirm_payload)
        self.assertEqual(conf_res.status_code, 200, conf_res.get_data(as_text=True))
        conf_data = conf_res.get_json()['data']
        self.assertEqual(conf_data['imported_rows'], 3)

        # 3. Verify in database
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM transactions WHERE reference_number = ?;", (ref_unique,))
            tx = cur.fetchone()
            self.assertIsNotNone(tx)
            self.assertEqual(float(tx['amount']), 55000.00)
            self.assertEqual(tx['type'], 'INFLOW')

    def test_excel_statement_import(self):
        """Test importing an Excel statement (.xlsx) with custom column headers."""
        df = pd.DataFrame([
            {"Txn Date": "2026-10-18", "Particulars": "Solar Power Consulting", "Credit Amt": "28000.00", "Debit Amt": "0", "UTR": "SOLAR-99"},
            {"Txn Date": "2026-10-19", "Particulars": "Office Lease Maintenance", "Credit Amt": "0", "Debit Amt": "6500.00", "UTR": "LEASE-11"}
        ])
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False)
        excel_buffer.seek(0)

        data = {
            'file': (excel_buffer, 'bank_export.xlsx'),
            'import_type': 'bank_statement'
        }
        prev_res = self.client.post('/api/imports/preview', data=data, content_type='multipart/form-data')
        self.assertEqual(prev_res.status_code, 200, prev_res.get_data(as_text=True))
        prev_data = prev_res.get_json()['data']
        self.assertEqual(prev_data['total_rows'], 2)

        # Confirm
        conf_res = self.client.post('/api/imports/confirm', json={
            'token': prev_data['token'],
            'filename': 'bank_export.xlsx',
            'import_type': 'bank_statement',
            'column_mapping': prev_data['effective_mapping']
        })
        self.assertEqual(conf_res.status_code, 200)

    def test_row_level_validation_and_error_reporting(self):
        """Test that invalid rows (e.g. malformed dates, zero amounts) are tracked and downloadable."""
        csv_content = """Date,Description,Amount
invalid-date,Corrupted Transaction,5000.00
2026-10-20,Zero Amount Record,0
2026-10-21,Valid Salary Advance,8500.00
"""
        data = {
            'file': (io.BytesIO(csv_content.encode('utf-8')), 'faulty_data.csv'),
            'import_type': 'bank_statement'
        }
        prev_res = self.client.post('/api/imports/preview', data=data, content_type='multipart/form-data')
        self.assertEqual(prev_res.status_code, 200)
        prev_data = prev_res.get_json()['data']
        self.assertEqual(prev_data['valid_count'], 1)
        self.assertEqual(prev_data['invalid_count'], 2)

        # Confirm
        conf_res = self.client.post('/api/imports/confirm', json={
            'token': prev_data['token'],
            'filename': 'faulty_data.csv',
            'import_type': 'bank_statement',
            'column_mapping': {'date': 'Date', 'description': 'Description', 'amount': 'Amount'}
        })
        self.assertEqual(conf_res.status_code, 200)
        batch_id = conf_res.get_json()['data']['batch_id']

        # Download error CSV
        err_res = self.client.get(f'/api/imports/{batch_id}/errors/download')
        self.assertEqual(err_res.status_code, 200)
        self.assertIn('text/csv', err_res.content_type)
        self.assertIn('Row Number', err_res.get_data(as_text=True))

    def test_duplicate_detection(self):
        """Test that importing the exact same statement line twice detects duplicates."""
        csv_content = """Date,Description,Amount,Ref
2026-10-22,Unique Software License Payment,14500.00,DUP-REF-101
"""
        data = {
            'file': (io.BytesIO(csv_content.encode('utf-8')), 'dup_test.csv'),
            'import_type': 'bank_statement'
        }
        # First import
        res1 = self.client.post('/api/imports/preview', data=data, content_type='multipart/form-data')
        token1 = res1.get_json()['data']['token']
        self.client.post('/api/imports/confirm', json={
            'token': token1,
            'filename': 'dup_test.csv',
            'import_type': 'bank_statement',
            'column_mapping': {'date': 'Date', 'description': 'Description', 'amount': 'Amount', 'reference': 'Ref'}
        })

        # Second import of same file
        data2 = {
            'file': (io.BytesIO(csv_content.encode('utf-8')), 'dup_test.csv'),
            'import_type': 'bank_statement'
        }
        res2 = self.client.post('/api/imports/preview', data=data2, content_type='multipart/form-data')
        self.assertEqual(res2.status_code, 200)
        prev_data2 = res2.get_json()['data']
        self.assertEqual(prev_data2['duplicate_count'], 1)

    def test_document_upload_ocr_and_confirmation(self):
        """Test document upload, text parsing, field editing, and confirming as a receivable."""
        # Create a simple PDF in memory using pypdf
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=200, height=200)
        pdf_stream = io.BytesIO()
        writer.write(pdf_stream)
        pdf_stream.seek(0)

        data = {
            'file': (pdf_stream, 'sample_invoice.pdf'),
            'document_name': 'Quantum Robotics PO Invoice'
        }
        up_res = self.client.post('/api/documents/upload', data=data, content_type='multipart/form-data')
        self.assertEqual(up_res.status_code, 201)
        doc = up_res.get_json()['data']
        doc_id = doc['id']

        # Edit extracted fields
        edit_res = self.client.put(f'/api/documents/{doc_id}/extracted-data', json={
            'invoice_number': f"INV-OCR-{doc_id}",
            'counterparty_name': 'Quantum Robotics Corp',
            'document_date': self.today_str,
            'due_date': self.d5_str,
            'total_amount': 42000.00
        })
        self.assertEqual(edit_res.status_code, 200)

        # Confirm document to create a real receivable
        conf_res = self.client.post(f'/api/documents/{doc_id}/confirm', json={
            'action_target': 'create_receivable'
        })
        self.assertEqual(conf_res.status_code, 200)
        confirmed_doc = conf_res.get_json()['data']
        self.assertEqual(confirmed_doc['review_status'], 'CONFIRMED')
        self.assertEqual(confirmed_doc['created_record_type'], 'receivable')

        # Verify created receivable in database
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM receivables WHERE invoice_number = ?;", (f"INV-OCR-{doc_id}",))
            rec = cur.fetchone()
            self.assertIsNotNone(rec)
            self.assertEqual(float(rec['amount']), 42000.00)

    def test_unsupported_document_type(self):
        """Test that unsupported executable files are rejected safely."""
        data = {
            'file': (io.BytesIO(b"binary executable"), 'malicious.exe'),
            'document_name': 'Bad File'
        }
        res = self.client.post('/api/documents/upload', data=data, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unsupported file format", res.get_json()['error'])

    def test_payment_reconciliation_workflow(self):
        """Test reconciliation: suggested match based on amount and counterparty, confirmation, and safe undo."""
        # 1. Create a distinct open invoice
        unique_inv_num = f"INV-RECON-{datetime.now().strftime('%H%M%S')}"
        inv_amt = 37500.00
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO receivables (
                    invoice_number, customer_name, due_date, invoice_amount, amount, status
                ) VALUES (?, 'Starlight Technologies', ?, ?, ?, 'PENDING');
            """, (unique_inv_num, self.d5_str, inv_amt, inv_amt))
            rec_id = cur.lastrowid

            # 2. Create an unmatched bank transaction corresponding to this payment
            cur.execute("""
                INSERT INTO transactions (
                    title, date, transaction_date, type, category, description,
                    amount, status, payment_status, counterparty, reference_number, reconciliation_status
                ) VALUES (?, ?, ?, 'INFLOW', 'Customer Deposit', ?, ?, 'COMPLETED', 'Completed', 'Starlight Tech', ?, 'UNMATCHED');
            """, (
                f"Direct Wire - {unique_inv_num}",
                self.today_str,
                self.today_str,
                f"Wire payment for {unique_inv_num} Starlight Technologies",
                inv_amt,
                f"UTR-{unique_inv_num}"
            ))
            tx_id = cur.lastrowid
            conn.commit()

        # 3. Check reconciliation dashboard: transaction should have a high-confidence suggestion
        recon_res = self.client.get('/api/reconciliation')
        self.assertEqual(recon_res.status_code, 200)
        recon_data = recon_res.get_json()['data']

        matched_tx = next((t for t in recon_data['transactions'] if t['id'] == tx_id), None)
        self.assertIsNotNone(matched_tx)
        self.assertIsNotNone(matched_tx.get('suggestion'))
        self.assertEqual(matched_tx['suggestion']['matched_record_id'], rec_id)
        self.assertGreaterEqual(matched_tx['suggestion']['confidence_score'], 70)

        # 4. Confirm match
        confirm_res = self.client.post('/api/reconciliation/confirm', json={
            'transaction_id': tx_id,
            'matched_type': 'receivable',
            'matched_record_id': rec_id
        })
        self.assertEqual(confirm_res.status_code, 200)

        # 5. Verify receivable is now PAID and transaction is MATCHED
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT status FROM receivables WHERE id = ?;", (rec_id,))
            rec = cur.fetchone()
            self.assertEqual(rec['status'], 'PAID')

            cur.execute("SELECT reconciliation_status, invoice_id FROM transactions WHERE id = ?;", (tx_id,))
            tx = cur.fetchone()
            self.assertEqual(tx['reconciliation_status'], 'MATCHED')
            self.assertEqual(tx['invoice_id'], rec_id)

        # 6. Prevent double reconciliation
        dup_conf_res = self.client.post('/api/reconciliation/confirm', json={
            'transaction_id': tx_id,
            'matched_type': 'receivable',
            'matched_record_id': rec_id
        })
        self.assertEqual(dup_conf_res.status_code, 400)
        self.assertIn("already reconciled", dup_conf_res.get_json()['error'])

        # 7. Undo reconciliation
        undo_res = self.client.post(f'/api/reconciliation/{tx_id}/undo')
        self.assertEqual(undo_res.status_code, 200)

        # 8. Verify receivable returned to PENDING and transaction unlinked
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT status FROM receivables WHERE id = ?;", (rec_id,))
            rec = cur.fetchone()
            self.assertNotEqual(rec['status'], 'PAID')

            cur.execute("SELECT reconciliation_status, invoice_id FROM transactions WHERE id = ?;", (tx_id,))
            tx = cur.fetchone()
            self.assertEqual(tx['reconciliation_status'], 'UNMATCHED')
            self.assertIsNone(tx['invoice_id'])

if __name__ == '__main__':
    unittest.main()
