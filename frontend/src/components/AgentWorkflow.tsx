import { AgentName, AgentReport, AGENT_ORDER, AGENT_LABELS, AGENT_STATUS_MAP, JobStatus } from "../types/workflow";

interface Props {
  status: JobStatus;
  reports: AgentReport[];
  iterationCount: number;
}

type AgentState = "done" | "active" | "pending";

function getAgentState(agent: AgentName, status: JobStatus, reports: AgentReport[]): AgentState {
  const isDone = reports.some((r) => r.agent === agent);
  if (isDone) return "done";
  const activeAgent = AGENT_STATUS_MAP[status];
  if (activeAgent === agent) return "active";
  return "pending";
}

function Spinner() {
  return (
    <span className="spinner" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function AgentWorkflow({ status, reports, iterationCount }: Props) {
  return (
    <div className="workflow-track">
      <div className="workflow-nodes">
        {AGENT_ORDER.map((agent, i) => {
          const state = getAgentState(agent, status, reports);
          const report = reports.filter((r) => r.agent === agent).at(-1);

          return (
            <div key={agent} className={`workflow-node workflow-node--${state}`}>
              {i > 0 && <div className={`workflow-connector ${state !== "pending" || reports.some(r => r.agent === AGENT_ORDER[i-1]) ? "workflow-connector--lit" : ""}`} />}
              <div className="workflow-node-circle" title={report?.summary ?? AGENT_LABELS[agent]}>
                {state === "active" ? <Spinner /> : state === "done" ? "✓" : i + 1}
              </div>
              <span className="workflow-node-label">{AGENT_LABELS[agent]}</span>
              {report && (
                <span className="workflow-node-summary">{report.summary}</span>
              )}
            </div>
          );
        })}
      </div>
      {iterationCount > 1 && (
        <p className="workflow-iteration-note">
          Optimization loop {iterationCount} — agents are refining the content
        </p>
      )}
    </div>
  );
}
