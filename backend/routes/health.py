from flask import Blueprint, jsonify
from datetime import datetime

health_bp = Blueprint('health', __name__, url_prefix='/api')

@health_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "CashFlow AI Backend API",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }), 200
