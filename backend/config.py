import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env if present
basedir = Path(__file__).resolve().parent
load_dotenv(basedir / '.env')

def resolve_db_path():
    raw_path = os.getenv('DATABASE_PATH')
    if not raw_path:
        return str(basedir / 'cashflow.db')
    p = Path(raw_path)
    if p.is_absolute():
        return str(p)
    return str(basedir / p)

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'cashflow-ai-development-key-msme-2025')
    DATABASE_PATH = resolve_db_path()
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000').split(',')
    PORT = int(os.getenv('PORT', 5000))
    DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'
    ENV = os.getenv('FLASK_ENV', 'development')
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '').strip()
