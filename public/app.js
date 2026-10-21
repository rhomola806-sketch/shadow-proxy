
/*
 * SHADOW PROXY - APP.JS
 * Supports:
 * - YouTube video links
 * - YouTube Shorts and Live links
 * - Google redirect links using /api/resolve
 * - YouTube search using /api/search
 */

const SEARCH_API_ENDPOINT = "/api/search";
const RESOLVE_API_ENDPOINT = "/api/resolve";

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const player = document.querySelector("#player");
const placeholder = document.querySelector("#player-placeholder");
const nowPlaying = document.querySelector("#now-playing");
const results = document.querySelector("#results");
const message = document.querySelector("#message");
const resultCount = document.querySelector("#result-count");

document.querySelector("#year").textContent =
  new Date().getFullYear();

// Extract a YouTube video ID from supported direct links.
function getVideoId(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be" || host === "www.youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }

    const youtubeHosts = [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtube-nocookie.com",
      "www.youtube-nocookie.com"
    ];

    if (youtubeHosts.includes(host)) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }

      const parts = url.pathname.split("/").filter(Boolean);

      if (["embed", "shorts", "live", "v"].includes(parts[0])) {
        return parts[1] || null;
      }
    }
  } catch (_) {
    // The input may be a search query instead of a URL.
  }

  return null;
}

// Display a YouTube video in the embedded player.
function playVideo(id, title = "Selected video") {
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    showMessage(
      "That doesn't look like a valid YouTube video ID. Try another link."
    );
    return;
  }

  player.src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;

  player.hidden = false;
  placeholder.hidden = true;
  nowPlaying.textContent = `NOW PLAYING // ${title}`;

  resultCount.textContent = "VIDEO READY";
  message.hidden = true;

  document.querySelector(".workspace").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

// Display a message to the user.
function showMessage(text) {
  message.hidden = false;
  message.textContent = text;
}

// Resolve Google redirect URLs using the server endpoint.
async function resolveGoogleRedirect(rawUrl) {
  const response = await fetch(
    `${RESOLVE_API_ENDPOINT}?url=${encodeURIComponent(rawUrl)}`,
    {
      headers: { Accept: "application/json" }
    }
  );

  let data;

  try {
    data = await response.json();
  } catch (_) {
    throw new Error("The resolver returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(
      data.error || `Resolver returned status ${response.status}.`
    );
  }

  if (data.videoId && /^[A-Za-z0-9_-]{11}$/.test(data.videoId)) {
    return data.videoId;
  }

  if (data.url) {
    const resolvedId = getVideoId(data.url);
    if (resolvedId) return resolvedId;
  }

  throw new Error(
    data.error || "Couldn't extract a YouTube video ID from that redirect."
  );
}

// Create the YouTube search result cards.
function renderVideos(items) {
  results.replaceChildren();

  const videos = (items || [])
    .map(item => {
      const snippet = item.snippet || {};
      const id =
        typeof item.id === "string"
          ? item.id
          : item.id?.videoId;

      return {
        id,
        title: snippet.title || "Untitled video",
        channel: snippet.channelTitle || "YouTube",
        thumbnail:
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          ""
      };
    })
    .filter(video =>
      video.id && /^[A-Za-z0-9_-]{11}$/.test(video.id)
    );

  resultCount.textContent = `${videos.length} RESULTS`;

  if (!videos.length) {
    showMessage(
      "No videos found. Try another search or paste a YouTube URL."
    );
    return;
  }

  message.hidden = true;

  for (const video of videos) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "video-card";
    card.setAttribute("aria-label", `Play ${video.title}`);

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.src =
      video.thumbnail ||
      `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;

    const info = document.createElement("div");
    info.className = "video-info";

    const title = document.createElement("p");
    title.className = "video-title";
    title.textContent = video.title;

    const channel = document.createElement("div");
    channel.className = "video-channel";
    channel.textContent = video.channel;

    info.append(title, channel);
    card.append(img, info);

    card.addEventListener("click", () => {
      playVideo(video.id, video.title);
    });

    results.append(card);
  }
}

// Search YouTube through the backend.
async function searchVideos(query) {
  showMessage("Searching YouTube...");
  resultCount.textContent = "SEARCHING";

  try {
    const response = await fetch(
      `${SEARCH_API_ENDPOINT}?q=${encodeURIComponent(query)}`,
      {
        headers: { Accept: "application/json" }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || `Search service returned ${response.status}.`
      );
    }

    renderVideos(data.items || []);
  } catch (error) {
    resultCount.textContent = "ERROR";
    showMessage(
      `Search failed: ${error.message} Check your YouTube API key, quota, and hosting setup.`
    );
  }
}

// Handle submitted video links, Google redirects, and search queries.
form.addEventListener("submit", async event => {
  event.preventDefault();

  const query = input.value.trim();
  if (!query) return;

  // First, try to extract a direct YouTube video ID.
  const directId = getVideoId(query);

  if (directId) {
    playVideo(directId, "YouTube link");
    return;
  }

  // Check whether the input is a URL.
  let url;

  try {
    url = new URL(query);
  } catch (_) {
    // Not a URL, so treat it as a search query.
    searchVideos(query);
    return;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    showMessage("Please enter a valid web link or search query.");
    return;
  }

  const host = url.hostname.toLowerCase();

  // Google redirect URLs need server-side resolution.
  const isGoogleHost =
    host === "google.com" ||
    host.endsWith(".google.com");

  if (isGoogleHost) {
    showMessage("Resolving Google redirect...");
    resultCount.textContent = "RESOLVING";

    try {
      const id = await resolveGoogleRedirect(query);
      playVideo(id, "Resolved YouTube link");
    } catch (error) {
      resultCount.textContent = "ERROR";
      showMessage(
        `${error.message} Try opening the link and copying the direct YouTube URL.`
      );
    }

    return;
  }

  // Don't accidentally search for a URL that couldn't be parsed.
  showMessage(
    "Couldn't recognize that video link. Try a direct YouTube URL."
  );
});

// Allow a direct video ID through the ?v= parameter.
const initialId = new URLSearchParams(location.search).get("v");

if (initialId) {
  playVideo(initialId, "Shared video");
}
