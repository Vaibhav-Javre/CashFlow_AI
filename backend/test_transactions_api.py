import json
import urllib.request
import urllib.error

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
        body = json.loads(e.read().decode('utf-8'))
        return status, body

def run_tests():
    print("=== TESTING TRANSACTION API ENDPOINTS ===")

    # 1. Health check
    status, res = request_json(f"{BASE_URL}/health")
    assert status == 200 and res.get('status') == 'healthy', f"Health check failed: {res}"
    print("[PASS] 1. Health check passed")

    # 2. Summary Endpoint
    status, res = request_json(f"{BASE_URL}/transactions/summary")
    assert status == 200 and res.get('success') is True, f"Summary failed: {res}"
    initial_summary = res['summary']
    print(f"[PASS] 2. Summary endpoint: Total Income = {initial_summary['total_income']}, Expenses = {initial_summary['total_expenses']}, Net = {initial_summary['net_cash_flow']}")

    # 3. List Transactions
    status, res = request_json(f"{BASE_URL}/transactions")
    assert status == 200 and res.get('success') is True, f"List failed: {res}"
    initial_count = res['total']
    print(f"[PASS] 3. List transactions: {initial_count} items found")

    # 4. Validation: Missing fields
    status, res = request_json(f"{BASE_URL}/transactions", method='POST', data={
        "amount": 5000
    })
    assert status == 400 and res.get('success') is False, f"Expected 400 for missing title: {res}"
    print(f"[PASS] 4. Validation: Missing title rejected correctly with '{res.get('error')}'")

    # 5. Validation: Invalid Amount <= 0
    status, res = request_json(f"{BASE_URL}/transactions", method='POST', data={
        "title": "Invalid Amount Test",
        "type": "Income",
        "amount": -500,
        "transaction_date": "2026-10-10",
        "category": "Sales Revenue"
    })
    assert status == 400 and res.get('success') is False, f"Expected 400 for negative amount: {res}"
    print(f"[PASS] 5. Validation: Negative amount rejected correctly with '{res.get('error')}'")

    # 6. Create Income Transaction
    income_payload = {
        "title": "Export Consignment Payment",
        "type": "Income",
        "amount": 175000.0,
        "transaction_date": "2026-10-12",
        "category": "Sales Revenue",
        "payment_method": "Bank Transfer",
        "counterparty": "Global Exporters Ltd",
        "description": "Payment for batch #82",
        "payment_status": "Completed",
        "reference_number": "TXN-EXP-889"
    }
    status, res = request_json(f"{BASE_URL}/transactions", method='POST', data=income_payload)
    assert status == 201 and res.get('success') is True, f"Create income failed: {res}"
    created_income = res['data']
    income_id = created_income['id']
    assert created_income['amount'] == 175000.0
    assert created_income['type'] == 'Income'
    print(f"[PASS] 6. Created Income transaction #{income_id}: INR {created_income['amount']}")

    # 7. Create Expense Transaction
    expense_payload = {
        "title": "Raw Copper Rods Purchase",
        "type": "Expense",
        "amount": 62000.0,
        "transaction_date": "2026-10-14",
        "category": "Inventory Purchase",
        "payment_method": "UPI",
        "counterparty": "National Metals Ltd",
        "description": "500kg raw copper billets",
        "payment_status": "Pending",
        "due_date": "2026-10-20",
        "reference_number": "UPI/NM/9012"
    }
    status, res = request_json(f"{BASE_URL}/transactions", method='POST', data=expense_payload)
    assert status == 201 and res.get('success') is True, f"Create expense failed: {res}"
    created_expense = res['data']
    expense_id = created_expense['id']
    assert created_expense['amount'] == 62000.0
    assert created_expense['type'] == 'Expense'
    print(f"[PASS] 7. Created Expense transaction #{expense_id}: INR {created_expense['amount']}")

    # 8. Retrieve Single Transaction
    status, res = request_json(f"{BASE_URL}/transactions/{income_id}")
    assert status == 200 and res.get('success') is True, f"Get single failed: {res}"
    assert res['data']['title'] == "Export Consignment Payment"
    print(f"[PASS] 8. Retrieved transaction #{income_id} successfully")

    # 9. Update Transaction (PUT)
    update_payload = {
        "title": "Export Consignment Payment (Final)",
        "amount": 180000.0,
        "counterparty": "Global Exporters International",
        "payment_status": "Completed"
    }
    status, res = request_json(f"{BASE_URL}/transactions/{income_id}", method='PUT', data=update_payload)
    assert status == 200 and res.get('success') is True, f"Update failed: {res}"
    assert res['data']['amount'] == 180000.0
    assert res['data']['counterparty'] == "Global Exporters International"
    print(f"[PASS] 9. Updated transaction #{income_id} amount to INR 180,000")

    # 10. Search and Filter tests
    # Search
    status, res = request_json(f"{BASE_URL}/transactions?search=Copper")
    assert status == 200 and any(t['id'] == expense_id for t in res['data']), "Search failed to find expense"
    print(f"[PASS] 10a. Search by keyword returned {res['total']} matching records")

    # Type Filter
    status, res = request_json(f"{BASE_URL}/transactions?type=Income")
    assert status == 200 and all(t['type'] == 'Income' for t in res['data']), "Type filter failed"
    print(f"[PASS] 10b. Filter by type 'Income' returned {res['total']} records")

    # Status Filter
    status, res = request_json(f"{BASE_URL}/transactions?status=Pending")
    assert status == 200 and all(t['payment_status'] == 'Pending' for t in res['data']), "Status filter failed"
    print(f"[PASS] 10c. Filter by status 'Pending' returned {res['total']} records")

    # Category Filter
    status, res = request_json(f"{BASE_URL}/transactions?category=Inventory%20Purchase")
    assert status == 200 and all(t['category'] == 'Inventory Purchase' for t in res['data']), "Category filter failed"
    print(f"[PASS] 10d. Filter by category returned {res['total']} records")

    # 11. Delete Transaction
    status, res = request_json(f"{BASE_URL}/transactions/{expense_id}", method='DELETE')
    assert status == 200 and res.get('success') is True, f"Delete failed: {res}"
    print(f"[PASS] 11. Deleted transaction #{expense_id}")

    # Confirm it cannot be found
    status, res = request_json(f"{BASE_URL}/transactions/{expense_id}")
    assert status == 404, f"Expected 404 after deletion, got {status}"
    print("[PASS] 12. Verified deletion: transaction returns 404")

    # Clean up test income transaction as well
    status, res = request_json(f"{BASE_URL}/transactions/{income_id}", method='DELETE')
    assert status == 200
    print("[PASS] 13. Cleaned up test income transaction")

    print("\nALL TRANSACTION API TESTS COMPLETED AND PASSED PERFECTLY!")

if __name__ == '__main__':
    run_tests()
