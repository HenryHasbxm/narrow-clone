# Arrowkeep CTF

An original browser-based multiplayer bow-and-arrow capture-the-flag game. It is an unofficial fan-made project, is not affiliated with Narrow.One, and uses original names and code.

## Run locally

Requires Node.js 18 or newer.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in two or more browser tabs to play together. The game server assigns balanced teams, simulates movement, arrows, hits, respawns, flags, and scoring. WebSocket connections are required; this cannot be hosted as a static GitHub Pages site by itself.

For development, use `npm run dev`. Run `npm run check` to check JavaScript syntax.

## Deploy

Deploy the repository to a Node.js host that supports persistent WebSocket connections (for example, Render, Railway, Fly.io, or your own server). Set the start command to `npm start`; the server listens on the host's `PORT` environment variable. The `/health` endpoint provides a basic health check. Set `CORS_ORIGIN` only if you deliberately serve the browser client from a different origin.

## Controls

- **WASD** move; **Shift** sprint
- **Mouse** aim
- **Hold and release left mouse button** to charge and shoot an arrow
- Capture the red flag and return to the blue flag to score (or vice versa)

## Notes

The server is authoritative for movement limits, collision, arrow hit detection, health, respawns, and capture scoring. Three.js is currently loaded from jsDelivr; a network connection is needed to load it.
