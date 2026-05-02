import React, { useState, useRef, useEffect } from "react";
import LeadTable from "./LeadTable";
import LeadModal from "./LeadModal";
import { generateLeads } from "./api";
import { downloadCSV } from "./utils";
import "./App.css";

const CATEGORIES = [
  "Cafes & Coffee Shops", "Restaurants", "Gyms & Fitness Centers",
  "Salons & Spas", "Hospitals & Clinics", "Retail Shops",
  "Hotels & Accommodation", "Real Estate Agencies", "Law Firms",
  "Dental Clinics", "Auto Repair Shops", "Bakeries",
  "Educational Institutes", "Photography Studios", "Event Planners",
  "Catering Services", "Interior Designers", "Travel Agencies",
  "Coaching Centers", "Pharmacies",
];

const STEPS = [
  { id: 1, label: "Discovery",  icon: "◎" },
  { id: 2, label: "Extraction", icon: "⬡" },
  { id: 3, label: "Analysis",   icon: "◈" },
  { id: 4, label: "Scoring",    icon: "◆" },
  { id: 5, label: "Export",     icon: "▣" },
];

export default function App() {
  const [category, setCategory]         = useState("");
  const [customCat, setCustomCat]       = useState("");
  const [location, setLocation]         = useState("");
  const [count, setCount]               = useState(30);
  const [loading, setLoading]           = useState(false);
  const [step, setStep]                 = useState(0);
  const [leads, setLeads]               = useState([]);
  const [summary, setSummary]           = useState(null);
  const [log, setLog]                   = useState([]);
  const [activeTab, setActiveTab]       = useState("all");
  const [error, setError]               = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const addLog = (msg, type = "info") =>
    setLog(prev => [...prev, { msg, type, ts: new Date().toLocaleTimeString() }]);

  const finalCategory = category === "__custom__" ? customCat : category;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const runAgent = async () => {
    if (!finalCategory.trim()) { setError("Please select or enter a business category."); return; }
    if (!location.trim())      { setError("Please enter a target location."); return; }
    setError(""); setLeads([]); setSummary(null); setLog([]); setLoading(true);

    try {
      setStep(1); addLog(`Discovering "${finalCategory}" businesses in "${location}"...`);
      await sleep(500);
      setStep(2); addLog("Extracting real business listings and contact data...");
      await sleep(400);
      setStep(3); addLog("Checking public website data when available...");
      await sleep(400);
      setStep(4); addLog("Scoring leads using real business signals...");

      const result = await generateLeads({ category: finalCategory, location, count });

      setLeads(result.leads);
      setSummary(result.summary);
      setStep(5);
      addLog(`✓ ${result.leads.length} businesses discovered`, "success");
      addLog(`✓ ${result.summary.noWebsite} with NO website`, "success");
      addLog(`✓ ${result.summary.needsImprovement} needing improvement`, "success");
      addLog(`✓ ${result.summary.highPriority} high-priority leads (score ≥7)`, "success");
      addLog(`✓ Average lead score: ${result.summary.avgScore}/10`, "success");
      addLog("✓ CSV export ready — 3 files available", "success");
    } catch (err) {
      addLog(`✗ ${err.message}`, "error");
      setError(err.message);
      setStep(0);
    }
    setLoading(false);
  };

  const filteredLeads = activeTab === "no-website"
    ? leads.filter(l => l.hasWebsite === "No")
    : activeTab === "improve"
    ? leads.filter(l => l.hasWebsite === "Yes" && l.needsImprovement === "Yes")
    : leads;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">⚡</div>
            <div>
              <h1 className="logo-title">LeadGen AI Agent</h1>
              <p className="logo-sub">Web Dev · App Dev · AI Chatbot Lead Discovery</p>
            </div>
          </div>
          <span className="powered-badge">Powered by Groq + public listings</span>
        </div>
      </header>

      <main className="main">

        {/* Config panel */}
        <section className="card config-card">
          <h2 className="section-title">Configure Your Search</h2>
          <div className="config-grid">
            <div className="field-group">
              <label className="label">Business Category</label>
              <select className="select" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">Select a category...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">+ Custom Category</option>
              </select>
              {category === "__custom__" && (
                <input className="input" style={{ marginTop: 8 }} placeholder="Enter category..."
                  value={customCat} onChange={e => setCustomCat(e.target.value)} />
              )}
            </div>

            <div className="field-group">
              <label className="label">Target Location</label>
              <input className="input" placeholder="e.g. Delhi, Mumbai, Bangalore, Pune..."
                value={location} onChange={e => setLocation(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runAgent()} />
            </div>

            <div className="field-group">
              <label className="label">Number of Leads</label>
              <select className="select" value={count} onChange={e => setCount(Number(e.target.value))}>
                <option value={10}>10 leads</option>
                <option value={20}>20 leads</option>
                <option value={30}>30 leads (recommended)</option>
                <option value={50}>50 leads</option>
                <option value={80}>80 leads (max)</option>
              </select>
            </div>

            <div className="field-group" style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="run-btn" onClick={runAgent} disabled={loading}>
                {loading ? <><span className="btn-spinner" /> Running...</> : "⚡ Run Agent"}
              </button>
            </div>
          </div>
          {error && <p className="error-msg">{error}</p>}
        </section>

        {/* Progress */}
        {step > 0 && (
          <section className="card">
            <div className="steps">
              {STEPS.map((s, i) => {
                const done   = step > s.id;
                const active = step === s.id;
                return (
                  <React.Fragment key={s.id}>
                    <div className="step">
                      <div className={`step-circle ${done ? "done" : active ? "active" : ""}`}>
                        {done ? "✓" : s.icon}
                      </div>
                      <span className={`step-label ${active ? "active" : done ? "done" : ""}`}>{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`step-line ${done ? "done" : ""}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="terminal" ref={logRef}>
              {log.map((l, i) => (
                <div key={i} className={`log-line ${l.type}`}>
                  <span className="log-ts">[{l.ts}]</span> {l.msg}
                </div>
              ))}
              {loading && <span className="cursor">▋</span>}
            </div>
          </section>
        )}

        {/* Summary stats */}
        {summary && (
          <div className="stats-grid">
            {[
              { label: "Total Leads",       value: summary.total,           accent: "#6366f1" },
              { label: "No Website",        value: summary.noWebsite,       accent: "#ef4444" },
              { label: "Need Improvement",  value: summary.needsImprovement,accent: "#f59e0b" },
              { label: "High Priority",     value: summary.highPriority,    accent: "#10b981" },
              { label: "Avg Lead Score",    value: `${summary.avgScore}/10`,accent: "#3b82f6" },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <span className="stat-label">{s.label}</span>
                <span className="stat-value" style={{ color: s.accent }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabs + Export + Table */}
        {leads.length > 0 && (
          <section className="card">
            <div className="table-toolbar">
              <div className="tabs">
                {[["all","All Leads"], ["no-website","No Website"], ["improve","Needs Improvement"]].map(([id, label]) => (
                  <button key={id} className={`tab ${activeTab === id ? "active" : ""}`}
                    onClick={() => setActiveTab(id)}>{label}</button>
                ))}
              </div>
              <div className="export-btns">
                <button className="export-btn" onClick={() => downloadCSV(leads, `all_leads_${finalCategory.replace(/ /g,"_")}.csv`)}>
                  ↓ All CSV
                </button>
                <button className="export-btn red" onClick={() => downloadCSV(leads.filter(l => l.hasWebsite==="No"), "no_website_leads.csv")}>
                  ↓ No Website
                </button>
                <button className="export-btn amber" onClick={() => downloadCSV(leads.filter(l => l.needsImprovement==="Yes"), "improvement_leads.csv")}>
                  ↓ Improvement
                </button>
              </div>
            </div>
            <LeadTable leads={filteredLeads} onSelectLead={setSelectedLead} />
          </section>
        )}

        {/* Empty state */}
        {leads.length === 0 && step === 0 && (
          <section className="card empty-state">
            <div className="empty-icon">⚡</div>
            <h2>Ready to discover leads</h2>
            <p>Select a business category and location, then run the agent to pull scored, export-ready leads from real public business listings.</p>
            <div className="service-pills">
              {["Website Dev", "App Dev", "AI Chatbot", "SEO"].map(s => (
                <span key={s} className="pill">{s}</span>
              ))}
            </div>
          </section>
        )}
      </main>

      {selectedLead && (
        <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  );
}
