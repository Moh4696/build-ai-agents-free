"""Pydantic schemas for FastAPI request/response bodies."""
from typing import Optional
from pydantic import BaseModel, Field


class CreateJobRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=2000)
    platform: str = Field(default="tiktok")
    max_iterations: int = Field(default=3, ge=1, le=5)


class ReviseRequest(BaseModel):
    notes: str = Field(..., min_length=1, max_length=2000)


class PublishRequest(BaseModel):
    platforms: list[str] = Field(default_factory=lambda: ["youtube", "instagram", "tiktok"])


class AgentReport(BaseModel):
    agent: str
    timestamp: str
    summary: str
    details: dict = Field(default_factory=dict)


class JobResponse(BaseModel):
    job_id: str
    status: str
    topic: str
    platform: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    agent_reports: list = Field(default_factory=list)
    video_url: Optional[str] = None
    engagement_score: Optional[float] = None
    monetization_score: Optional[float] = None
    quality_report: Optional[str] = None
    optimization_feedback: Optional[str] = None
    iteration_count: int = 0
    gate_payload: Optional[dict] = None
    publish_results: Optional[dict] = None
    errors: list = Field(default_factory=list)
    completed_at: Optional[str] = None
