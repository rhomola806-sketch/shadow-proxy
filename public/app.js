/*
 * SHADOW PROXY // V2.0
 * Created by Rylan Homola.
 * Watch history is stored locally in this browser.
 */

const SEARCH_API_ENDPOINT = "/api/search";
const RESOLVE_API_ENDPOINT = "/api/resolve";
const HISTORY_KEY = "shadowProxyWatchHistoryV1";
const MAX_HISTORY = 30;

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const player = document.querySelector("#player");
const playerWrap = document.querySelector("#player-wrap");
const placeholder = document.querySelector("#player-placeholder");
const nowPlaying = document.querySelector("#now-playing");
const results = document.querySelector("#results");
const message = document.querySelector("#message");
const resultCount = document.querySelector("#result-count");
const historyResults = document.querySelector("#history-results");
const historyEmpty = document.querySelector("#history-empty");
const historyCount = document.querySelector("#history-count");
const clearHistoryButton = document.querySelector("#clear-history");
const nextVideoButton = document.querySelector("#next-video");
const doomToggle = document.querySelector("#doom-toggle");
const doomStatus = document.querySelector("#doom-status");
const miniToggle = document.querySelector("#miniplayer-toggle");
const miniClose = document.querySelector("#mini-close");


let currentVideos = [];
let currentVideoIndex = -1;
let doomScrolling = false;
let doomTimer = null;

function getVideoId(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be" || host === "www.youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }

    const hosts = [
      "youtube.com", "www.youtube.com", "m.youtube.com",
      "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"
    ];

    if (hosts.includes(host)) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live", "v"].includes(parts[0])) return parts[1] || null;
    }
  } catch (_) {}
  return null;
}

function showMessage(text) {
  message.hidden = false;
  message.textContent = text;
}

function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => item && validId(item.id)) : [];
  } catch (_) {
    return [];
  }
}

function saveHistory(video) {
  const previous = readHistory().filter(item => item.id !== video.id);
  previous.unshift({
    id: video.id,
    title: video.title || "YouTube video",
    channel: video.channel || "YouTube",
    watchedAt: Date.now()
  });
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(previous.slice(0, MAX_HISTORY)));
  } catch (_) {}
  renderHistory();
}

function renderHistory() {
  const history = readHistory();
  historyResults.replaceChildren();
  historyCount.textContent = `${history.length} SAVED`;
  historyEmpty.hidden = history.length > 0;

  for (const video of history) {
    const card = createVideoCard({
      ...video,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`
    });
    const watched = document.createElement("div");
    watched.className = "video-channel";
    watched.textContent = `WATCHED ${new Date(video.watchedAt).toLocaleString()}`;
    card.querySelector(".video-info").append(watched);
    historyResults.append(card);
  }
}

function createVideoCard(video) {
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
  title.textContent = video.title || "Untitled video";

  const channel = document.createElement("div");
  channel.className = "video-channel";
  channel.textContent = video.channel || "YouTube";

  info.append(title, channel);
  card.append(img, info);
  card.addEventListener("click", () => playVideo(video.id, video.title, video.channel));
  return card;
}

function playVideo(id, title = "Selected video", channel = "YouTube", addToHistory = true) {
  if (!validId(id)) {
    showMessage("That doesn't look like a valid YouTube video ID or link.");
    return;
  }

  player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
  player.hidden = false;
  placeholder.hidden = true;
  nowPlaying.textContent = `NOW PLAYING // ${title}`;
  message.hidden = true;

  const knownIndex = currentVideos.findIndex(video => video.id === id);
  currentVideoIndex = knownIndex;
  nextVideoButton.disabled = currentVideos.length < 2;
  if (addToHistory) saveHistory({ id, title, channel });

  if (!playerWrap.classList.contains("is-mini")) {
    document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function resolveGoogleRedirect(rawUrl) {
  const response = await fetch(`${RESOLVE_API_ENDPOINT}?url=${encodeURIComponent(rawUrl)}`, {
    headers: { Accept: "application/json" }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Resolver returned ${response.status}.`);
  if (validId(data.videoId)) return data.videoId;
  if (data.url) {
    const id = getVideoId(data.url);
    if (id) return id;
  }
  throw new Error(data.error || "Couldn't extract a YouTube video ID from that redirect.");
}

function renderVideos(items) {
  results.replaceChildren();
  currentVideos = (items || []).map(item => {
    const snippet = item.snippet || {};
    const id = typeof item.id === "string" ? item.id : item.id?.videoId;
    return {
      id,
      title: snippet.title || "Untitled video",
      channel: snippet.channelTitle || "YouTube",
      thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || ""
    };
  }).filter(video => validId(video.id));

  resultCount.textContent = `${currentVideos.length} RESULTS`;
  nextVideoButton.disabled = currentVideos.length < 2;

  if (!currentVideos.length) {
    showMessage("No videos found. Try another search or paste a YouTube video URL.");
    return;
  }

  message.hidden = true;
  currentVideos.forEach(video => results.append(createVideoCard(video)));
}

async function searchVideos(query) {
  showMessage("Searching YouTube...");
  resultCount.textContent = "SEARCHING";
  try {
    const response = await fetch(`${SEARCH_API_ENDPOINT}?q=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/json" }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Search service returned ${response.status}.`);
    renderVideos(data.items || []);
  } catch (error) {
    resultCount.textContent = "ERROR";
    showMessage(`Search failed: ${error.message}`);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  const directId = getVideoId(query);
  if (directId) {
    playVideo(directId, "YouTube link");
    return;
  }

  let url;
  try {
    url = new URL(query);
  } catch (_) {
    await searchVideos(query);
    return;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    showMessage("Please enter a valid web link or search query.");
    return;
  }

  const host = url.hostname.toLowerCase();
  const isGoogleHost = host === "google.com" || host.endsWith(".google.com");

  if (isGoogleHost) {
    showMessage("Resolving Google redirect...");
    resultCount.textContent = "RESOLVING";
    try {
      const id = await resolveGoogleRedirect(query);
      playVideo(id, "Resolved YouTube link");
    } catch (error) {
      resultCount.textContent = "ERROR";
      showMessage(`${error.message} Try opening the link and copying the direct YouTube URL.`);
    }
    return;
  }

  showMessage("Couldn't recognize that video link. Try a direct YouTube URL.");
});

nextVideoButton.addEventListener("click", () => {
  if (currentVideos.length < 2) return;
  currentVideoIndex = (currentVideoIndex + 1) % currentVideos.length;
  const next = currentVideos[currentVideoIndex];
  playVideo(next.id, next.title, next.channel);
});

function stopDoomScroll() {
  doomScrolling = false;
  if (doomTimer) clearInterval(doomTimer);
  doomTimer = null;
  doomToggle.setAttribute("aria-pressed", "false");
  doomToggle.textContent = "◎ DOOM SCROLL: OFF";
  doomStatus.textContent = "Doom Scroll is off.";
}

function startDoomScroll() {
  if (currentVideos.length < 2) {
    doomStatus.textContent = "Search for at least two videos first, then turn Doom Scroll on.";
    return;
  }
  doomScrolling = true;
  doomToggle.setAttribute("aria-pressed", "true");
  doomToggle.textContent = "◎ DOOM SCROLL: ON";
  doomStatus.textContent = "Doom Scroll is on. The next video loads every 30 seconds. Press the button again to stop.";
  if (doomTimer) clearInterval(doomTimer);
  doomTimer = setInterval(() => {
    if (!doomScrolling || currentVideos.length < 2) return;
    currentVideoIndex = (currentVideoIndex + 1) % currentVideos.length;
    const next = currentVideos[currentVideoIndex];
    playVideo(next.id, next.title, next.channel);
  }, 30000);
}

doomToggle.addEventListener("click", () => {
  if (doomScrolling) stopDoomScroll();
  else startDoomScroll();
});

function disableMiniPlayer() {
  playerWrap.classList.remove("is-mini");
  document.body.classList.remove("mini-active");
  miniToggle.setAttribute("aria-pressed", "false");
  miniToggle.textContent = "▣ MINI PLAYER";
  miniClose.hidden = true;
}

function enableMiniPlayer() {
  if (player.hidden) {
    showMessage("Play a video before opening the mini player.");
    return;
  }
  playerWrap.classList.add("is-mini");
  document.body.classList.add("mini-active");
  miniToggle.setAttribute("aria-pressed", "true");
  miniToggle.textContent = "▣ RESTORE PLAYER";
  miniClose.hidden = false;
}

miniToggle.addEventListener("click", () => {
  if (playerWrap.classList.contains("is-mini")) disableMiniPlayer();
  else enableMiniPlayer();
});
miniClose.addEventListener("click", disableMiniPlayer);

clearHistoryButton.addEventListener("click", () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch (_) {}
  renderHistory();
});

const initialId = new URLSearchParams(location.search).get("v");
if (initialId && validId(initialId)) playVideo(initialId, "Shared video");
renderHistory();
