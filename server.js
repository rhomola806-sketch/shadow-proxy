const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function handleSearch(url, res) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({
      error: "Search is not configured. Add a YOUTUBE_API_KEY environment variable on your hosting service."
    }));
  }

  const query = (url.searchParams.get("q") || "").trim().slice(0, 150);
  if (!query) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "Missing search query." }));
  }

  try {
    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    apiUrl.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "12",
      safeSearch: "moderate",
      q: query,
      key: apiKey
    }).toString();

    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || "YouTube search request failed.";
      res.writeHead(response.status === 403 ? 502 : response.status, {
        "Content-Type": "application/json; charset=utf-8"
      });
      return res.end(JSON.stringify({ error: message }));
    }

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    });
    res.end(JSON.stringify({ items: data.items || [] }));
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Could not reach YouTube search. Try again later." }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/search") {
    return handleSearch(url, res);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", "Allow": "GET, HEAD" });
    return res.end("Method not allowed");
  }

  // Serve only files in /public. This server does not relay arbitrary URLs.
  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' https://i.ytimg.com https://*.ytimg.com data:; style-src 'self'; script-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; connect-src 'self' https://www.googleapis.com"
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Shadow Proxy is running on port ${PORT}`);
});