#!/usr/bin/env python3
"""API server entrypoint. Run: python run_api.py"""
import os
import sys

# Ensure project root is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load env before importing anything else
from pathlib import Path
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    env = os.getenv("ENV", "development")
    reload = env == "development"

    print(f"Starting AI Social Video Studio API on port {port} (reload={reload})")
    uvicorn.run(
        "backend.app.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
        log_level="info",
    )
