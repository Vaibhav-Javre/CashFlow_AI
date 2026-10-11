from flask import Flask, jsonify
from flask_cors import CORS
from backend.config import Config
from backend.database import init_db

# Import route blueprints
from backend.routes.health import health_bp
from backend.routes.dashboard import dashboard_bp
from backend.routes.transactions import transactions_bp
from backend.routes.receivables import receivables_bp
from backend.routes.payables import payables_bp
from backend.routes.forecast import forecast_bp
from backend.routes.risks import risks_bp, risk_center_bp
from backend.routes.recommendations import recommendations_bp
from backend.routes.simulations import simulations_bp
from backend.routes.scenarios import scenarios_bp
from backend.routes.imports import imports_bp
from backend.routes.documents import documents_bp
from backend.routes.reconciliation import reconciliation_bp
from backend.routes.reports import reports_bp
from backend.routes.auth import auth_bp
from backend.routes.fixed_expenses import fixed_expenses_bp

def create_app(config_class=Config):
    """Factory to create and configure the Flask application."""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    # Initialize SQLite database schema and seed data
    with app.app_context():
        init_db()

    # Register blueprints
    app.register_blueprint(health_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(transactions_bp)
    app.register_blueprint(receivables_bp)
    app.register_blueprint(payables_bp)
    app.register_blueprint(forecast_bp)
    app.register_blueprint(risks_bp)
    app.register_blueprint(risk_center_bp)
    app.register_blueprint(recommendations_bp)
    app.register_blueprint(simulations_bp)
    app.register_blueprint(scenarios_bp)
    app.register_blueprint(imports_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(reconciliation_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(fixed_expenses_bp)

    @app.route('/')
    @app.route('/api')
    def api_root():
        return jsonify({
            "success": True,
            "status": "online",
            "service": "CashFlow AI Backend API",
            "message": "CashFlow AI Backend API is running successfully.",
            "version": "1.0.0",
            "frontend_app": "http://localhost:5173",
            "endpoints": {
                "health": "/api/health",
                "dashboard_summary": "/api/dashboard/summary",
                "forecast": "/api/forecast?days=30",
                "transactions": "/api/transactions",
                "receivables": "/api/receivables",
                "payables": "/api/payables",
                "ai_risk_center": "/api/risks/center?days=30",
                "recommendations": "/api/recommendations",
                "business_profile": "/api/auth/current"
            }
        }), 200

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "success": False,
            "error": "Endpoint not found",
            "help": "Access http://localhost:5000/ to view all available API routes or visit http://localhost:5173 for the frontend application."
        }), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({"success": False, "error": "Internal server error"}), 500

    return app

if __name__ == '__main__':
    app = create_app()
    print(f"Starting CashFlow AI backend server on port {Config.PORT}...")
    app.run(host='0.0.0.0', port=Config.PORT, debug=Config.DEBUG)
