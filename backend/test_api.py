import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import create_app

def test_endpoints():
    app = create_app()
    client = app.test_client()

    # 1. Health endpoint
    res = client.get('/api/health')
    assert res.status_code == 200, f"Health check failed: {res.status_code}"
    data = res.get_json()
    assert data['status'] == 'healthy', f"Expected status healthy, got {data}"
    print("[OK] /api/health passed")

    # 2. Dashboard summary
    res = client.get('/api/dashboard/summary')
    assert res.status_code == 200, f"Dashboard summary failed: {res.status_code}"
    dash_data = res.get_json()
    assert dash_data['success'] is True
    assert 'summary' in dash_data['data']
    print(f"[OK] /api/dashboard/summary passed (Cash Balance: ${dash_data['data']['summary']['current_balance']:,.2f})")

    # 3. Forecast endpoint
    res = client.get('/api/forecast?days=30')
    assert res.status_code == 200, f"Forecast failed: {res.status_code}"
    fore_data = res.get_json()
    assert fore_data['success'] is True
    assert len(fore_data['data']['timeline']) == 30
    print(f"[OK] /api/forecast passed (30 days timeline generated, trough: ${fore_data['data']['minimum_projected_balance']:,.2f})")

    # 4. Receivables endpoint
    res = client.get('/api/receivables')
    assert res.status_code == 200
    rec_data = res.get_json()
    res_rec_sum = client.get('/api/receivables/summary')
    rec_sum = res_rec_sum.get_json().get('data', {})
    print(f"[OK] /api/receivables passed ({len(rec_data['data'])} records, total outstanding: ${rec_sum.get('total_outstanding', 0):,.2f})")

    # 5. Payables endpoint
    res = client.get('/api/payables')
    assert res.status_code == 200
    pay_data = res.get_json()
    res_pay_sum = client.get('/api/payables/summary')
    pay_sum = res_pay_sum.get_json().get('data', {})
    print(f"[OK] /api/payables passed ({len(pay_data['data'])} records, total obligations: ${pay_sum.get('total_obligations', 0):,.2f})")

    # 5b. Forecast settings endpoint
    res = client.get('/api/forecast/settings')
    assert res.status_code == 200
    set_data = res.get_json()
    assert set_data['success'] is True
    print(f"[OK] /api/forecast/settings GET passed (Opening balance: ${set_data['data']['opening_balance']:,.2f})")

    res = client.put('/api/forecast/settings', json={
        "opening_balance": set_data['data']['opening_balance'],
        "minimum_cash_buffer": set_data['data']['minimum_cash_buffer']
    })
    assert res.status_code == 200
    print("[OK] /api/forecast/settings PUT passed")

    # 6. Risks endpoint
    res = client.get('/api/risks')
    assert res.status_code == 200
    risk_data = res.get_json()
    print(f"[OK] /api/risks passed ({len(risk_data['data']['alerts'])} active early-warning alerts)")

    # 7. What-If Simulation endpoint
    res = client.post('/api/simulations/run', json={
        "debtor_delay_days": 0,
        "early_settlement_pct": 2.0,
        "vendor_stagger_pct": 25.0,
        "expense_reduction_pct": 10.0
    })
    assert res.status_code == 200
    sim_data = res.get_json()
    print(f"[OK] /api/simulations/run passed (Liquidity gain: +${sim_data['liquidity_gain']:,.2f})")

    print("\nALL BACKEND API TESTS COMPLETED SUCCESSFULLY!")

if __name__ == '__main__':
    test_endpoints()
