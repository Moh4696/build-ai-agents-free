export type Platform = "youtube" | "tiktok" | "instagram";

export type AgentName = "strategist" | "designer" | "engineer" | "analyst" | "optimizer";

export type JobStatus =
  | "pending"
  | "running_strategist"
  | "running_designer"
  | "running_engineer"
  | "generating_video"
  | "downloading"
  | "running_analyst"
  | "running_optimizer"
  | "awaiting_human_approval"
  | "publishing"
  | "published"
  | "revising"
  | "rejected"
  | "failed"
  | "publish_failed";

export interface AgentReport {
  agent: AgentName;
  timestamp: string;
  summary: string;
  details: Record<string, unknown>;
}

export interface GatePayload {
  video_url: string;
  video_path: string;
  engagement_score: number;
  monetization_score: number;
  agent_reports: AgentReport[];
  quality_report: string;
  quality_scores: Record<string, number>;
  optimization_feedback: string;
  iteration_count: number;
  script: string;
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
  scenes: Array<{ scene_number: number; visual: string; narration: string; duration_s: number }>;
  algorithm_alignment: Record<string, unknown>;
  topic: string;
  platform: Platform;
}

export interface Job {
  job_id: string;
  status: JobStatus;
  topic: string;
  platform: Platform;
  created_at?: string;
  updated_at?: string;
  agent_reports: AgentReport[];
  video_url?: string;
  engagement_score?: number;
  monetization_score?: number;
  quality_report?: string;
  optimization_feedback?: string;
  iteration_count: number;
  gate_payload?: GatePayload;
  publish_results?: Record<string, string>;
  errors: Array<{ agent: string; error: string; timestamp: string }>;
  completed_at?: string;
}

export const TERMINAL_STATUSES: JobStatus[] = [
  "awaiting_human_approval",
  "published",
  "rejected",
  "failed",
  "publish_failed",
];

export const AGENT_ORDER: AgentName[] = [
  "strategist",
  "designer",
  "engineer",
  "analyst",
  "optimizer",
];

export const AGENT_LABELS: Record<AgentName, string> = {
  strategist: "Strategist",
  designer: "Designer",
  engineer: "Engineer",
  analyst: "Analyst",
  optimizer: "Optimizer",
};

export const AGENT_STATUS_MAP: Partial<Record<JobStatus, AgentName>> = {
  running_strategist: "strategist",
  running_designer: "designer",
  running_engineer: "engineer",
  generating_video: "engineer",
  downloading: "engineer",
  running_analyst: "analyst",
  running_optimizer: "optimizer",
};
