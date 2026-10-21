
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

function getVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    let id = null;

    if (host === "youtu.be" || host === "www.youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0];
    } else if (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com")
    ) {
      if (url.pathname === "/watch") {
        id = url.searchParams.get("v");
      } else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live", "v"].includes(parts[0])) {
          id = parts[1];
        }
      }
    }

    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function isGoogleHost(host) {
  return host === "google.com" || host.endsWith(".google.com");
}

function isYouTubeHost(host) {
  return host === "youtu.be" ||
    host === "www.youtu.be" ||
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com");
}

async function handleResolve(url, res) {
  const raw = url.searchParams.get("url");

  if (!raw || raw.length > 4096) {
    return sendJson(res, 400, {
      error: "Provide a Google redirect URL."
    });
  }

  let current;

  try {
    current = new URL(raw);
  } catch {
    return sendJson(res, 400, {
      error: "That URL is not valid."
    });
  }

  // Only accept Google redirect links as input.
  if (
    current.protocol !== "https:" ||
    !isGoogleHost(current.hostname) ||
    !["/goto", "/url"].includes(current.pathname)
  ) {
    return sendJson(res, 400, {
      error: "Only supported Google redirect links can be resolved."
    });
  }

  // If Google embeds an ordinary destination URL, inspect it first.
  for (const key of ["url", "q", "u", "target", "continue"]) {
    const destination = current.searchParams.get(key);
    if (!destination) continue;

    try {
      const candidate = new URL(destination);
      const id = getVideoId(candidate.href);
      if (id) return sendJson(res, 200, { videoId: id });
    } catch {
      // Try the redirect itself below.
    }
  }

  // Follow a limited number of redirects, only through trusted hosts.
  try {
    for (let i = 0; i < 5; i++) {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(7000),
        headers: { "User-Agent": "ShadowProxy/1.0" }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) break;

        const next = new URL(location, current);

        if (next.protocol !== "https:") break;

        if (isYouTubeHost(next.hostname)) {
          const id = getVideoId(next.href);
          if (id) return sendJson(res, 200, { videoId: id });
          break;
        }

        if (!isGoogleHost(next.hostname)) break;

        current = next;
        continue;
      }

      // Some redirect endpoints return an HTML page instead of redirecting.
      // Do not parse arbitrary HTML or execute scripts from it.
      break;
    }
  } catch {
    // Network errors are reported below.
  }

  return sendJson(res, 422, {
    error:
      "Google did not provide a recognizable YouTube destination. " +
      "Some opaque Google redirect tokens cannot be resolved automatically. " +
      "Open the link and copy the direct YouTube URL instead."
  });
}

async function handleSearch(url, res) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return sendJson(res, 503, {
      error: "Search is not configured. Add YOUTUBE_API_KEY in Render."
    });
  }

  const query = (url.searchParams.get("q") || "").trim().slice(0, 150);

  if (!query) {
    return sendJson(res, 400, { error: "Missing search query." });
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

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000)
    });

    const data = await response.json();

    if (!response.ok) {
      return sendJson(res, response.status === 403 ? 502 : response.status, {
        error: data?.error?.message || "YouTube search failed."
      });
    }

    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    });
    res.end(JSON.stringify({ items: data.items || [] }));
  } catch {
    return sendJson(res, 502, {
      error: "Could not reach YouTube search. Try again later."
    });
  }
}

const server = http.createServer(async (req, res) => {
  let url;

  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return sendJson(res, 400, { error: "Invalid request URL." });
  }

  if (req.method === "GET" && url.pathname === "/api/search") {
    return handleSearch(url, res);
  }

  if (req.method === "GET" && url.pathname === "/api/resolve") {
    return handleResolve(url, res);
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8",
      "Allow": "GET, HEAD"
    });
    return res.end("Method not allowed");
  }

  let relativePath;

  try {
    relativePath = url.pathname === "/"
      ? "index.html"
      : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    res.writeHead(400);
    return res.end("Invalid path");
  }

  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (
    !filePath.startsWith(PUBLIC_DIR + path.sep) &&
    filePath !== path.join(PUBLIC_DIR, "index.html")
  ) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Content-Security-Policy":
        "default-src 'self'; " +
        "img-src 'self' https://i.ytimg.com https://*.ytimg.com data:; " +
        "style-src 'self'; script-src 'self'; " +
        "frame-src https://www.youtube-nocookie.com https://www.youtube.com; " +
        "connect-src 'self' https://www.googleapis.com"
    });

    if (req.method === "HEAD") return res.end();
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Shadow Proxy is running on port ${PORT}`);
});
