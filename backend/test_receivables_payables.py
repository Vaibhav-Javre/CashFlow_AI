import json
import urllib.request
import urllib.error
import sys
from datetime import datetime, timedelta

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://localhost:5000/api"

def request_json(url, method='GET', data=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8') if data else None,
        headers={'Content-Type': 'application/json'} if data else {},
        method=method
    )
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            body = json.loads(resp.read().decode('utf-8'))
            return status, body
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            body = json.loads(e.read().decode('utf-8'))
        except Exception:
            body = {"raw": str(e)}
        return status, body

def run_tests():
    print("=== TESTING RECEIVABLES AND PAYABLES MODULE ===")

    # 1. Health check
    status, res = request_json(f"{BASE_URL}/health")
    assert status == 200 and res.get('status') == 'healthy', f"Health failed: {res}"
    print("[PASS] 1. Backend health check passed")

    # 2. Receivables Summary
    status, res = request_json(f"{BASE_URL}/receivables/summary")
    assert status == 200 and res.get('success') is True, f"Rec summary failed: {res}"
    rec_sum = res['summary']
    assert 'total_outstanding' in rec_sum
    assert 'overdue_amount' in rec_sum
    assert 'due_in_next_7_days' in rec_sum
    assert 'amount_received_this_month' in rec_sum
    print(f"[PASS] 2. Receivables Summary: Outstanding = INR {rec_sum['total_outstanding']}, Overdue = INR {rec_sum['overdue_amount']}, Next 7 Days = INR {rec_sum['due_in_next_7_days']}, Received This Month = INR {rec_sum['amount_received_this_month']}")

    # 3. Payables Summary
    status, res = request_json(f"{BASE_URL}/payables/summary")
    assert status == 200 and res.get('success') is True, f"Pay summary failed: {res}"
    pay_sum = res['summary']
    assert 'total_outstanding' in pay_sum
    assert 'overdue_amount' in pay_sum
    assert 'due_in_next_7_days' in pay_sum
    assert 'amount_paid_this_month' in pay_sum
    print(f"[PASS] 3. Payables Summary: Outstanding = INR {pay_sum['total_outstanding']}, Overdue = INR {pay_sum['overdue_amount']}, Next 7 Days = INR {pay_sum['due_in_next_7_days']}, Paid This Month = INR {pay_sum['amount_paid_this_month']}")

    # 4. Invoices Validation Checks
    # 4a. Negative/zero amount
    status, res = request_json(f"{BASE_URL}/receivables", method='POST', data={
        "invoice_number": "TEST-INV-001",
        "customer_name": "Test Customer",
        "invoice_amount": -100,
        "invoice_date": "2026-10-10",
        "due_date": "2026-10-30"
    })
    assert status == 400, f"Expected 400 for negative amount: {res}"
    print(f"[PASS] 4a. Invalid amount rejected with '{res.get('error')}'")

    # 4b. Due date precedes invoice date
    status, res = request_json(f"{BASE_URL}/receivables", method='POST', data={
        "invoice_number": "TEST-INV-002",
        "customer_name": "Test Customer",
        "invoice_amount": 50000,
        "invoice_date": "2026-10-20",
        "due_date": "2026-10-10"
    })
    assert status == 400, f"Expected 400 for due date < invoice date: {res}"
    print(f"[PASS] 4b. Invalid due date rejected with '{res.get('error')}'")

    # 5. Create Customer Invoice
    today_str = datetime.now().strftime('%Y-%m-%d')
    due_str = (datetime.now() + timedelta(days=20)).strftime('%Y-%m-%d')
    test_ts = int(datetime.now().timestamp())
    test_inv_payload = {
        "invoice_number": f"INV-TEST-{test_ts}",
        "customer_name": "Zenith Avionics Pvt Ltd",
        "customer_contact": "finance@zenith.in",
        "invoice_date": today_str,
        "due_date": due_str,
        "invoice_amount": 50000.0,
        "amount_paid": 0.0,
        "description": "5-Axis CNC Precision Brackets",
        "payment_terms": "Net 30"
    }
    status, res = request_json(f"{BASE_URL}/receivables", method='POST', data=test_inv_payload)
    assert status == 201 and res.get('success') is True, f"Create invoice failed: {res}"
    created_inv = res['data']
    inv_id = created_inv['id']
    assert created_inv['invoice_amount'] == 50000.0
    assert created_inv['outstanding_balance'] == 50000.0
    assert created_inv['status'] in ('Pending', 'Due Soon')
    print(f"[PASS] 5. Created Customer Invoice #{created_inv['invoice_number']} (ID {inv_id}) with outstanding INR 50,000")

    # 5b. Duplicate Invoice Number Rejected
    status, res = request_json(f"{BASE_URL}/receivables", method='POST', data=test_inv_payload)
    assert status == 400, f"Expected 400 for duplicate invoice number: {res}"
    print(f"[PASS] 5b. Duplicate invoice number rejected with '{res.get('error')}'")

    # 6. Record Partial Customer Payment (₹20,000 of ₹50,000)
    payment1_payload = {
        "amount": 20000.0,
        "payment_date": today_str,
        "payment_method": "Bank Transfer",
        "reference_number": "UTR-PARTIAL-001",
        "notes": "First milestone payment (40%)"
    }
    status, res = request_json(f"{BASE_URL}/receivables/{inv_id}/payments", method='POST', data=payment1_payload)
    assert status == 201 and res.get('success') is True, f"Partial payment failed: {res}"
    assert res['data']['outstanding_balance'] == 30000.0
    print(f"[PASS] 6. Recorded partial customer payment of INR 20,000. Remaining balance: INR {res['data']['outstanding_balance']}")

    # 7. Overpayment Attempt (attempting to pay ₹35,000 on ₹30,000 remaining)
    overpay_payload = {
        "amount": 35000.0,
        "payment_date": today_str,
        "payment_method": "UPI"
    }
    status, res = request_json(f"{BASE_URL}/receivables/{inv_id}/payments", method='POST', data=overpay_payload)
    assert status == 400, f"Expected 400 for overpayment: {res}"
    print(f"[PASS] 7. Overpayment prevented correctly with '{res.get('error')}'")

    # 8. Record Final Customer Payment (₹30,000 of ₹30,000 remaining)
    payment2_payload = {
        "amount": 30000.0,
        "payment_date": today_str,
        "payment_method": "UPI",
        "reference_number": "UPI-FINAL-002",
        "notes": "Final settlement"
    }
    status, res = request_json(f"{BASE_URL}/receivables/{inv_id}/payments", method='POST', data=payment2_payload)
    assert status == 201 and res.get('success') is True, f"Final payment failed: {res}"
    assert res['data']['outstanding_balance'] == 0.0
    assert res['data']['status'] == 'Paid'
    print(f"[PASS] 8. Recorded final payment of INR 30,000. Invoice status transitioned to '{res['data']['status']}' with balance INR 0")

    # 9. Verify Invoice Details Endpoint and Payments History
    status, res = request_json(f"{BASE_URL}/receivables/{inv_id}")
    assert status == 200 and len(res['data']['payments']) == 2, f"Payment history mismatch: {res}"
    print(f"[PASS] 9. Retrieved invoice details: verified {len(res['data']['payments'])} payment records in history")

    # 10. Create Supplier Bill
    bill_due_str = (datetime.now() + timedelta(days=15)).strftime('%Y-%m-%d')
    test_bill_payload = {
        "bill_number": f"BILL-TEST-{test_ts}",
        "supplier_name": "Bharat Carbide Tooling Co",
        "supplier_contact": "sales@bharattools.in",
        "bill_date": today_str,
        "due_date": bill_due_str,
        "bill_amount": 40000.0,
        "amount_paid": 0.0,
        "category": "Raw Materials",
        "priority": "HIGH",
        "description": "50x Carbide Endmills and Inserts"
    }
    status, res = request_json(f"{BASE_URL}/payables", method='POST', data=test_bill_payload)
    assert status == 201 and res.get('success') is True, f"Create bill failed: {res}"
    created_bill = res['data']
    bill_id = created_bill['id']
    assert created_bill['bill_amount'] == 40000.0
    assert created_bill['outstanding_balance'] == 40000.0
    print(f"[PASS] 10. Created Supplier Bill #{created_bill['bill_number']} (ID {bill_id}) with outstanding INR 40,000")

    # 11. Record Partial Supplier Disbursement (₹15,000 of ₹40,000)
    disb1_payload = {
        "amount": 15000.0,
        "payment_date": today_str,
        "payment_method": "Bank Transfer",
        "reference_number": "NEFT-SUP-01",
        "notes": "Advance tranche 1"
    }
    status, res = request_json(f"{BASE_URL}/payables/{bill_id}/payments", method='POST', data=disb1_payload)
    assert status == 201 and res.get('success') is True, f"Disbursement 1 failed: {res}"
    assert res['data']['outstanding_balance'] == 25000.0
    print(f"[PASS] 11. Recorded partial supplier payment of INR 15,000. Remaining obligation: INR {res['data']['outstanding_balance']}")

    # 12. Record Final Supplier Disbursement (₹25,000 of ₹25,000)
    disb2_payload = {
        "amount": 25000.0,
        "payment_date": today_str,
        "payment_method": "Bank Transfer",
        "reference_number": "NEFT-SUP-02",
        "notes": "Balance tranche 2"
    }
    status, res = request_json(f"{BASE_URL}/payables/{bill_id}/payments", method='POST', data=disb2_payload)
    assert status == 201 and res.get('success') is True, f"Disbursement 2 failed: {res}"
    assert res['data']['outstanding_balance'] == 0.0
    assert res['data']['status'] == 'Paid'
    print(f"[PASS] 12. Recorded final supplier disbursement. Bill status transitioned to '{res['data']['status']}' with balance INR 0")

    # 13. Safety: Deleting record with payments prevented without force
    status, res = request_json(f"{BASE_URL}/receivables/{inv_id}", method='DELETE')
    assert status == 400, f"Expected 400 preventing accidental deletion of invoice with payments: {res}"
    print(f"[PASS] 13. Safety check: Deletion prevented for record with payments: '{res.get('error')}'")

    # Clean up test records with force=true
    status, res = request_json(f"{BASE_URL}/receivables/{inv_id}?force=true", method='DELETE')
    assert status == 200
    status, res = request_json(f"{BASE_URL}/payables/{bill_id}?force=true", method='DELETE')
    assert status == 200
    print("[PASS] 14. Cleaned up test invoice and bill records")

    # 15. Verify Dashboard summary endpoint reflects live database
    status, res = request_json(f"{BASE_URL}/dashboard/summary")
    assert status == 200 and res.get('success') is True
    dash_sum = res['data']['summary']
    assert 'total_receivables' in dash_sum
    assert 'total_payables' in dash_sum
    print(f"[PASS] 15. Dashboard summary verified: live Expected Receivables = INR {dash_sum['total_receivables']}, Upcoming Payables = INR {dash_sum['total_payables']}")

    print("\nALL RECEIVABLES AND PAYABLES MODULE TESTS COMPLETED SUCCESSFULLY!")

if __name__ == '__main__':
    run_tests()
