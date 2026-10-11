from flask import Blueprint, jsonify, request
from backend.services.forecast_service import ForecastService

forecast_bp = Blueprint('forecast', __name__, url_prefix='/api/forecast')

@forecast_bp.route('', methods=['GET'])
def get_forecast():
    """
    Retrieve deterministic daily cash-flow forecast for the specified period.
    Supported periods: 7, 30, 60 days (or custom positive integer).
    """
    try:
        raw_days = request.args.get('days', 30)
        try:
            days = int(raw_days)
            if days <= 0:
                return jsonify({"success": False, "error": "Forecast period 'days' must be a positive integer"}), 400
            if days > 365:
                days = 365
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": "Invalid days parameter; must be an integer"}), 400

        start_date = request.args.get('start_date')
        data = ForecastService.generate_forecast(days=days, start_date=start_date)
        return jsonify({"success": True, "data": data}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@forecast_bp.route('/settings', methods=['GET'])
def get_forecast_settings():
    """
    Retrieve configured opening balance and minimum cash buffer settings.
    """
    try:
        settings = ForecastService.get_settings()
        return jsonify({"success": True, "data": settings}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@forecast_bp.route('/settings', methods=['PUT'])
def update_forecast_settings():
    """
    Update and persist opening cash balance and minimum cash buffer.
    """
    try:
        body = request.get_json() or {}

        if 'opening_balance' not in body and 'minimum_cash_buffer' not in body:
            return jsonify({"success": False, "error": "Either opening_balance or minimum_cash_buffer must be provided"}), 400

        current_settings = ForecastService.get_settings()
        opening_balance = body.get('opening_balance', current_settings['opening_balance'])
        minimum_cash_buffer = body.get('minimum_cash_buffer', current_settings['minimum_cash_buffer'])
        start_date = body.get('start_date', current_settings['start_date'])
        notes = body.get('notes', 'User-configured settings')

        try:
            ob_val = float(opening_balance)
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": "Opening balance must be a valid number"}), 400

        try:
            mb_val = float(minimum_cash_buffer)
            if mb_val < 0:
                return jsonify({"success": False, "error": "Minimum cash buffer must be greater than or equal to 0"}), 400
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": "Minimum cash buffer must be a valid non-negative number"}), 400

        updated = ForecastService.update_settings(
            opening_balance=ob_val,
            minimum_cash_buffer=mb_val,
            start_date=start_date,
            notes=notes
        )

        return jsonify({
            "success": True,
            "message": "Forecast settings updated successfully",
            "data": updated
        }), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
