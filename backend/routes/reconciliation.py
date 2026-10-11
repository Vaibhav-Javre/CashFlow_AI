from flask import Blueprint, jsonify, request
from backend.services.reconciliation_service import ReconciliationService

reconciliation_bp = Blueprint('reconciliation', __name__, url_prefix='/api/reconciliation')

@reconciliation_bp.route('', methods=['GET'])
def get_reconciliation_dashboard():
    """Retrieve reconciliation dashboard with suggested matches and open documents."""
    status = request.args.get('status', 'ALL')
    search = request.args.get('search', '')
    try:
        data = ReconciliationService.get_reconciliation_dashboard(filter_status=status, search_query=search)
        return jsonify({"success": True, "data": data}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@reconciliation_bp.route('/confirm', methods=['POST'])
def confirm_reconciliation():
    """Confirm a reconciliation match between a bank transaction and receivable/payable."""
    body = request.get_json() or {}
    tx_id = body.get('transaction_id')
    matched_type = body.get('matched_type')
    matched_record_id = body.get('matched_record_id')
    notes = body.get('notes')

    if not tx_id or not matched_type or not matched_record_id:
        return jsonify({"success": False, "error": "transaction_id, matched_type, and matched_record_id are required."}), 400

    if matched_type not in ['receivable', 'payable']:
        return jsonify({"success": False, "error": "matched_type must be 'receivable' or 'payable'."}), 400

    try:
        result = ReconciliationService.confirm_reconciliation(tx_id, matched_type, matched_record_id, notes)
        return jsonify({
            "success": True,
            "message": f"Successfully reconciled transaction #{tx_id} against {matched_type} #{matched_record_id}.",
            "data": result
        }), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Reconciliation failed: {str(e)}"}), 500

@reconciliation_bp.route('/<int:transaction_id>/undo', methods=['POST'])
def undo_reconciliation(transaction_id):
    """Safely undo a confirmed reconciliation."""
    try:
        result = ReconciliationService.undo_reconciliation(transaction_id)
        return jsonify({
            "success": True,
            "message": result.get("message", "Reconciliation undone successfully."),
            "data": result
        }), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Undo reconciliation failed: {str(e)}"}), 500
