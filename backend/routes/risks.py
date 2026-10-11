from flask import Blueprint, jsonify, request
from backend.services.risk_service import RiskService
from backend.database import get_db_connection

risks_bp = Blueprint('risks', __name__, url_prefix='/api/risks')
risk_center_bp = Blueprint('risk_center', __name__, url_prefix='/api/risk-center')

def handle_risk_analysis():
    try:
        days = request.args.get('days', default=30, type=int)
        if days not in [7, 30, 60]:
            if days < 1 or days > 365:
                days = 30
        data = RiskService.get_risk_center_analysis(days=days)
        return jsonify({"success": True, "data": data}), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Risk analysis failed: {str(e)}"}), 500

@risks_bp.route('', methods=['GET'])
def get_risks():
    """Retrieve complete risk center analysis (backward compatible and period-aware)."""
    return handle_risk_analysis()

@risk_center_bp.route('', methods=['GET'])
def get_risk_center():
    """Primary REST endpoint for AI Risk Center."""
    return handle_risk_analysis()

@risks_bp.route('/<int:alert_id>/resolve', methods=['POST'])
def resolve_alert(alert_id):
    """Mark a database risk alert as resolved."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE risk_alerts SET status = 'RESOLVED' WHERE id = ?;", (alert_id,))
        rows_affected = cursor.rowcount
        conn.commit()
        conn.close()
        if rows_affected == 0:
            return jsonify({"success": False, "error": "Alert not found"}), 404
        return jsonify({"success": True, "message": f"Risk alert #{alert_id} resolved"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
