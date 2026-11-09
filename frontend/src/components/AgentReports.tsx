import { useState } from "react";
import { AgentReport, AGENT_LABELS, AgentName } from "../types/workflow";

interface Props {
  reports: AgentReport[];
}

function AgentReportCard({ report }: { report: AgentReport }) {
  const [expanded, setExpanded] = useState(false);
  const label = AGENT_LABELS[report.agent as AgentName] ?? report.agent;

  return (
    <div className={`report-card report-card--${report.agent}`}>
      <button
        className="report-card-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="report-card-agent">{label}</span>
        <span className="report-card-summary">{report.summary}</span>
        <span className="report-card-time">
          {new Date(report.timestamp).toLocaleTimeString()}
        </span>
        <span className="report-card-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="report-card-body">
          <pre className="report-card-json">
            {JSON.stringify(report.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AgentReports({ reports }: Props) {
  if (reports.length === 0) return null;
  return (
    <div className="agent-reports">
      <h3 className="agent-reports-title">Agent Reports</h3>
      <div className="agent-reports-list">
        {reports.map((r, i) => (
          <AgentReportCard key={`${r.agent}-${i}`} report={r} />
        ))}
      </div>
    </div>
  );
}
