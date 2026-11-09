import { useState } from "react";
import { GatePayload } from "../types/workflow";
import { AgentReports } from "./AgentReports";

interface Props {
  payload: GatePayload;
  onApprove: () => Promise<void>;
  onRevise: (notes: string) => Promise<void>;
  onReject: () => Promise<void>;
  busy: boolean;
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const tier = score >= 70 ? "high" : score >= 50 ? "mid" : "low";
  return (
    <div className={`score-badge score-badge--${tier}`}>
      <span className="score-badge-value">{Math.round(score)}</span>
      <span className="score-badge-label">{label}</span>
    </div>
  );
}

export function HumanGate({ payload, onApprove, onRevise, onReject, busy }: Props) {
  const [reviseMode, setReviseMode] = useState(false);
  const [notes, setNotes] = useState("");

  return (
    <div className="human-gate">
      <div className="human-gate-header">
        <h2>Ready for your review</h2>
        <p>Watch the video, review the agent reports, then decide.</p>
        <div className="score-row">
          <ScoreBadge label="Engagement" score={payload.engagement_score} />
          <ScoreBadge label="Monetization" score={payload.monetization_score} />
          <span className="iteration-badge">Loop {payload.iteration_count}</span>
        </div>
      </div>

      <div className="human-gate-body">
        {/* Video preview */}
        <div className="gate-video">
          {payload.video_url ? (
            <video controls playsInline src={payload.video_url} />
          ) : (
            <div className="gate-video-placeholder">Video preview unavailable (mock mode)</div>
          )}
        </div>

        {/* Script panel */}
        <div className="gate-script">
          <div className="gate-script-section">
            <h4>Hook</h4>
            <p className="gate-hook">{payload.hook}</p>
          </div>
          <div className="gate-script-section">
            <h4>Script</h4>
            <p>{payload.script}</p>
          </div>
          <div className="gate-script-section">
            <h4>CTA</h4>
            <p className="gate-cta">{payload.cta}</p>
          </div>
          <div className="gate-script-section">
            <h4>Caption</h4>
            <p>{payload.caption}</p>
          </div>
          <div className="gate-script-section">
            <h4>Hashtags</h4>
            <p className="gate-hashtags">{payload.hashtags.join(" ")}</p>
          </div>
        </div>

        {/* Quality report */}
        {payload.quality_report && (
          <div className="gate-quality">
            <h4>Quality Report</h4>
            <div className="quality-scores">
              {Object.entries(payload.quality_scores).map(([k, v]) => (
                <div key={k} className="quality-score-row">
                  <span>{k.replace(/_/g, " ")}</span>
                  <div className="quality-bar-wrap">
                    <div className="quality-bar" style={{ width: `${(v / 20) * 100}%` }} />
                  </div>
                  <span>{v}/20</span>
                </div>
              ))}
            </div>
            <p className="quality-report-text">{payload.quality_report}</p>
          </div>
        )}

        {/* Optimizer feedback */}
        {payload.optimization_feedback && (
          <div className="gate-optimizer">
            <h4>Optimizer Notes</h4>
            <pre>{payload.optimization_feedback}</pre>
          </div>
        )}

        {/* All agent reports */}
        <AgentReports reports={payload.agent_reports} />
      </div>

      {/* Decision panel */}
      <div className="human-gate-decision">
        {!reviseMode ? (
          <div className="decision-buttons">
            <button
              className="btn btn--approve"
              onClick={onApprove}
              disabled={busy}
            >
              Publish Now
            </button>
            <button
              className="btn btn--revise"
              onClick={() => setReviseMode(true)}
              disabled={busy}
            >
              Revise with notes
            </button>
            <button
              className="btn btn--reject"
              onClick={onReject}
              disabled={busy}
            >
              Reject
            </button>
          </div>
        ) : (
          <div className="revise-form">
            <label htmlFor="revise-notes">
              Revision instructions for the Designer agent:
            </label>
            <textarea
              id="revise-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Make the hook a question, shorten the script, use a stronger CTA…"
            />
            <div className="revise-actions">
              <button
                className="btn btn--approve"
                onClick={() => onRevise(notes)}
                disabled={busy || notes.trim().length < 5}
              >
                Send for revision
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => setReviseMode(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
