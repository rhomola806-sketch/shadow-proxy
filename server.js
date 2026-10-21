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

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(data));
}

function isGoogleHost(host) {
  return host === "google.com" || host.endsWith(".google.com");
}

function isYoutubeHost(host) {
  return [
    "youtube.com", "www.youtube.com", "m.youtube.com",
    "youtu.be", "www.youtu.be", "youtube-nocookie.com",
    "www.youtube-nocookie.com"
  ].includes(host);
}

function extractVideoId(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be" || host === "www.youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
    }

    if (isYoutubeHost(host)) {
      let id = null;
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live", "v"].includes(parts[0])) id = parts[1];
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null;
    }
  } catch (_) {}
  return null;
}

async function handleSearch(url, res) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, {
      error: "Search is not configured yet. Add YOUTUBE_API_KEY to your Render environment variables."
    });
  }

  const query = (url.searchParams.get("q") || "").trim().slice(0, 150);
  if (!query) return sendJson(res, 400, { error: "Missing search query." });

  try {
    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    apiUrl.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "15",
      safeSearch: "moderate",
      q: query,
      key: apiKey
    }).toString();

    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    const data = await response.json();

    if (!response.ok) {
      return sendJson(res, response.status === 403 ? 502 : response.status, {
        error: data?.error?.message || "YouTube search request failed."
      });
    }

    return sendJson(res, 200, { items: data.items || [] });
  } catch (_) {
    return sendJson(res, 502, { error: "Could not reach YouTube search. Try again later." });
  }
}

async function handleResolve(url, res) {
  const raw = (url.searchParams.get("url") || "").trim();
  if (!raw || raw.length > 4096) {
    return sendJson(res, 400, { error: "Provide a URL to resolve (maximum 4096 characters)." });
  }

  let target;
  try {
    target = new URL(raw);
  } catch (_) {
    return sendJson(res, 400, { error: "That is not a valid URL." });
  }

  if (target.protocol !== "https:" || !isGoogleHost(target.hostname.toLowerCase())) {
    return sendJson(res, 400, { error: "Only HTTPS Google redirect URLs are accepted." });
  }

  const directParams = ["url", "q", "u", "target", "redirect", "continue"];
  for (const key of directParams) {
    const candidate = target.searchParams.get(key);
    if (candidate) {
      const id = extractVideoId(candidate);
      if (id) return sendJson(res, 200, { videoId: id });
    }
  }

  // Follow a small number of redirects, staying within Google/YouTube domains.
  let current = target;
  try {
    for (let hop = 0; hop < 6; hop++) {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ShadowProxy/2.0)" }
      });

      const location = response.headers.get("location");
      if (location) {
        const next = new URL(location, current);
        const host = next.hostname.toLowerCase();
        if (!(isGoogleHost(host) || isYoutubeHost(host))) {
          return sendJson(res, 400, { error: "Redirect destination is outside supported Google/YouTube domains." });
        }
        const id = extractVideoId(next.href);
        if (id) return sendJson(res, 200, { videoId: id, url: next.href });
        current = next;
        continue;
      }

      // Google sometimes embeds the destination in a page instead of a Location header.
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = (await response.text()).slice(0, 500000);
        const match = html.match(/https?:\\?\/\\?\/(?:www\\?\.|m\\?\.|music\\?\.|youtu\\?\.|)youtube(?:-nocookie)?\\?\.com[^"'<>\\s]*/i)
          || html.match(/https?:\\?\/\\?\/youtu\\?\.be[^"'<>\\s]*/i);
        if (match) {
          const candidate = match[0].replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
          const id = extractVideoId(candidate);
          if (id) return sendJson(res, 200, { videoId: id, url: candidate });
        }
      }
      break;
    }
  } catch (_) {
    return sendJson(res, 502, { error: "Could not resolve that Google redirect. Try copying the final YouTube URL instead." });
  }

  const id = extractVideoId(current.href);
  if (id) return sendJson(res, 200, { videoId: id, url: current.href });

  return sendJson(res, 422, {
    error: "Couldn't extract a YouTube video ID from that link. Some Google redirects use opaque tokens that cannot be resolved automatically."
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch (_) {
    res.writeHead(400);
    return res.end("Bad request");
  }

  if (req.method === "GET" && url.pathname === "/api/search") {
    return handleSearch(url, res);
  }
  if (req.method === "GET" && url.pathname === "/api/resolve") {
    return handleResolve(url, res);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", "Allow": "GET, HEAD" });
    return res.end("Method not allowed");
  }

  let relativePath;
  try {
    relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch (_) {
    res.writeHead(400);
    return res.end("Bad path");
  }

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
    res.end(req.method === "HEAD" ? undefined : data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Shadow Proxy is running on port ${PORT}`);
});
