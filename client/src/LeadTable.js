import React, { useState } from "react";
import styles from "./LeadTable.module.css";

const SERVICE_COLORS = {
  "Website Dev":      { bg: "#e0e7ff", color: "#3730a3" },
  "App Dev":          { bg: "#fce7f3", color: "#9d174d" },
  "Chatbot":          { bg: "#d1fae5", color: "#065f46" },
  "SEO":              { bg: "#fef3c7", color: "#92400e" },
  "Full Digital Suite": { bg: "#ede9fe", color: "#5b21b6" },
};

function ScoreBadge({ score }) {
  const bg = score >= 8 ? "#d1fae5" : score >= 6 ? "#fef3c7" : "#fee2e2";
  const color = score >= 8 ? "#065f46" : score >= 6 ? "#92400e" : "#991b1b";
  return (
    <span style={{ background: bg, color, fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 20 }}>
      {score}/10
    </span>
  );
}

const COLUMNS = [
  { key: "businessName", label: "Business" },
  { key: "location",     label: "Location" },
  { key: "googleRating", label: "Rating" },
  { key: "hasWebsite",   label: "Website" },
  { key: "issuesFound",  label: "Issues" },
  { key: "leadScore",    label: "Score" },
  { key: "suggestedService", label: "Service" },
];

export default function LeadTable({ leads, onSelectLead }) {
  const [sortField, setSortField] = useState("leadScore");
  const [sortDir, setSortDir]   = useState("desc");
  const [search, setSearch]     = useState("");

  const compareValue = (value) => {
    if (typeof value === "number") return value;
    if (value === "N/A" || value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : String(value).toLowerCase();
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const filtered = leads
    .filter(l =>
      !search ||
      l.businessName.toLowerCase().includes(search.toLowerCase()) ||
      l.location.toLowerCase().includes(search.toLowerCase()) ||
      l.suggestedService.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const av = compareValue(a[sortField]);
      const bv = compareValue(b[sortField]);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "desc" ? bv - av : av - bv;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "desc"
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Search by name, location or service..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className={styles.count}>{filtered.length} leads</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className={styles.th}>
                  {col.label}
                  <span className={styles.sort}>
                    {sortField === col.key ? (sortDir === "desc" ? " ↓" : " ↑") : " ↕"}
                  </span>
                </th>
              ))}
              <th className={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => (
              <tr key={lead.id} className={styles.row}>
                <td className={styles.td}>
                  <div className={styles.bizName}>{lead.businessName}</div>
                  {lead.phone !== "N/A" && <div className={styles.sub}>{lead.phone}</div>}
                  {lead.email !== "N/A" && <div className={styles.sub}>{lead.email}</div>}
                </td>
                <td className={styles.td}>
                  <span className={styles.loc}>{lead.location}</span>
                </td>
                <td className={styles.td} style={{ whiteSpace: "nowrap" }}>
                  <span className={styles.rating}>
                    {lead.googleRating === "N/A" ? "N/A" : `★ ${lead.googleRating}`}
                  </span>
                  <span className={styles.reviews}>
                    {lead.reviewCount === "N/A" ? "" : ` (${lead.reviewCount})`}
                  </span>
                </td>
                <td className={styles.td}>
                  <span className={styles.badge} style={{
                    background: lead.hasWebsite === "Yes" ? "#d1fae5" : "#fee2e2",
                    color: lead.hasWebsite === "Yes" ? "#065f46" : "#991b1b"
                  }}>
                    {lead.hasWebsite === "Yes" ? "✓ Yes" : "✗ No"}
                  </span>
                </td>
                <td className={styles.td}>
                  {lead.issuesFound && lead.issuesFound !== "None"
                    ? <span className={styles.issues}>
                        {lead.issuesFound.split(",").slice(0, 2).map(s => s.trim()).join(", ")}
                        {lead.issuesFound.split(",").length > 2 && ` +${lead.issuesFound.split(",").length - 2}`}
                      </span>
                    : <span className={styles.noIssues}>None</span>}
                </td>
                <td className={styles.td}>
                  <ScoreBadge score={lead.leadScore} />
                </td>
                <td className={styles.td}>
                  <span className={styles.service} style={{
                    background: SERVICE_COLORS[lead.suggestedService]?.bg || "#f1f5f9",
                    color: SERVICE_COLORS[lead.suggestedService]?.color || "#334155"
                  }}>
                    {lead.suggestedService}
                  </span>
                </td>
                <td className={styles.td}>
                  <button className={styles.analyzeBtn} onClick={() => onSelectLead(lead)}>
                    Analyze ↗
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className={styles.empty}>No leads match your search.</div>
        )}
      </div>
    </div>
  );
}
