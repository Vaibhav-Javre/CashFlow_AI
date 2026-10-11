from flask import Blueprint, jsonify
from backend.services.finance_service import FinanceService
from backend.services.risk_service import RiskService

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')

@reports_bp.route('/summary', methods=['GET'])
def get_report_summary():
    summary = FinanceService.get_summary()
    risks = RiskService.get_risk_analysis()

    return jsonify({
        "success": True,
        "report": {
            "entity": summary.get('business_name'),
            "industry": summary.get('industry'),
            "health_score": summary.get('health_score'),
            "health_status": summary.get('health_status'),
            "runway_days": summary.get('runway_days'),
            "runway_months": summary.get('runway_months'),
            "current_balance": summary.get('current_balance'),
            "target_reserve": summary.get('target_reserve'),
            "critical_risks_count": risks.get('critical_count'),
            "aging_breakdown": risks.get('aging_breakdown'),
            "recommendation_summary": "Prioritize clearing $39,200 overdue receivables before vendor payments cluster next week."
        }
    }), 200
