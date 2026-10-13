// Ravenfall HQ's Discord gateway connection. Run by ravenfall-gateway.service.
//
// Everything the bot *does* still goes through the site (interactions
// webhook + REST). This process exists for two things only:
//   1. Presence. Discord shows a bot as online only while it holds a gateway
//      connection, so without this the bot always reads "offline".
//   2. Member events. When someone joins or their roles change, it asks the
//      site to generate / fill in their personnel file
//      (POST /api/internal/member-sync).
//
// No dependencies: Node 22's built-in WebSocket and fetch. Config comes from
// the same .env as the site (systemd EnvironmentFile).

import { createHmac } from "node:crypto";

const TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";
const SITE = (process.env.SITE_INTERNAL_URL || `http://127.0.0.1:${process.env.SITE_PORT || "8002"}`).replace(/\/$/, "");
const SECRET = process.env.NEXTAUTH_SECRET ?? "";
const STATUS_TEXT = process.env.BOT_STATUS_TEXT || new URL(process.env.NEXTAUTH_URL || "https://ravenfallpmc.com").host;

// Overridable only so the script can be tested against a local mock.
const GATEWAY = process.env.DISCORD_GATEWAY_URL || "wss://gateway.discord.gg/?v=10&encoding=json";
const INTENT_GUILDS = 1 << 0;
const INTENT_GUILD_MEMBERS = 1 << 1; // privileged: "Server Members Intent"
const OP = { DISPATCH: 0, HEARTBEAT: 1, IDENTIFY: 2, RESUME: 6, RECONNECT: 7, INVALID_SESSION: 9, HELLO: 10, ACK: 11 };
// Close codes that a reconnect can't fix: stop and let the log say why.
const FATAL = { 4004: "the bot token is invalid (DISCORD_BOT_TOKEN)", 4010: "invalid shard", 4011: "sharding required", 4012: "invalid API version", 4013: "invalid intents" };
const DISALLOWED_INTENTS = 4014;

const log = (...a) => console.log(new Date().toISOString(), ...a);

if (!TOKEN) {
  log("DISCORD_BOT_TOKEN is not set; nothing to connect. Exiting.");
  process.exit(0);
}
if (typeof WebSocket === "undefined") {
  log("This Node has no built-in WebSocket; Node 22.4 or newer is required.");
  process.exit(1);
}

const internalToken = SECRET ? createHmac("sha256", SECRET).update("ravenfall-gateway").digest("hex") : "";

let intents = INTENT_GUILDS | INTENT_GUILD_MEMBERS;
let ws = null;
let seq = null;
let sessionId = null;
let resumeUrl = null;
let heartbeatTimer = null;
let acked = true;
let backoff = 1000;
let botTag = "?";

function send(op, d) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op, d }));
}

function presence() {
  // type 3 = "Watching"
  return { since: null, status: "online", afk: false, activities: [{ name: STATUS_TEXT, type: 3 }] };
}

function identify() {
  send(OP.IDENTIFY, {
    token: TOKEN,
    intents,
    properties: { os: "linux", browser: "ravenfall-hq", device: "ravenfall-hq" },
    presence: presence(),
  });
}

function startHeartbeat(interval) {
  clearInterval(heartbeatTimer);
  acked = true;
  const beat = () => {
    if (!acked) {
      // No ACK since the last beat: the connection is a zombie. Reconnect.
      log("Heartbeat not acknowledged; reconnecting.");
      ws?.close(4900, "zombie connection");
      return;
    }
    acked = false;
    send(OP.HEARTBEAT, seq);
  };
  // First beat after a random fraction of the interval, as Discord asks.
  setTimeout(beat, Math.floor(Math.random() * interval));
  heartbeatTimer = setInterval(beat, interval);
}

// --- Member events -> site ----------------------------------------------- //

const pending = new Map();

function memberChanged(discordId) {
  // A role edit often arrives as a burst of updates: settle, then sync once.
  clearTimeout(pending.get(discordId));
  pending.set(
    discordId,
    setTimeout(async () => {
      pending.delete(discordId);
      await post("/api/internal/member-sync", { discordId }, (r) => {
        if (r.outcome && r.outcome !== "unchanged" && r.outcome !== "skipped") log(`Member ${discordId}: personnel file ${r.outcome}.`);
      });
    }, 3000),
  );
}

async function post(path, body, onOk) {
  if (!internalToken) return; // NEXTAUTH_SECRET missing: the site would refuse anyway
  try {
    const res = await fetch(SITE + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": internalToken },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) log(`Site answered ${res.status} on ${path}:`, data.error ?? "");
    else onOk?.(data);
  } catch (e) {
    log(`Couldn't reach the site at ${SITE}${path}: ${e.message}`);
  }
}

function reportStatus() {
  post("/api/internal/gateway", { tag: botTag, members: !!(intents & INTENT_GUILD_MEMBERS) });
}
setInterval(reportStatus, 5 * 60 * 1000);

// --- Connection ---------------------------------------------------------- //

function connect(resume) {
  const url = resume && resumeUrl ? `${resumeUrl}/?v=10&encoding=json` : GATEWAY;
  ws = new WebSocket(url);

  ws.addEventListener("message", (ev) => {
    const { op, d, s, t } = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
    if (s != null) seq = s;
    switch (op) {
      case OP.HELLO:
        startHeartbeat(d.heartbeat_interval);
        if (resume && sessionId) send(OP.RESUME, { token: TOKEN, session_id: sessionId, seq });
        else identify();
        break;
      case OP.ACK:
        acked = true;
        break;
      case OP.HEARTBEAT:
        send(OP.HEARTBEAT, seq);
        break;
      case OP.RECONNECT:
        ws.close(4901, "reconnect requested");
        break;
      case OP.INVALID_SESSION:
        // d === true: the session can be resumed; otherwise start over.
        if (!d) sessionId = seq = null;
        setTimeout(() => (d ? send(OP.RESUME, { token: TOKEN, session_id: sessionId, seq }) : identify()), 1000 + Math.random() * 4000);
        break;
      case OP.DISPATCH:
        dispatch(t, d);
        break;
    }
  });

  ws.addEventListener("close", (ev) => {
    clearInterval(heartbeatTimer);
    if (FATAL[ev.code]) {
      log(`Discord closed the connection (${ev.code}): ${FATAL[ev.code]}. Not retrying.`);
      process.exit(1);
    }
    if (ev.code === DISALLOWED_INTENTS && intents & INTENT_GUILD_MEMBERS) {
      log(
        "Server Members Intent is off for this bot, so member events can't be received. " +
          "Staying online without them. To get automatic personnel files on role changes, turn it on: " +
          "Developer Portal -> your app -> Bot -> Privileged Gateway Intents -> Server Members Intent, then restart ravenfall-gateway.",
      );
      intents &= ~INTENT_GUILD_MEMBERS;
      sessionId = seq = null;
      setTimeout(() => connect(false), 1000);
      return;
    }
    const canResume = !!sessionId && ev.code !== 1000;
    log(`Connection closed (${ev.code}${ev.reason ? `: ${ev.reason}` : ""}); ${canResume ? "resuming" : "reconnecting"} in ${backoff / 1000}s.`);
    setTimeout(() => connect(canResume), backoff);
    backoff = Math.min(backoff * 2, 60_000);
  });

  ws.addEventListener("error", () => {
    // A close event always follows; reconnection is handled there.
  });
}

function dispatch(t, d) {
  switch (t) {
    case "READY":
      sessionId = d.session_id;
      resumeUrl = d.resume_gateway_url;
      botTag = d.user?.username ?? "?";
      backoff = 1000;
      log(`Online as ${botTag}${intents & INTENT_GUILD_MEMBERS ? ", watching member role changes" : " (member events off)"}.`);
      reportStatus();
      break;
    case "RESUMED":
      backoff = 1000;
      log("Session resumed.");
      break;
    case "GUILD_MEMBER_ADD":
    case "GUILD_MEMBER_UPDATE":
      if (d.guild_id === GUILD_ID && d.user && !d.user.bot) memberChanged(d.user.id);
      break;
  }
}

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    log("Shutting down.");
    clearInterval(heartbeatTimer);
    ws?.close(1000, "shutdown");
    setTimeout(() => process.exit(0), 500);
  });
}

connect(false);
