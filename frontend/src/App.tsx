import { useEffect, useState } from "react";
import { Job, JobStatus, TERMINAL_STATUSES } from "./types/workflow";
import { AgentWorkflow } from "./components/AgentWorkflow";
import { HumanGate } from "./components/HumanGate";
import { AgentReports } from "./components/AgentReports";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
  instagram: "Instagram Reels",
};

const STATUS_LABELS: Partial<Record<JobStatus, string>> = {
  pending: "Starting up…",
  running_strategist: "Strategist: researching trends…",
  running_designer: "Designer: writing script…",
  running_engineer: "Engineer: generating video…",
  generating_video: "Engineer: rendering avatar…",
  downloading: "Engineer: downloading video…",
  running_analyst: "Analyst: scoring quality…",
  running_optimizer: "Optimizer: checking algorithms…",
  awaiting_human_approval: "Awaiting your review",
  publishing: "Publishing…",
  published: "Published",
  revising: "Revising…",
  rejected: "Rejected",
  failed: "Failed",
  publish_failed: "Publish failed — check errors",
};

export default function App() {
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState<string>("tiktok");
  const [maxIterations, setMaxIterations] = useState(3);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Poll until terminal status
  useEffect(() => {
    if (!job || TERMINAL_STATUSES.includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await apiFetch<Job>(`/api/jobs/${job.job_id}`);
        setJob(next);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job?.job_id, job?.status]);

  async function generate() {
    if (topic.trim().length < 2) return;
    setBusy(true);
    setMessage("");
    setJob(null);
    try {
      const created = await apiFetch<Job>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ topic: topic.trim(), platform, max_iterations: maxIterations }),
      });
      setJob(created);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!job) return;
    setBusy(true);
    try {
      await apiFetch(`/api/jobs/${job.job_id}/approve`, { method: "POST" });
      setJob({ ...job, status: "publishing" });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevise(notes: string) {
    if (!job) return;
    setBusy(true);
    try {
      await apiFetch(`/api/jobs/${job.job_id}/revise`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      });
      setJob({ ...job, status: "revising" });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!job) return;
    setBusy(true);
    try {
      await apiFetch(`/api/jobs/${job.job_id}/reject`, { method: "POST" });
      setJob({ ...job, status: "rejected" });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const isWorking = job && !TERMINAL_STATUSES.includes(job.status);
  const statusLabel = job ? (STATUS_LABELS[job.status] ?? job.status.replace(/_/g, " ")) : "";

  return (
    <main className="shell">
      <header>
        <span className="eyebrow">Multi-Agent Studio</span>
        <h1>AI Social Video Studio</h1>
        <p>
          5 specialized agents — Strategist, Designer, Engineer, Analyst, Optimizer — collaborate
          in a loop until your video is ready. You approve before anything publishes.
        </p>
      </header>

      {/* Input panel */}
      <section className="panel">
        <label htmlFor="topic">What is your video about?</label>
        <textarea
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Paste a subject, story angle, or brief…"
          rows={4}
          disabled={!!isWorking}
        />

        <div className="config-row">
          <label htmlFor="platform">Platform</label>
          <select
            id="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            disabled={!!isWorking}
          >
            {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          <label htmlFor="iterations">Max loops</label>
          <select
            id="iterations"
            value={maxIterations}
            onChange={(e) => setMaxIterations(Number(e.target.value))}
            disabled={!!isWorking}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <button
          className="primary"
          onClick={generate}
          disabled={busy || topic.trim().length < 2 || !!isWorking}
        >
          {isWorking ? "Agents working…" : "Start multi-agent workflow"}
        </button>
      </section>

      {/* Pipeline progress */}
      {job && job.status !== "pending" && (
        <section className="panel">
          <div className="status">
            <strong>Status</strong>
            <span>{statusLabel}</span>
          </div>

          {job.errors?.length > 0 && (
            <div className="errors">
              {job.errors.map((e, i) => (
                <p key={i} className="error">
                  [{e.agent}] {e.error}
                </p>
              ))}
            </div>
          )}

          <AgentWorkflow
            status={job.status}
            reports={job.agent_reports}
            iterationCount={job.iteration_count}
          />
        </section>
      )}

      {/* Human gate — video review and decision */}
      {job?.status === "awaiting_human_approval" && job.gate_payload && (
        <HumanGate
          payload={job.gate_payload}
          onApprove={handleApprove}
          onRevise={handleRevise}
          onReject={handleReject}
          busy={busy}
        />
      )}

      {/* Published results */}
      {job?.publish_results && Object.keys(job.publish_results).length > 0 && (
        <section className="panel">
          <h3>Publishing results</h3>
          {Object.entries(job.publish_results).map(([p, r]) => (
            <div key={p} className="publish-result">
              <strong>{PLATFORM_LABELS[p] ?? p}</strong>
              <span>{r}</span>
            </div>
          ))}
        </section>
      )}

      {/* Rejected / failed */}
      {job?.status === "rejected" && (
        <section className="panel">
          <p className="status-message">Video rejected. Start a new workflow when ready.</p>
        </section>
      )}

      {/* Non-gate agent reports (post-run) */}
      {job && !["awaiting_human_approval"].includes(job.status) && job.agent_reports?.length > 0 && (
        <section className="panel">
          <AgentReports reports={job.agent_reports} />
        </section>
      )}

      {message && <p className="error standalone">{message}</p>}
    </main>
  );
}
