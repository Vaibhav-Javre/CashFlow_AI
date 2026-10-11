from flask import Blueprint, jsonify
from backend.services.finance_service import FinanceService
from backend.services.forecast_service import ForecastService
from backend.services.risk_service import RiskService
from backend.services.recommendation_service import RecommendationService

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api/dashboard')

@dashboard_bp.route('/summary', methods=['GET'])
def get_dashboard_summary():
    try:
        summary = FinanceService.get_summary()
        spending = FinanceService.get_spending_breakdown()
        recent = FinanceService.get_recent_transactions(limit=6)
        
        # Single source of truth: RiskService evaluates forecast results
        risks = RiskService.get_risk_center_analysis(days=30)
        forecast_preview = ForecastService.generate_forecast(days=30)
        rec_summary = RecommendationService.get_summary()

        # Primary risk cause and explanation
        primary_cause_desc = risks['causes'][0]['short_explanation'] if risks.get('causes') else ""
        if risks['overall_risk'] == 'Critical':
            insight = f"Critical cash shortage projected on {risks['first_critical_date'] or risks['first_risk_date']}. Immediate intervention required."
        elif risks['overall_risk'] == 'High':
            insight = f"Balance projected to dip below minimum buffer on {risks['first_risk_date']}. Lowest projected balance: ₹{risks['lowest_projected_balance']:,.0f}."
        elif risks['overall_risk'] == 'Moderate':
            insight = f"Liquidity above buffer, but {len(risks.get('causes', []))} risk factors require monitoring."
        else:
            insight = f"Healthy cash flow projected across 30 days. Balance remains above safety buffer."

        return jsonify({
            "success": True,
            "data": {
                "summary": summary,
                "spending_breakdown": spending,
                "recent_transactions": recent,
                "active_risks": risks.get('alerts', []),
                "critical_risks_count": risks.get('critical_count', 0),
                "recommended_action": rec_summary.get('top_recommendation'),
                "recommendations_summary": rec_summary,
                "risk_analysis": {
                    "overall_risk": risks['overall_risk'],
                    "first_risk_date": risks['first_risk_date'],
                    "lowest_projected_balance": risks['lowest_projected_balance'],
                    "potential_shortfall": risks['potential_shortfall'],
                    "classification_rule": risks['classification_rule'],
                    "primary_cause": primary_cause_desc,
                    "priority_action": risks['priority_actions'][0] if risks.get('priority_actions') else None
                },
                "forecast_highlight": {
                    "overall_risk": risks['overall_risk'],
                    "is_shortfall_predicted": forecast_preview['is_shortfall_predicted'],
                    "trough_date": forecast_preview['trough_date'],
                    "lowest_projected_balance": forecast_preview['lowest_projected_balance'],
                    "minimum_balance": forecast_preview['minimum_projected_balance'],
                    "first_risk_date": forecast_preview['first_risk_date'],
                    "reserve_breach_date": forecast_preview['reserve_breach_date'],
                    "projected_shortfall": forecast_preview['projected_shortfall'],
                    "projected_ending_cash": forecast_preview['projected_ending_cash'],
                    "forecast_net_movement": forecast_preview['forecast_net_movement'],
                    "insight": insight
                }
            }
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
