"""Settings loaded from environment variables."""
import os
from pathlib import Path

# Locate and load .env if present
_env_path = Path(__file__).resolve().parents[2] / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)

JOBS_DIR = Path(__file__).resolve().parents[2] / "jobs"
JOBS_DIR.mkdir(exist_ok=True)

CHECKPOINTS_DB = str(Path(__file__).resolve().parents[2] / "checkpoints.db")

PORT = int(os.getenv("PORT", "8000"))
ENV = os.getenv("ENV", "development")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY", "")
HEYGEN_AVATAR_ID = os.getenv("HEYGEN_AVATAR_ID", "")
HEYGEN_VOICE_ID = os.getenv("HEYGEN_VOICE_ID", "")

YT_CLIENT_SECRETS = os.getenv("YT_CLIENT_SECRETS", "credentials/youtube_oauth.json")
INSTAGRAM_ACCESS_TOKEN = os.getenv("INSTAGRAM_ACCESS_TOKEN", "")
INSTAGRAM_ACCOUNT_ID = os.getenv("INSTAGRAM_ACCOUNT_ID", "")
TIKTOK_ACCESS_TOKEN = os.getenv("TIKTOK_ACCESS_TOKEN", "")

MAX_ITERATIONS_DEFAULT = 3
ENGAGEMENT_THRESHOLD = 70.0
