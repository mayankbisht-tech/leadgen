export function downloadCSV(data, filename) {
  if (!data || data.length === 0) return;
  const headers = [
    "Business Name", "Category", "Location", "Phone", "Email",
    "Website", "Has Website", "Needs Improvement", "Google Rating",
    "Review Count", "Issues Found", "Lead Score", "Suggested Service", "Social Media"
  ];
  const keys = [
    "businessName", "category", "location", "phone", "email",
    "website", "hasWebsite", "needsImprovement", "googleRating",
    "reviewCount", "issuesFound", "leadScore", "suggestedService", "socialMedia"
  ];
  const rows = data.map(row =>
    keys.map(k => `"${String(row[k] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}
