import React, { useState, useEffect } from "react";
import { analyzeLead } from "./api";
import styles from "./LeadModal.module.css";

export default function LeadModal({ lead, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!lead) return;
    setLoading(true); setError(""); setAnalysis(null);
    analyzeLead(lead)
      .then(data => { setAnalysis(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, [lead]);

  if (!lead) return null;

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{lead.businessName}</h2>
            <p className={styles.subtitle}>{lead.category} · {lead.location}</p>
          </div>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.meta}>
          {[
            [
              "Rating",
              lead.googleRating === "N/A"
                ? "N/A"
                : `★ ${lead.googleRating}${lead.reviewCount !== "N/A" ? ` (${lead.reviewCount} reviews)` : ""}`,
            ],
            ["Website", lead.hasWebsite],
            ["Lead Score", `${lead.leadScore}/10`],
            ["Service", lead.suggestedService],
          ].map(([k, v]) => (
            <div key={k} className={styles.metaItem}>
              <span className={styles.metaKey}>{k}</span>
              <span className={styles.metaVal}>{v}</span>
            </div>
          ))}
        </div>

        {lead.issuesFound && lead.issuesFound !== "None" && (
          <div className={styles.issues}>
            <p className={styles.sectionTitle}>Issues Detected</p>
            <div className={styles.tags}>
              {lead.issuesFound.split(",").map(i => (
                <span key={i} className={styles.issueTag}>{i.trim()}</span>
              ))}
            </div>
          </div>
        )}

        <div className={styles.analysisBox}>
          <p className={styles.sectionTitle}>AI Outreach Analysis</p>
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <span>Generating pitch & strategy...</span>
            </div>
          )}
          {error && <p className={styles.error}>{error}</p>}
          {analysis && (
            <div className={styles.analysis}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Email Subject</span>
                <p className={styles.fieldVal}>{analysis.subject}</p>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Cold Email Pitch</span>
                <p className={styles.pitch}>{analysis.pitch}</p>
              </div>
              {analysis.painPoints?.length > 0 && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Key Pain Points</span>
                  <ul className={styles.painList}>
                    {analysis.painPoints.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {analysis.approach && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Recommended Approach</span>
                  <p className={styles.fieldVal}>{analysis.approach}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.contactInfo}>
            {lead.phone !== "N/A" && <span>📞 {lead.phone}</span>}
            {lead.email !== "N/A" && <span>✉ {lead.email}</span>}
            {lead.website !== "N/A" && <a href={lead.website} target="_blank" rel="noopener noreferrer">🌐 {lead.website}</a>}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
