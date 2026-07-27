export {};

const requiredLiveKitVariables = [
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
] as const;

const missingLiveKitVariables = requiredLiveKitVariables.filter(
  (name) => !process.env[name]?.trim(),
);

if (missingLiveKitVariables.length > 0) {
  console.warn(
    `[voice-agent] disabled in local dev; missing ${missingLiveKitVariables.join(", ")}`,
  );
  process.exit(0);
}

// voice-host owns :8080 in the full monorepo dev session. Keep the agent's
// process-liveness endpoint separate without changing its Railway start path.
process.env.HEALTH_PORT =
  process.env.VOICE_AGENT_DEV_HEALTH_PORT?.trim() || "8081";

await import("../src/agent");
