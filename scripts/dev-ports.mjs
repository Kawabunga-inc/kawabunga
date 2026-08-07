/**
 * Local dev port map — one knob for the whole stack.
 *
 * Every kawabunga dev server derives its port from KAWABUNGA_PORT_BASE, so a
 * machine running several projects at once can give this repo its own block:
 *
 *   KAWABUNGA_PORT_BASE=4200 npm run dev
 *     web 4200 · admin 4201 · voice-host 4202 · voice-agent health 4203
 *
 * Unset, the historical ports apply (3000/3001/8080/8081) so nothing changes
 * for anyone who hasn't opted in. Per-service overrides always win, which is
 * also how two checkouts of THIS repo run side by side (different bases).
 */
import { pathToFileURL } from "node:url";

/** Ports used when no base is configured — the pre-existing layout. */
export const DEFAULT_PORTS = Object.freeze({
  web: 3000,
  admin: 3001,
  voiceHost: 8080,
  voiceAgentHealth: 8081,
});

/** Offset from KAWABUNGA_PORT_BASE, so one base yields a contiguous block. */
export const SERVICE_OFFSETS = Object.freeze({
  web: 0,
  admin: 1,
  voiceHost: 2,
  voiceAgentHealth: 3,
});

/** The env var that pins one service explicitly, overriding the base. */
export const SERVICE_ENV_VARS = Object.freeze({
  web: "WEB_PORT",
  admin: "ADMIN_PORT",
  voiceHost: "VOICE_HOST_PORT",
  voiceAgentHealth: "VOICE_AGENT_DEV_HEALTH_PORT",
});

export const SERVICES = Object.freeze(Object.keys(SERVICE_OFFSETS));

/** A usable TCP port, or null. Ports above 65535 - 3 can't fit the block. */
function parsePort(raw, { maxOffset = 0 } = {}) {
  const value = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isInteger(value)) return null;
  if (value < 1 || value + maxOffset > 65535) return null;
  return value;
}

/**
 * Resolve every dev port. Precedence per service:
 *   explicit service var  →  KAWABUNGA_PORT_BASE + offset  →  historical default
 * An unparseable value is ignored (with `warnings` explaining why) rather than
 * crashing a dev server over a typo.
 */
export function resolveDevPorts(env = process.env) {
  const warnings = [];
  const rawBase = env.KAWABUNGA_PORT_BASE;
  const maxOffset = Math.max(...Object.values(SERVICE_OFFSETS));
  const base = rawBase === undefined || String(rawBase).trim() === ""
    ? null
    : parsePort(rawBase, { maxOffset });
  if (rawBase !== undefined && String(rawBase).trim() !== "" && base === null) {
    warnings.push(
      `KAWABUNGA_PORT_BASE="${rawBase}" is not a port that leaves room for ${maxOffset + 1} services — using default ports`,
    );
  }

  const ports = {};
  for (const service of SERVICES) {
    const varName = SERVICE_ENV_VARS[service];
    const explicit = parsePort(env[varName]);
    if (env[varName] !== undefined && String(env[varName]).trim() !== "" && explicit === null) {
      warnings.push(`${varName}="${env[varName]}" is not a valid port — falling back`);
    }
    ports[service] =
      explicit ?? (base === null ? DEFAULT_PORTS[service] : base + SERVICE_OFFSETS[service]);
  }
  return { ports, base, warnings };
}

/**
 * Public URLs the browser bundle bakes in. Only rewritten when they are unset
 * or already point at localhost — a deliberate tunnel/staging URL in .env is
 * never clobbered, and an UNSET voice-host URL stays unset (setting it would
 * route voice through a host that may not be running).
 */
export function resolveDevPublicUrls(ports, env = process.env) {
  const urls = {};
  const isLocal = (value) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(value ?? "");

  const site = env.NEXT_PUBLIC_SITE_URL;
  if (site === undefined || String(site).trim() === "" || isLocal(site)) {
    urls.NEXT_PUBLIC_SITE_URL = `http://localhost:${ports.web}`;
  }
  // Opt-in only: rewrite the port of an existing localhost value, never invent one.
  const voiceHost = env.NEXT_PUBLIC_VOICE_HOST_URL;
  if (isLocal(voiceHost)) {
    urls.NEXT_PUBLIC_VOICE_HOST_URL = `http://localhost:${ports.voiceHost}`;
  }
  return urls;
}

/** One-line-per-service summary for the dev banner. */
export function formatPortMap(ports) {
  return [
    `web           http://localhost:${ports.web}`,
    `admin         http://localhost:${ports.admin}`,
    `voice-host    http://localhost:${ports.voiceHost}`,
    `agent health  http://localhost:${ports.voiceAgentHealth}`,
  ];
}

// `npm run dev:ports` — show where this checkout's servers will land, without
// starting anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ports, base, warnings } = resolveDevPorts();
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  console.log(
    base === null
      ? "KAWABUNGA_PORT_BASE unset — default ports (set it to move the whole stack):"
      : `KAWABUNGA_PORT_BASE=${base}:`,
  );
  console.log(formatPortMap(ports).map((line) => `  ${line}`).join("\n"));
}
