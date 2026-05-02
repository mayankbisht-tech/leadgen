require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(
  /\/$/,
  ""
);
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_DATASET_ID = process.env.APIFY_DATASET_ID || "";
const APIFY_RUN_ID = process.env.APIFY_RUN_ID || "";
const APIFY_DATASET_URL = process.env.APIFY_DATASET_URL || "";
const APIFY_MAX_ITEMS = parseInt(process.env.APIFY_MAX_ITEMS || "1000", 10);
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || "12000", 10);

function getCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || "";
  if (raw.trim()) {
    const origins = raw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    return origins.length > 0 ? origins : false;
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return ["http://localhost:3000", "http://127.0.0.1:3000"];
}

// Groq client helpers
async function callGroqChat({ messages, maxTokens, temperature = 0.2 }) {
  if (!GROQ_API_KEY) {
    const err = new Error("Missing Groq API key. Add GROQ_API_KEY to server/.env.");
    err.status = 500;
    throw err;
  }

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }

  if (!response.ok) {
    const detail =
      data?.error?.message || data?.message || data?.raw || `Groq request failed with ${response.status}`;
    const err = new Error(detail);
    err.status = response.status;
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("");
  }

  return "";
}

function extractJsonText(rawText) {
  return String(rawText || "").replace(/```json|```/g, "").trim();
}

function parseJsonResponse(rawText, fallbackErrorMessage) {
  const clean = extractJsonText(rawText);
  try {
    return JSON.parse(clean);
  } catch {
    const err = new Error(fallbackErrorMessage);
    err.status = 500;
    throw err;
  }
}

function withTimeout(ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

function pickFirstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return "";
}

function toText(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    return value.map((v) => toText(v)).filter(Boolean).join(", ");
  }
  return String(value).trim();
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchTextJson(url, options = {}) {
  const { signal, cleanup } = withTimeout(options.timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal,
      headers: {
        "User-Agent": "leadgen-app/1.0",
        ...(options.headers || {}),
      },
    });

    const raw = await response.text();
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }
    }

    if (!response.ok) {
      const detail =
        data?.error?.message || data?.message || data?.raw || `Request failed with ${response.status}`;
      const err = new Error(detail);
      err.status = response.status;
      throw err;
    }

    return data;
  } finally {
    cleanup();
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeWebsite(url) {
  const value = normalizeText(url);
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[^\s]+\.[^\s]{2,}(\/.*)?$/i.test(value)) return `https://${value}`;
  return "";
}

function inferSuggestedService(record) {
  const category = `${record.category || ""} ${record.businessName || ""}`.toLowerCase();
  if (!record.website || record.website === "N/A") return "Website Dev";
  if (record.issuesFound && record.issuesFound !== "None") {
    if (/booking|appointment|reservation|clinic|salon|spa|hotel|restaurant/.test(category)) {
      return "Full Digital Suite";
    }
    if (/app|mobile/.test(category)) return "App Dev";
    if (/seo|search/.test(category)) return "SEO";
    if (/chatbot|bot/.test(category)) return "Chatbot";
    return "Website Dev";
  }
  if (/app|mobile/.test(category)) return "App Dev";
  if (/chatbot|bot/.test(category)) return "Chatbot";
  if (/seo|search|marketing/.test(category)) return "SEO";
  return "Full Digital Suite";
}

function scoreLead(record) {
  if (!record.website || record.website === "N/A") return 9;
  const rating = typeof record.googleRating === "number" ? record.googleRating : null;
  const reviews = typeof record.reviewCount === "number" ? record.reviewCount : null;
  const issues = record.issuesFound && record.issuesFound !== "None"
    ? record.issuesFound.split(",").map((s) => s.trim()).filter(Boolean).length
    : 0;

  if (issues >= 3) return 8;
  if (issues >= 1) return 6;
  if (rating !== null && rating < 4.0) return 6;
  if (reviews !== null && reviews < 25) return 5;
  return 4;
}

function normalizeApifyItemsUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  if (/\/key-value-stores\//i.test(value)) {
    const err = new Error(
      "APIFY_DATASET_URL points to a key-value store. Use a dataset items URL or a dataset/run ID instead."
    );
    err.status = 400;
    throw err;
  }

  const actorRunMatch = value.match(/\/actor-runs\/([^/?#]+)/i);
  if (actorRunMatch) {
    return `https://api.apify.com/v2/actor-runs/${actorRunMatch[1]}/dataset/items`;
  }

  const datasetMatch = value.match(/\/datasets\/([^/?#]+)/i);
  if (datasetMatch) {
    return `https://api.apify.com/v2/datasets/${datasetMatch[1]}/items`;
  }

  if (/\/datasets\/[^/?#]+\/items/i.test(value)) {
    return value;
  }

  return value;
}

function buildApifyItemsUrl() {
  if (APIFY_DATASET_URL) {
    const url = new URL(normalizeApifyItemsUrl(APIFY_DATASET_URL));
    if (APIFY_TOKEN && !url.searchParams.has("token")) {
      url.searchParams.set("token", APIFY_TOKEN);
    }
    if (!url.searchParams.has("format")) url.searchParams.set("format", "json");
    if (!url.searchParams.has("clean")) url.searchParams.set("clean", "true");
    if (!url.searchParams.has("limit")) url.searchParams.set("limit", String(APIFY_MAX_ITEMS));
    return url.toString();
  }

  if (APIFY_RUN_ID) {
    const url = new URL(`https://api.apify.com/v2/actor-runs/${APIFY_RUN_ID}/dataset/items`);
    if (APIFY_TOKEN) url.searchParams.set("token", APIFY_TOKEN);
    url.searchParams.set("format", "json");
    url.searchParams.set("clean", "true");
    url.searchParams.set("limit", String(APIFY_MAX_ITEMS));
    return url.toString();
  }

  if (APIFY_DATASET_ID) {
    const url = new URL(`https://api.apify.com/v2/datasets/${APIFY_DATASET_ID}/items`);
    if (APIFY_TOKEN) url.searchParams.set("token", APIFY_TOKEN);
    url.searchParams.set("format", "json");
    url.searchParams.set("clean", "true");
    url.searchParams.set("limit", String(APIFY_MAX_ITEMS));
    return url.toString();
  }

  return "";
}

function normalizeApifyItem(item, index, category, location) {
  const name = toText(
    pickFirstValue(item, ["businessName", "name", "title", "placeName", "primaryText"])
  );
  const website = normalizeWebsite(
    toText(pickFirstValue(item, ["website", "websiteUrl", "url", "contactWebsite", "websiteLink"]))
  );
  const phone = toText(
    pickFirstValue(item, ["phone", "phoneNumber", "formattedPhoneNumber", "contactPhone"])
  );
  const email = toText(pickFirstValue(item, ["email", "contactEmail"])) || "N/A";
  const rating = toNumber(pickFirstValue(item, ["googleRating", "rating", "stars", "score"]));
  const reviews = toNumber(pickFirstValue(item, ["reviewCount", "reviews", "userRatingsTotal"]));
  const itemCategory = toText(
    pickFirstValue(item, ["category", "categoryName", "primaryType", "type", "types"])
  );
  const itemLocation = toText(
    pickFirstValue(item, ["location", "address", "formattedAddress", "fullAddress", "addressText"])
  );
  const socialMedia = toText(
    pickFirstValue(item, ["instagramUrl", "facebookUrl", "linkedinUrl", "socialMedia"])
  ) || "N/A";
  const combined = `${name} ${itemCategory} ${itemLocation} ${website}`.toLowerCase();
  const issues = [];

  if (!website) issues.push("No website");
  if (website && website.startsWith("http://")) issues.push("No SSL");
  if (!phone) issues.push("No phone");
  if (rating !== null && rating < 4.0) issues.push("Low rating");
  if (reviews !== null && reviews < 25) issues.push("Few reviews");
  if (/closed|temporarily closed|permanently closed/.test(combined)) issues.push("Closed listing");

  const normalizedCategory = itemCategory || category;
  const normalizedLocation = itemLocation || location;

  return {
    id: index + 1,
    businessName: name || `Business ${index + 1}`,
    category: normalizedCategory,
    location: normalizedLocation,
    phone: phone || "N/A",
    email,
    website: website || "N/A",
    hasWebsite: website ? "Yes" : "No",
    needsImprovement: issues.length > 0 ? "Yes" : "No",
    googleRating: rating !== null ? rating : "N/A",
    reviewCount: reviews !== null ? reviews : "N/A",
    issuesFound: issues.length > 0 ? issues.slice(0, 4).join(", ") : "None",
    socialMedia,
    leadScore: 0,
    suggestedService: "Website Dev",
    _relevance: 0,
  };
}

function textMatches(haystack, needles) {
  const cleanHaystack = String(haystack || "").toLowerCase();
  if (!cleanHaystack) return 0;
  return needles.reduce((score, needle) => {
    if (!needle) return score;
    return cleanHaystack.includes(needle) ? score + 1 : score;
  }, 0);
}

function rankApifyLead(lead, category, location) {
  const haystack = `${lead.businessName} ${lead.category} ${lead.location} ${lead.website}`.toLowerCase();
  const categoryTokens = category
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
  const locationTokens = location
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);

  let relevance = 0;
  relevance += textMatches(haystack, categoryTokens) * 3;
  relevance += textMatches(haystack, locationTokens) * 2;
  if (lead.website && lead.website !== "N/A") relevance += 2;
  if (lead.googleRating !== "N/A") relevance += 1;
  if (lead.reviewCount !== "N/A") relevance += 1;

  return relevance;
}

async function fetchApifyBusinesses(category, location, count) {
  const itemsUrl = buildApifyItemsUrl();
  if (!itemsUrl) {
    const err = new Error(
      "Set APIFY_TOKEN and APIFY_DATASET_ID, APIFY_RUN_ID, or APIFY_DATASET_URL in server/.env."
    );
    err.status = 500;
    throw err;
  }

  let items;
  try {
    items = await fetchTextJson(itemsUrl, { timeoutMs: 20000 });
  } catch (err) {
    if (err.status === 401) {
      const authErr = new Error(
        "Apify rejected the request. Check APIFY_TOKEN in server/.env and confirm the dataset or run is accessible."
      );
      authErr.status = 401;
      authErr.source = "apify";
      throw authErr;
    }
    throw err;
  }
  const rawItems = Array.isArray(items) ? items : Array.isArray(items?.items) ? items.items : [];

  if (rawItems.length === 0) {
    const err = new Error("Apify returned no business records.");
    err.status = 404;
    throw err;
  }

  const normalized = rawItems.map((item, index) => normalizeApifyItem(item, index, category, location));
  const ranked = normalized
    .map((lead) => ({ ...lead, _relevance: rankApifyLead(lead, category, location) }))
    .sort((a, b) => {
      if (b._relevance !== a._relevance) return b._relevance - a._relevance;
      const aScore = typeof a.googleRating === "number" ? a.googleRating : -1;
      const bScore = typeof b.googleRating === "number" ? b.googleRating : -1;
      return bScore - aScore;
    });

  return ranked.slice(0, Math.max(count, 1));
}

async function fetchRealBusinesses(category, location, count) {
  return fetchApifyBusinesses(category, location, count);
}

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: getCorsOrigins(),
    credentials: true,
  })
);

// Rate limiter - prevent abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || "50", 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});
app.use("/api/", limiter);

// Serve React build in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../client/build")));
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    apiKey: GROQ_API_KEY ? "configured" : "missing",
    provider: "groq",
    model: GROQ_MODEL,
    dataSource: "apify",
  });
});

// POST /api/generate-leads
app.post("/api/generate-leads", async (req, res) => {
  const { category, location, count } = req.body;

  if (!category || typeof category !== "string" || category.trim().length < 2) {
    return res.status(400).json({ error: "A valid business category is required." });
  }
  if (!location || typeof location !== "string" || location.trim().length < 2) {
    return res.status(400).json({ error: "A valid location is required." });
  }

  const leadCount = Math.min(Math.max(parseInt(count, 10) || 30, 10), 80);

  console.log(
    `[LeadGen] Fetching ${leadCount} real leads | Category: "${category}" | Location: "${location}"`
  );

  try {
    const realLeads = await fetchRealBusinesses(category, location, leadCount);
    const sanitized = realLeads.slice(0, leadCount).map((lead, i) => ({
      id: i + 1,
      businessName: String(lead.businessName || `Business ${i + 1}`),
      category: String(lead.category || category),
      location: String(lead.location || location),
      phone: String(lead.phone || "N/A"),
      email: String(lead.email || "N/A"),
      website: String(lead.website || "N/A"),
      hasWebsite: lead.hasWebsite === "Yes" ? "Yes" : "No",
      needsImprovement: lead.needsImprovement === "Yes" ? "Yes" : "No",
      googleRating:
        typeof lead.googleRating === "number" ? lead.googleRating : "N/A",
      reviewCount:
        typeof lead.reviewCount === "number" ? lead.reviewCount : "N/A",
      issuesFound: String(lead.issuesFound || "None"),
      leadScore: Math.min(Math.max(parseInt(lead.leadScore, 10) || 5, 1), 10),
      suggestedService: String(lead.suggestedService || "Website Dev"),
      socialMedia: String(lead.socialMedia || "N/A"),
    }));

    console.log(`[LeadGen] Success - ${sanitized.length} real leads returned`);

    res.json({
      success: true,
      count: sanitized.length,
      category,
      location,
      generatedAt: new Date().toISOString(),
      leads: sanitized,
      summary: {
        total: sanitized.length,
        noWebsite: sanitized.filter((l) => l.hasWebsite === "No").length,
        needsImprovement: sanitized.filter((l) => l.hasWebsite === "Yes" && l.needsImprovement === "Yes").length,
        highPriority: sanitized.filter((l) => l.leadScore >= 7).length,
      avgScore: parseFloat(
        (sanitized.reduce((a, b) => a + b.leadScore, 0) / sanitized.length).toFixed(1)
      ),
    },
  });
  } catch (err) {
    if (err.status === 401 && err.source === "apify") {
      return res.status(401).json({ error: err.message });
    }
    if (err.status === 401) {
      return res.status(401).json({ error: "Invalid Groq API key. Check server/.env." });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: "Groq rate limit reached. Please wait and retry." });
    }
    if (err.status === 404) {
      return res.status(404).json({ error: "Could not find real businesses for that location." });
    }
    console.error("[LeadGen] API error:", err.message);
    res.status(500).json({ error: err.message || "Failed to generate leads. Please try again." });
  }
});

// POST /api/analyze-lead
app.post("/api/analyze-lead", async (req, res) => {
  const { lead } = req.body;
  if (!lead || !lead.businessName) {
    return res.status(400).json({ error: "Lead data is required." });
  }

  try {
    const rawText = await callGroqChat({
      maxTokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze this business as a potential freelance client and write a short outreach pitch (max 120 words) that a web/app developer could send as a cold email. Be specific to their industry and pain points.

Business: ${lead.businessName}
Category: ${lead.category}
Location: ${lead.location}
Has Website: ${lead.hasWebsite}
Issues: ${lead.issuesFound}
Suggested Service: ${lead.suggestedService}
Rating: ${lead.googleRating}${lead.reviewCount !== "N/A" ? ` (${lead.reviewCount} reviews)` : ""}

Return JSON only: { "pitch": "...", "subject": "...", "painPoints": ["...", "..."], "approach": "..." }`,
        },
      ],
    });

    const analysis = parseJsonResponse(rawText, "Analysis returned malformed data. Please retry.");
    res.json({ success: true, analysis });
  } catch (err) {
    if (err.status === 401) {
      return res.status(401).json({ error: "Invalid Groq API key. Check server/.env." });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: "Groq rate limit reached. Please wait and retry." });
    }
    console.error("[Analyze] Error:", err.message);
    res.status(500).json({ error: err.message || "Analysis failed. Please retry." });
  }
});

// Catch-all for React in production
if (process.env.NODE_ENV === "production") {
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/build/index.html"));
  });
}

// Start
app.listen(PORT, () => {
  console.log(`\nLeadGen AI Agent server running on http://localhost:${PORT}`);
  console.log(`   Provider: Groq`);
  console.log(`   Model: ${GROQ_MODEL}`);
  console.log(`   API Key: ${GROQ_API_KEY ? "Configured" : "MISSING - add to server/.env"}`);
  console.log(`   Mode: ${process.env.NODE_ENV || "development"}\n`);
});
