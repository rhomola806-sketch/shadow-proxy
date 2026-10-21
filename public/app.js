
/*
 * SHADOW PROXY — Video Player
 * Supports YouTube URLs, Shorts, live videos, youtu.be links,
 * common redirect URLs, and YouTube Data API search.
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

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();

function showMessage(text) {
  message.hidden = false;
  message.textContent = text;
}

function getVideoId(raw, depth = 0) {
  if (!raw || depth > 6) return null;

  let url;

  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  // Only handle HTTP and HTTPS URLs.
  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  const host = url.hostname.toLowerCase();

  // Short YouTube links: youtu.be/VIDEO_ID
  if (host === "youtu.be" || host === "www.youtu.be") {
    return validId(url.pathname.split("/").filter(Boolean)[0]);
  }

  // Regular YouTube domains.
  const isYouTube =
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com");

  if (isYouTube) {
    if (url.pathname === "/watch") {
      return validId(url.searchParams.get("v"));
    }

    const parts = url.pathname.split("/").filter(Boolean);

    if (
      ["embed", "shorts", "live", "v"].includes(parts[0])
    ) {
      return validId(parts[1]);
    }
  }

  // Handle redirects that include a normal destination URL.
  // Opaque Google redirect tokens may require server-side resolution.
  const redirectHosts = [
    "google.com",
    "www.google.com",
    "googleusercontent.com",
    "www.googleusercontent.com"
  ];

  if (redirectHosts.includes(host)) {
    const keys = [
      "url",
      "q",
      "u",
      "target",
      "redirect",
      "redirect_url",
      "continue"
    ];

    for (const key of keys) {
      const destination = url.searchParams.get(key);

      if (
        destination &&
        /^https?:\/\//i.test(destination)
      ) {
        const id = getVideoId(destination, depth + 1);
        if (id) return id;
      }
    }
  }

  return null;
}

function validId(id) {
  return id && /^[A-Za-z0-9_-]{11}$/.test(id)
    ? id
    : null;
}

function playVideo(id, title = "Selected video") {
  if (!validId(id)) {
    showMessage("Invalid YouTube video ID. Try a direct YouTube link.");
    return;
  }

  // Use YouTube's official embedded player.
  player.src =
    "https://www.youtube-nocookie.com/embed/" +
    encodeURIComponent(id);

  player.hidden = false;
  placeholder.hidden = true;
  nowPlaying.textContent = "NOW PLAYING // " + title;
  message.hidden = true;

  document
    .querySelector(".workspace")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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
    .filter(video => validId(video.id));

  resultCount.textContent = `${videos.length} RESULTS`;

  if (!videos.length) {
    showMessage("No videos found. Try another search.");
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

    if (!response.ok) {
      throw new Error(`Search service returned ${response.status}`);
    }

    const data = await response.json();
    renderVideos(data.items || []);
  } catch (error) {
    resultCount.textContent = "ERROR";

    showMessage(
      `Search failed: ${error.message}. Check your YouTube API key, quota, and server setup.`
    );
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

  // Do not send URLs to the search API as search terms.
  if (/^https?:\/\//i.test(query)) {
    showMessage(
      "Couldn't extract a YouTube video ID from that link. " +
      "Try opening the video on YouTube and copying its direct URL. " +
      "Some Google redirect links use opaque tokens that need server-side resolution."
    );
    resultCount.textContent = "LINK NOT RECOGNIZED";
    return;
  }

  searchVideos(query);
});

// Support links such as /?v=VIDEO_ID
const initialId = new URLSearchParams(location.search).get("v");

if (initialId) {
  playVideo(initialId);
}
