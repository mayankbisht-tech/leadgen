const BASE = "";  // Uses CRA proxy → http://localhost:5000

export async function generateLeads({ category, location, count = 30 }) {
  const res = await fetch(`${BASE}/api/generate-leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, location, count }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Server error");
  return data;
}

export async function analyzeLead(lead) {
  const res = await fetch(`${BASE}/api/analyze-lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Analysis failed");
  return data.analysis;
}

export async function healthCheck() {
  const res = await fetch(`${BASE}/api/health`);
  return res.json();
}
