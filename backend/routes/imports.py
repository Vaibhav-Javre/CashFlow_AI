import io
import csv
import json
from flask import Blueprint, jsonify, request, Response
from datetime import datetime
from backend.database import get_db_connection
from backend.services.import_service import ImportService

imports_bp = Blueprint('imports', __name__, url_prefix='/api/imports')

@imports_bp.route('/preview', methods=['POST'])
def preview_import():
    """
    Upload and parse CSV or Excel file for preview.
    Generates suggested column mappings and validates rows.
    """
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded. Please select a .csv or .xlsx file."}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({"success": False, "error": "Selected file is empty."}), 400

    import_type = request.form.get('import_type', 'bank_statement')
    raw_mapping = request.form.get('column_mapping')
    column_mapping = json.loads(raw_mapping) if raw_mapping else None
    date_format = request.form.get('date_format')

    try:
        if import_type in ['receivable', 'payable']:
            result = ImportService.preview_business_records(
                file,
                record_type=import_type,
                column_mapping=column_mapping,
                date_format=date_format
            )
        else:
            result = ImportService.preview_bank_statement(
                file,
                column_mapping=column_mapping,
                date_format=date_format
            )
        return jsonify({"success": True, "data": result}), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to parse file: {str(e)}"}), 500

@imports_bp.route('/confirm', methods=['POST'])
def confirm_import():
    """
    Confirm and persist imported rows into database.
    Imports valid non-duplicate rows and records row-level errors.
    """
    data = request.get_json() or {}
    token = data.get('token')
    filename = data.get('filename')
    import_type = data.get('import_type', 'bank_statement')
    column_mapping = data.get('column_mapping') or {}
    date_format = data.get('date_format')
    skip_duplicates = data.get('skip_duplicates', True)

    if not token or not filename:
        return jsonify({"success": False, "error": "Missing import session token or filename."}), 400
    if not column_mapping:
        return jsonify({"success": False, "error": "Column mapping is required for confirmation."}), 400

    try:
        if import_type in ['receivable', 'payable']:
            result = ImportService.confirm_business_records(
                token=token,
                filename=filename,
                record_type=import_type,
                column_mapping=column_mapping,
                date_format=date_format,
                skip_duplicates=skip_duplicates
            )
        else:
            result = ImportService.confirm_bank_statement(
                token=token,
                filename=filename,
                column_mapping=column_mapping,
                date_format=date_format,
                skip_duplicates=skip_duplicates
            )
        return jsonify({
            "success": True,
            "message": f"Successfully imported {result['imported_rows']} records.",
            "data": result
        }), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Import confirmation failed: {str(e)}"}), 500

@imports_bp.route('', methods=['GET'])
def list_batches():
    """Retrieve history of import batches."""
    try:
        batches = ImportService.list_batches()
        return jsonify({"success": True, "data": batches}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@imports_bp.route('/<int:batch_id>', methods=['GET'])
def get_batch(batch_id):
    """Retrieve details and errors for a specific import batch."""
    try:
        batch = ImportService.get_batch(batch_id)
        if not batch:
            return jsonify({"success": False, "error": f"Import batch #{batch_id} not found."}), 404
        return jsonify({"success": True, "data": batch}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@imports_bp.route('/<int:batch_id>/errors', methods=['GET'])
def get_batch_errors(batch_id):
    """Retrieve all rejected row errors for an import batch."""
    try:
        batch = ImportService.get_batch(batch_id)
        if not batch:
            return jsonify({"success": False, "error": f"Import batch #{batch_id} not found."}), 404
        return jsonify({"success": True, "data": batch.get('errors', [])}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@imports_bp.route('/<int:batch_id>/errors/download', methods=['GET'])
def download_batch_errors(batch_id):
    """Download a CSV report of rejected rows and reasons for user auditing."""
    try:
        batch = ImportService.get_batch(batch_id)
        if not batch:
            return jsonify({"success": False, "error": f"Import batch #{batch_id} not found."}), 404

        errors = batch.get('errors', [])
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Row Number', 'Error Reason', 'Raw Data'])

        for err in errors:
            writer.writerow([err.get('row_number'), err.get('error_reason'), err.get('raw_data')])

        csv_content = output.getvalue()
        return Response(
            csv_content,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename=rejected_rows_batch_{batch_id}.csv"}
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@imports_bp.route('/sample', methods=['POST'])
def import_sample_data():
    """Generates and imports a realistic sample bank statement of 5 transactions."""
    sample_records = [
        ("2025-05-10", "INFLOW", "Customer Payment", "Direct Wire: Orbital Aerospace Corp", 32400.00, "COMPLETED", "Orbital Aero", "WIRE-9921"),
        ("2025-05-11", "OUTFLOW", "Utilities", "Facility Electric & Nitrogen Supply", 3800.00, "COMPLETED", "Praxair & Power", "ACH-7721"),
        ("2025-05-12", "OUTFLOW", "Raw Materials", "Titanium Billet 6AL-4V Order", 14500.00, "COMPLETED", "Titanium Metal Mart", "ACH-4412"),
        ("2025-05-13", "INFLOW", "Customer Payment", "PO #881 Part Delivery Payment", 18700.00, "COMPLETED", "Quantum Dynamics", "CHK-9102"),
        ("2025-05-14", "OUTFLOW", "Maintenance", "Spindle Cooling Service & Filter Replace", 1250.00, "COMPLETED", "Precision Tech Services", "CARD-1192")
    ]

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany("""
        INSERT INTO transactions (date, type, category, description, amount, status, counterparty, reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """, sample_records)

    net_change = sum(r[4] if r[1] == 'INFLOW' else -r[4] for r in sample_records)
    cursor.execute("UPDATE business_profile SET current_balance = current_balance + ?;", (net_change,))

    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "imported_count": len(sample_records),
        "message": f"Successfully imported {len(sample_records)} statement lines. Net cash change: ₹{net_change:,.2f}"
    }), 200
