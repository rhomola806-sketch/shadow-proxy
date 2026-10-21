/*
 * To enable search:
 * 1. Create a Google Cloud project and enable YouTube Data API v3.
 * 2. Create an API key and restrict it to YouTube Data API v3.
 * 3. Set YOUTUBE_API_KEY as an environment variable on the server/hosting service.
 *    The included server.js endpoint keeps the key out of browser code.
 *
 * The frontend supports Google's YouTube Data API v3 response shape.
 */
const SEARCH_API_ENDPOINT = "/api/search";
const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const player = document.querySelector("#player");
const placeholder = document.querySelector("#player-placeholder");
const nowPlaying = document.querySelector("#now-playing");
const results = document.querySelector("#results");
const message = document.querySelector("#message");
const resultCount = document.querySelector("#result-count");
document.querySelector("#year").textContent = new Date().getFullYear();

function getVideoId(raw) {
  try {
    const url = new URL(raw);
    if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) return parts[1] || null;
    }
  } catch (_) {
    // Not a URL; caller may treat it as a search query.
  }
  return null;
}

function playVideo(id, title = "Selected video") {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    showMessage("That doesn't look like a valid YouTube video ID or link. Try a full YouTube URL.");
    return;
  }
  player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  player.hidden = false;
  placeholder.hidden = true;
  nowPlaying.textContent = `NOW PLAYING // ${title}`;
  document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showMessage(text) {
  message.hidden = false;
  message.textContent = text;
}

function renderVideos(items) {
  results.replaceChildren();
  const videos = (items || []).map(item => {
    const snippet = item.snippet || {};
    const id = typeof item.id === "string" ? item.id : item.id?.videoId;
    return { id, title: snippet.title || "Untitled video", channel: snippet.channelTitle || "YouTube", thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "" };
  }).filter(video => video.id && /^[A-Za-z0-9_-]{11}$/.test(video.id));

  resultCount.textContent = `${videos.length} RESULTS`;
  if (!videos.length) {
    showMessage("No videos found. Try another search, or paste a YouTube video URL.");
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
    img.src = video.thumbnail || `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`;
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
    card.addEventListener("click", () => playVideo(video.id, video.title));
    results.append(card);
  }
}

async function searchVideos(query) {
  if (!SEARCH_API_ENDPOINT) {
    showMessage("Search isn't connected yet. To enable it, configure a backend endpoint using the YouTube Data API v3. You can still paste a YouTube video URL above and play supported embeds.");
    return;
  }
  showMessage("Searching YouTube...");
  resultCount.textContent = "SEARCHING";
  try {
    const response = await fetch(`${SEARCH_API_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      headers: { "Accept": "application/json" }
    });
    if (!response.ok) throw new Error(`Search service returned ${response.status}`);
    const data = await response.json();
    renderVideos(data.items || []);
  } catch (error) {
    resultCount.textContent = "ERROR";
    showMessage(`Search failed: ${error.message}. Check your YouTube API key, API quota, and hosting setup.`);
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  const id = getVideoId(query);
  if (id) {
    playVideo(id, "YouTube link");
    return;
  }
  searchVideos(query);
});

// Optional: load a video link from ?v=VIDEO_ID
const initialId = new URLSearchParams(location.search).get("v");
if (initialId) playVideo(initialId);
