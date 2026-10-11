from flask import Blueprint, jsonify, request
from backend.services.forecast_service import ForecastService

simulations_bp = Blueprint('simulations', __name__, url_prefix='/api/simulations')

@simulations_bp.route('/run', methods=['POST'])
def run_simulation():
    """
    Simulates What-If scenarios:
    - debtor_delay_days: delay in client receivables
    - early_settlement_pct: discount applied for instant receivables collection
    - vendor_stagger_pct: percentage of payables delayed by 14 days
    - expense_reduction_pct: cut to operational burn rate
    """
    body = request.get_json() or {}
    debtor_delay_days = int(body.get('debtor_delay_days', 0))
    early_settlement_pct = float(body.get('early_settlement_pct', 0))
    vendor_stagger_pct = float(body.get('vendor_stagger_pct', 0))
    expense_reduction_pct = float(body.get('expense_reduction_pct', 0))

    base_forecast = ForecastService.generate_forecast(days=30)
    base_min = base_forecast['minimum_projected_balance']

    # Compute simulated impact
    simulated_timeline = []
    current_bal = base_forecast['starting_balance']
    sim_min = current_bal

    for item in base_forecast['timeline']:
        inflow = item['inflow']
        outflow = item['outflow']

        # Adjust for early settlement boost or debtor delay
        if early_settlement_pct > 0 and item['date'] == base_forecast['timeline'][2]['date']:
            # Cash collected early in first 3 days
            inflow += 26800.0 * (1 - early_settlement_pct / 100.0)

        if vendor_stagger_pct > 0:
            outflow = outflow * (1.0 - (vendor_stagger_pct / 100.0) * 0.4)

        if expense_reduction_pct > 0:
            outflow = outflow * (1.0 - (expense_reduction_pct / 100.0) * 0.3)

        net = inflow - outflow
        current_bal += net
        if current_bal < sim_min:
            sim_min = current_bal

        simulated_timeline.append({
            "date": item['date'],
            "base_balance": item['projected_balance'],
            "simulated_balance": round(current_bal, 2),
            "safe_reserve": item['safe_reserve']
        })

    delta_cushion = round(sim_min - base_min, 2)

    return jsonify({
        "success": True,
        "base_minimum": base_min,
        "simulated_minimum": round(sim_min, 2),
        "liquidity_gain": delta_cushion,
        "is_deficit_resolved": sim_min >= base_forecast['target_reserve'],
        "timeline": simulated_timeline
    }), 200
