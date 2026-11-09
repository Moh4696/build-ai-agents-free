"""JSON-file job persistence. Each job lives at jobs/{job_id}/state.json."""
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.app.config import JOBS_DIR


def _job_dir(job_id: str) -> Path:
    d = JOBS_DIR / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _state_path(job_id: str) -> Path:
    return _job_dir(job_id) / "state.json"


def write_job_state(job_id: str, data: dict) -> None:
    """Atomically write job state (temp-file + rename)."""
    path = _state_path(job_id)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w") as f:
            json.dump(data, f, indent=2, default=str)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def read_job_state(job_id: str) -> Optional[dict]:
    path = _state_path(job_id)
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def update_job_status(job_id: str, status: str, extra: Optional[dict] = None) -> None:
    """Merge a status update into the existing job state."""
    state = read_job_state(job_id) or {"job_id": job_id}
    state["status"] = status
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    if extra:
        state.update(extra)
    write_job_state(job_id, state)


def list_jobs() -> list:
    """Return all jobs ordered newest first."""
    jobs = []
    for d in JOBS_DIR.iterdir():
        if d.is_dir():
            state = read_job_state(d.name)
            if state:
                jobs.append(state)
    jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return jobs
