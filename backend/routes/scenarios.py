from flask import Blueprint, jsonify, request
from backend.services.scenario_service import ScenarioService

scenarios_bp = Blueprint('scenarios', __name__, url_prefix='/api/scenarios')

@scenarios_bp.route('', methods=['GET'])
def list_scenarios():
    """Retrieve all saved What-If scenarios with adjustment counts."""
    try:
        scenarios = ScenarioService.list_scenarios()
        return jsonify({"success": True, "data": scenarios}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@scenarios_bp.route('', methods=['POST'])
def create_scenario():
    """Create and persist a new What-If scenario with adjustments."""
    try:
        body = request.get_json() or {}
        name = body.get('name')
        description = body.get('description', '')
        adjustments = body.get('adjustments', [])

        scenario = ScenarioService.create_scenario(name, description, adjustments)
        return jsonify({
            "success": True,
            "message": "Scenario saved successfully",
            "data": scenario
        }), 201
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to save scenario: {str(e)}"}), 500

@scenarios_bp.route('/<int:scenario_id>', methods=['GET'])
def get_scenario(scenario_id):
    """Retrieve a specific saved scenario with all its adjustments."""
    try:
        scenario = ScenarioService.get_scenario(scenario_id)
        if not scenario:
            return jsonify({"success": False, "error": "Scenario not found"}), 404
        return jsonify({"success": True, "data": scenario}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@scenarios_bp.route('/<int:scenario_id>', methods=['PUT'])
def update_scenario(scenario_id):
    """Update a saved scenario and replace its adjustments."""
    try:
        body = request.get_json() or {}
        name = body.get('name')
        description = body.get('description', '')
        adjustments = body.get('adjustments', [])

        scenario = ScenarioService.update_scenario(scenario_id, name, description, adjustments)
        if not scenario:
            return jsonify({"success": False, "error": "Scenario not found"}), 404
        return jsonify({
            "success": True,
            "message": "Scenario updated successfully",
            "data": scenario
        }), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to update scenario: {str(e)}"}), 500

@scenarios_bp.route('/<int:scenario_id>', methods=['DELETE'])
def delete_scenario(scenario_id):
    """Delete a saved scenario and all its adjustments."""
    try:
        deleted = ScenarioService.delete_scenario(scenario_id)
        if not deleted:
            return jsonify({"success": False, "error": "Scenario not found"}), 404
        return jsonify({"success": True, "message": "Scenario deleted successfully"}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@scenarios_bp.route('/<int:scenario_id>/duplicate', methods=['POST'])
def duplicate_scenario(scenario_id):
    """Duplicate an existing scenario and its adjustments."""
    try:
        duplicated = ScenarioService.duplicate_scenario(scenario_id)
        if not duplicated:
            return jsonify({"success": False, "error": "Scenario not found"}), 404
        return jsonify({
            "success": True,
            "message": "Scenario duplicated successfully",
            "data": duplicated
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@scenarios_bp.route('/preview', methods=['POST'])
def preview_scenario():
    """
    Calculate baseline vs. scenario comparison without saving to database.
    Query param ?days=7|30|60 controls forecast horizon.
    """
    try:
        days = request.args.get('days', default=30, type=int)
        body = request.get_json() or {}
        adjustments = body.get('adjustments', [])

        result = ScenarioService.preview_scenario(adjustments=adjustments, days=days)
        return jsonify({"success": True, "data": result}), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to calculate scenario: {str(e)}"}), 500

@scenarios_bp.route('/<int:scenario_id>/comparison', methods=['GET'])
def get_scenario_comparison(scenario_id):
    """Compare a saved scenario against current baseline forecast."""
    try:
        days = request.args.get('days', default=30, type=int)
        scen = ScenarioService.get_scenario(scenario_id)
        if not scen:
            return jsonify({"success": False, "error": "Scenario not found"}), 404

        result = ScenarioService.preview_scenario(adjustments=scen.get('adjustments', []), days=days)
        result['scenario_id'] = scenario_id
        result['scenario_name'] = scen['name']
        result['scenario_description'] = scen.get('description')
        return jsonify({"success": True, "data": result}), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
