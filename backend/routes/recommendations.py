from flask import Blueprint, jsonify, request
from backend.services.recommendation_service import RecommendationService

recommendations_bp = Blueprint('recommendations', __name__, url_prefix='/api/recommendations')

@recommendations_bp.route('', methods=['GET'])
def get_recommendations():
    """
    Retrieve recommendations with optional filtering by status and priority.
    Default filters out Dismissed recommendations.
    """
    try:
        status = request.args.get('status')
        priority = request.args.get('priority')
        limit = request.args.get('limit', type=int)

        recs = RecommendationService.get_recommendations(status=status, priority=priority, limit=limit)
        return jsonify({"success": True, "data": recs, "count": len(recs)}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@recommendations_bp.route('/summary', methods=['GET'])
def get_recommendations_summary():
    """
    Retrieve summary cards metrics:
    - Critical Actions
    - High-Priority Actions
    - Other Suggestions
    - Potential Cash-Flow Improvement
    """
    try:
        summary = RecommendationService.get_summary()
        return jsonify({"success": True, "data": summary}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@recommendations_bp.route('/<int:rec_id>', methods=['GET'])
def get_recommendation(rec_id):
    """Retrieve full details of a specific recommendation with supporting data."""
    try:
        rec = RecommendationService.get_recommendation_by_id(rec_id)
        if not rec:
            return jsonify({"success": False, "error": "Recommendation not found"}), 404
        return jsonify({"success": True, "data": rec}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@recommendations_bp.route('/refresh', methods=['POST'])
def refresh_recommendations():
    """
    Re-evaluate financial rules against current forecast and database state,
    updating stored recommendations safely without losing user lifecycle state.
    """
    try:
        days = request.args.get('days', default=30, type=int)
        evaluated = RecommendationService.evaluate_rules(days=days)
        RecommendationService.sync_recommendations_with_db(evaluated)
        recs = RecommendationService.get_recommendations(status='active')
        summary = RecommendationService.get_summary()
        return jsonify({
            "success": True,
            "message": "Recommendations refreshed successfully",
            "data": recs,
            "summary": summary
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to refresh recommendations: {str(e)}"}), 500

@recommendations_bp.route('/<int:rec_id>/status', methods=['PATCH', 'PUT'])
def update_recommendation_status(rec_id):
    """
    Update recommendation lifecycle status ('Reviewed', 'Dismissed', 'Resolved', 'New').
    """
    try:
        payload = request.get_json() or {}
        new_status = payload.get('status')
        if not new_status:
            return jsonify({"success": False, "error": "Missing 'status' in request body"}), 400

        updated = RecommendationService.update_status(rec_id, new_status)
        if not updated:
            return jsonify({"success": False, "error": "Recommendation not found"}), 404

        return jsonify({
            "success": True,
            "message": f"Recommendation #{rec_id} status updated to {new_status}"
        }), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@recommendations_bp.route('/<int:rec_id>/apply', methods=['POST'])
def apply_recommendation(rec_id):
    """Backward compatibility endpoint for applying/resolving a recommendation."""
    try:
        updated = RecommendationService.update_status(rec_id, 'Resolved')
        if not updated:
            return jsonify({"success": False, "error": "Recommendation not found"}), 404
        return jsonify({"success": True, "message": "Recommendation initiated successfully!"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
