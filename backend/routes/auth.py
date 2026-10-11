import os
import sqlite3
import time
from flask import Blueprint, jsonify, request
from backend.database import (
    get_db_connection,
    get_business_db_path,
    sanitize_business_key,
    init_clean_business_db
)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new business account and create its private, isolated workspace."""
    data = request.get_json() or {}
    business_name = data.get('business_name', '').strip()
    owner_name = data.get('owner_name', '').strip()
    email = data.get('email', '').strip().lower()
    industry = data.get('industry', 'General MSME Business').strip()
    currency = data.get('currency', '₹')
    opening_balance = float(data.get('opening_balance', 500000.0) or 500000.0)
    target_reserve = float(data.get('target_reserve', 100000.0) or 100000.0)

    if not business_name:
        return jsonify({"success": False, "error": "Business name is required."}), 400
    if not email:
        return jsonify({"success": False, "error": "Business email is required."}), 400

    biz_key = email or business_name
    db_path = get_business_db_path(biz_key)

    # Initialize a clean, dedicated database file for this business
    try:
        conn = sqlite3.connect(db_path, timeout=60.0)
        try:
            conn.execute("PRAGMA busy_timeout = 60000;")
        except Exception:
            pass

        init_clean_business_db(conn, metadata={
            'business_name': business_name,
            'owner_name': owner_name or business_name,
            'email': email,
            'industry': industry,
            'currency': currency,
            'opening_balance': opening_balance,
            'target_reserve': target_reserve
        })
        conn.close()

        user_info = {
            "email": email,
            "owner_name": owner_name or business_name,
            "business_name": business_name,
            "industry": industry,
            "currency": currency,
            "current_balance": opening_balance,
            "target_reserve": target_reserve
        }

        return jsonify({
            "success": True,
            "message": f"Welcome, {business_name}! Your isolated workspace is ready with a clean slate.",
            "user": user_info
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to register business: {str(e)}"}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate and log in to a business account."""
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    clean_key = sanitize_business_key(email)

    # 1. Demo Workspace Login
    if clean_key == 'default' or 'demo' in email or not email:
        return jsonify({
            "success": True,
            "message": "Logged in to Apex Precision Dynamics Demo Workspace.",
            "user": {
                "email": "demo@apexprecision.com",
                "owner_name": "Rajesh Sharma",
                "business_name": "Apex Precision Dynamics",
                "industry": "Precision Tooling & MSME Engineering",
                "currency": "₹",
                "current_balance": 842500.0,
                "target_reserve": 500000.0
            }
        }), 200

    # 2. Dedicated Business Workspace Login
    db_path = get_business_db_path(email)
    try:
        conn = sqlite3.connect(db_path, timeout=60.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA busy_timeout = 60000;")
        except Exception:
            pass

        cursor = conn.cursor()
        cursor.execute("SELECT * FROM business_profile LIMIT 1;")
        prof = cursor.fetchone()

        if not prof:
            # If not initialized yet, initialize clean workspace
            init_clean_business_db(conn, metadata={
                'email': email,
                'business_name': email.split('@')[0].capitalize() + " Enterprises"
            })
            cursor.execute("SELECT * FROM business_profile LIMIT 1;")
            prof = cursor.fetchone()

        user_info = {
            "email": email,
            "owner_name": prof['name'] if prof else email,
            "business_name": prof['name'] if prof else "My Business",
            "industry": prof['industry'] if prof else "General MSME Business",
            "currency": prof['currency'] if prof else "₹",
            "current_balance": float(prof['current_balance']) if prof else 500000.0,
            "target_reserve": float(prof['target_reserve']) if prof else 100000.0
        }
        conn.close()

        return jsonify({
            "success": True,
            "message": f"Welcome back to {user_info['business_name']}!",
            "user": user_info
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": f"Login failed: {str(e)}"}), 500

@auth_bp.route('/current', methods=['GET'])
def get_current_profile():
    """Retrieve active business profile for the calling workspace."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM business_profile LIMIT 1;")
        prof = cursor.fetchone()
        conn.close()

        if prof:
            return jsonify({
                "success": True,
                "data": dict(prof)
            }), 200
        return jsonify({"success": False, "error": "No business profile found"}), 404
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@auth_bp.route('/profile', methods=['PUT'])
@auth_bp.route('/current', methods=['PUT'])
def update_profile():
    """Update active business profile, user info, and forecast buffer calibration."""
    try:
        data = request.get_json() or {}
        business_name = data.get('business_name') or data.get('name')
        industry = data.get('industry')
        currency = data.get('currency')
        opening_balance = data.get('opening_balance') or data.get('current_balance')
        target_reserve = data.get('target_reserve') or data.get('minimum_cash_buffer')

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM business_profile LIMIT 1;")
        prof = cursor.fetchone()
        if not prof:
            conn.close()
            return jsonify({"success": False, "error": "Business profile not found"}), 404

        prof_id = prof['id']
        new_name = str(business_name).strip() if business_name and str(business_name).strip() else prof['name']
        new_ind = str(industry).strip() if industry and str(industry).strip() else prof['industry']
        new_curr = str(currency).strip() if currency and str(currency).strip() else prof['currency']
        
        try:
            new_bal = float(opening_balance) if opening_balance is not None else float(prof['current_balance'])
        except (ValueError, TypeError):
            new_bal = float(prof['current_balance'])

        try:
            new_res = float(target_reserve) if target_reserve is not None else float(prof['target_reserve'])
        except (ValueError, TypeError):
            new_res = float(prof['target_reserve'])

        cursor.execute("""
            UPDATE business_profile
            SET name = ?, industry = ?, currency = ?, current_balance = ?, target_reserve = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (new_name, new_ind, new_curr, new_bal, new_res, prof_id))

        # Also keep users table updated
        cursor.execute("""
            UPDATE users
            SET business_name = ?, industry = ?, currency = ?;
        """, (new_name, new_ind, new_curr))

        # Also keep forecast_settings updated
        cursor.execute("""
            UPDATE forecast_settings
            SET opening_balance = ?, minimum_cash_buffer = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = (SELECT id FROM forecast_settings LIMIT 1);
        """, (new_bal, new_res, f"Updated settings for {new_name}"))

        conn.commit()

        cursor.execute("SELECT * FROM business_profile WHERE id = ?;", (prof_id,))
        updated_prof = dict(cursor.fetchone())
        conn.close()

        user_info = {
            "business_name": updated_prof['name'],
            "owner_name": updated_prof['name'],
            "industry": updated_prof['industry'],
            "currency": updated_prof['currency'],
            "current_balance": float(updated_prof['current_balance']),
            "target_reserve": float(updated_prof['target_reserve'])
        }

        return jsonify({
            "success": True,
            "message": "Business profile and settings updated successfully",
            "data": updated_prof,
            "user": user_info
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@auth_bp.route('/switch-demo', methods=['POST'])
def switch_to_demo():
    """Reset active workspace to Apex Precision Dynamics demo."""
    return jsonify({
        "success": True,
        "message": "Switched to Apex Precision Dynamics demo workspace.",
        "user": {
            "email": "demo@apexprecision.com",
            "owner_name": "Rajesh Sharma",
            "business_name": "Apex Precision Dynamics",
            "industry": "Precision Tooling & MSME Engineering",
            "currency": "₹",
            "current_balance": 842500.0,
            "target_reserve": 500000.0
        }
    }), 200
