#!/usr/bin/env node
/**
 * Run one dev server with its port (and the public URLs that must agree with
 * it) injected from the shared map in dev-ports.mjs.
 *
 *   node scripts/with-dev-port.mjs <service> -- <command> [args...]
 *
 * Placed AFTER dotenv-cli in the package script so values in .env are already
 * loaded — this wrapper gets the last word on ports, which is the point.
 */
import { spawn } from "node:child_process";
import { resolveDevPorts, resolveDevPublicUrls, SERVICE_ENV_VARS, SERVICES } from "./dev-ports.mjs";

const argv = process.argv.slice(2);
const separator = argv.indexOf("--");
const service = argv[0];
const command = separator >= 0 ? argv.slice(separator + 1) : [];

if (!SERVICES.includes(service) || command.length === 0) {
  console.error(
    `usage: node scripts/with-dev-port.mjs <${SERVICES.join("|")}> -- <command> [args...]`,
  );
  process.exit(64);
}

const { ports, base, warnings } = resolveDevPorts(process.env);
for (const warning of warnings) console.warn(`[dev-ports] ${warning}`);

const port = ports[service];
const env = {
  ...process.env,
  // Next reads PORT; the voice services read their own namespaced var. Setting
  // both is safe because each dev server runs in its own process.
  PORT: String(port),
  [SERVICE_ENV_VARS[service]]: String(port),
  ...resolveDevPublicUrls(ports, process.env),
};

console.log(
  `[dev-ports] ${service} → http://localhost:${port}` +
    (base === null ? " (default ports; set KAWABUNGA_PORT_BASE to move the stack)" : ` (base ${base})`),
);

const child = spawn(command[0], command.slice(1), { env, stdio: "inherit" });

// Forward the signals a dev session actually sends, so ^C stops the server
// rather than orphaning it under this wrapper.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
child.on("error", (error) => {
  console.error(`[dev-ports] failed to start ${command[0]}: ${error.message}`);
  process.exit(1);
});
