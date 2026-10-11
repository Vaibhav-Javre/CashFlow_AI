from flask import Blueprint, jsonify, request
from backend.services.document_service import DocumentService

documents_bp = Blueprint('documents', __name__, url_prefix='/api/documents')

@documents_bp.route('/upload', methods=['POST'])
def upload_document():
    """Upload and perform OCR extraction on an invoice, bill, or receipt document."""
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded. Please select a PDF or image."}), 400

    file = request.files['file']
    doc_name = request.form.get('document_name')

    try:
        doc = DocumentService.upload_and_process_document(file, doc_name)
        return jsonify({
            "success": True,
            "message": "Document uploaded and parsed successfully.",
            "data": doc
        }), 201
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to upload document: {str(e)}"}), 500

@documents_bp.route('', methods=['GET'])
def list_documents():
    """Retrieve list of uploaded documents."""
    try:
        docs = DocumentService.list_documents()
        return jsonify({"success": True, "data": docs}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/<int:doc_id>', methods=['GET'])
def get_document(doc_id):
    """Retrieve a single document and its extracted fields."""
    try:
        doc = DocumentService.get_document(doc_id)
        if not doc:
            return jsonify({"success": False, "error": f"Document #{doc_id} not found."}), 404
        return jsonify({"success": True, "data": doc}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/<int:doc_id>/extracted-data', methods=['PUT'])
def update_extracted_data(doc_id):
    """Update and correct extracted fields during manual review."""
    body = request.get_json() or {}
    fields = body.get('fields') or body
    try:
        doc = DocumentService.update_extracted_data(doc_id, fields)
        return jsonify({
            "success": True,
            "message": "Extracted fields updated successfully.",
            "data": doc
        }), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/<int:doc_id>/confirm', methods=['POST'])
def confirm_document(doc_id):
    """
    Confirm document review:
    - action_target: 'create_receivable', 'create_payable', or 'document_only'
    """
    body = request.get_json() or {}
    action_target = body.get('action_target', 'document_only')
    fields = body.get('fields')

    if action_target not in ['create_receivable', 'create_payable', 'document_only']:
        return jsonify({"success": False, "error": "Invalid action target. Must be 'create_receivable', 'create_payable', or 'document_only'."}), 400

    try:
        doc = DocumentService.confirm_document(doc_id, action_target, fields)
        return jsonify({
            "success": True,
            "message": f"Document confirmed with action: {action_target}.",
            "data": doc
        }), 200
    except ValueError as ve:
        return jsonify({"success": False, "error": str(ve)}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@documents_bp.route('/scan-receipt', methods=['POST'])
def scan_receipt_photo():
    """
    AI-powered receipt & invoice scanner:
    Accepts an uploaded image file OR base64 data URL from camera.
    Returns structured fields for transaction auto-fill.
    """
    from backend.services.gemini_scanner_service import GeminiScannerService
    
    image_bytes = None
    mime_type = 'image/jpeg'
    filename = 'receipt.jpg'

    # 1. Check if uploaded as multipart file
    if 'file' in request.files:
        f = request.files['file']
        if f.filename:
            filename = f.filename
            image_bytes = f.read()
            mime_type = f.content_type or 'image/jpeg'

    # 2. Check if submitted as JSON with base64 data URL (from camera snapshot)
    if not image_bytes and request.is_json:
        data = request.get_json() or {}
        image_data = data.get('image_data') or data.get('image') or data.get('photo')
        if image_data:
            try:
                image_bytes, mime_type = GeminiScannerService.parse_data_url(image_data)
                filename = data.get('filename', 'camera_capture.jpg')
            except Exception as e:
                return jsonify({"success": False, "error": f"Invalid base64 image data: {str(e)}"}), 400

    if not image_bytes:
        return jsonify({"success": False, "error": "No image provided. Please upload a photo or capture one using your camera."}), 400

    try:
        result = GeminiScannerService.scan_image_bytes(image_bytes, mime_type=mime_type, filename=filename)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to process document with AI: {str(e)}"}), 500

@documents_bp.route('/gemini-status', methods=['GET'])
def get_gemini_status():
    """Check whether Google Gemini API key is active."""
    from backend.services.gemini_scanner_service import GeminiScannerService
    is_conf = GeminiScannerService.is_configured()
    return jsonify({
        "success": True,
        "configured": is_conf,
        "model": "gemini-2.5-flash",
        "message": "Gemini AI Vision is active" if is_conf else "Gemini API key is not set. Add GEMINI_API_KEY to backend/.env."
    }), 200

@documents_bp.route('/save-key', methods=['POST'])
def save_gemini_key():
    """Save user-provided Gemini API key to runtime environment and .env."""
    from backend.services.gemini_scanner_service import GeminiScannerService
    data = request.get_json() or {}
    key = data.get('api_key', '').strip()
    if not key:
        return jsonify({"success": False, "error": "API key cannot be empty."}), 400

    saved = GeminiScannerService.set_api_key(key)
    if saved:
        return jsonify({
            "success": True,
            "message": "Gemini API key saved and activated successfully!",
            "configured": True
        }), 200
    else:
        return jsonify({"success": False, "error": "Failed to save API key to .env file."}), 500
