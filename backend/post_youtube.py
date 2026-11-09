"""YouTube Shorts upload. OAuth token cached in yt_token.json after first run.
Quota: 1600 units/upload, 10k/day default => ~6 uploads/day."""
import os
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

def _creds():
    creds = None
    if os.path.exists("yt_token.json"):
        creds = Credentials.from_authorized_user_file("yt_token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(os.environ["YT_CLIENT_SECRETS"], SCOPES)
            creds = flow.run_local_server(port=0)
        open("yt_token.json", "w").write(creds.to_json())
    return creds

def post(video_path: str, title: str, caption: str) -> str:
    yt = build("youtube", "v3", credentials=_creds())
    body = {
        "snippet": {"title": title[:100], "description": caption + "\n#Shorts",
                    "categoryId": "25"},  # News & Politics
        "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
    }
    media = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True)
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp = None
    while resp is None:
        _, resp = req.next_chunk()
    return f"https://youtube.com/shorts/{resp['id']}"
