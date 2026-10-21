# Shadow Proxy

A dark, neon-green YouTube-focused search and embed website.

## What works

- Responsive dark/hacker-style interface.
- Paste a YouTube watch, Shorts, live, or `youtu.be` link to open it in YouTube's privacy-enhanced embed player, when the video allows embedding.
- Search videos through a small server-side endpoint using the YouTube Data API v3. The API key stays in a server environment variable, not in browser JavaScript.

## Important limitation

This is a YouTube-focused viewer, not a general-purpose web proxy and not a network-restriction bypass. It does not relay arbitrary internet traffic. YouTube sign-in, embed settings, network policies, API quota, and hosting-provider rules may affect access. It does not hide activity from your network administrator or ISP.

## Run locally

Requires Node.js 18 or newer.

1. Install Node.js from https://nodejs.org/
2. In a terminal, open the project folder.
3. Set the API key environment variable (optional, but required for search).

Windows PowerShell:
```powershell
$env:YOUTUBE_API_KEY="YOUR_API_KEY_HERE"
npm start
```

macOS/Linux:
```bash
export YOUTUBE_API_KEY="YOUR_API_KEY_HERE"
npm start
```

Then open http://localhost:3000. Without an API key, pasting a video link can still work, but search results won't load.

## Set up YouTube search

1. Open Google Cloud Console: https://console.cloud.google.com/
2. Create/select a project and enable **YouTube Data API v3**.
3. Create an API key. Restrict it to YouTube Data API v3 and apply suitable application restrictions.
4. Set `YOUTUBE_API_KEY` as an environment variable on your local machine or hosting service. Never paste the key into `public/app.js`, HTML, or a public repository.
5. Restart/redeploy the server. Search should now return up to 12 video results per query.

Google API quota limits and policies apply.

## Publish online

Use a Node.js hosting provider that supports a start command and environment variables.

1. Upload the project folder or push it to a private/public Git repository.
2. Create a new Node.js web service.
3. Set the build command to `npm install` (there are no third-party dependencies) or leave it blank if your host permits.
4. Set the start command to `npm start`.
5. Add an environment variable named `YOUTUBE_API_KEY` with your key value.
6. Deploy and open the HTTPS URL provided by your host.

The host should provide `PORT` automatically. Do not use static-only hosting if you want API-powered search, because the included API endpoint runs on Node.js.

## Project structure

```text
shadow-proxy/
├── package.json
├── server.js
├── README.md
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```
