/**
 * WHICH BUILD IS THIS? — reported by /healthz.
 *
 * Nothing anywhere used to say. `{ok:true, service:"voice-agent"}` is true of
 * every build ever made, so "is my change live?" could only be answered by
 * inferring it from journal side-effects. That took four rounds and produced
 * one confident wrong answer. The actual cause was the service auto-deploying
 * from `main` while every merge went to `dev` — `branch` alone would have said
 * so in a single request.
 *
 * Railway injects RAILWAY_GIT_* into the service at runtime, so this needs no
 * build argument and no Dockerfile change. GIT_* is honoured first so a
 * non-Railway host, or a local run, can set it explicitly.
 */
export type BuildIdentity = { commit: string | null; branch: string | null };

/** Short enough to read aloud, long enough not to collide. */
const SHA_DISPLAY_LENGTH = 12;

export function buildIdentity(env: NodeJS.ProcessEnv = process.env): BuildIdentity {
  const commit = env.GIT_COMMIT_SHA?.trim() || env.RAILWAY_GIT_COMMIT_SHA?.trim() || "";
  const branch = env.GIT_BRANCH?.trim() || env.RAILWAY_GIT_BRANCH?.trim() || "";
  return {
    // Null rather than a guess: a wrong SHA is worse than an admitted unknown,
    // because it would be believed.
    commit: commit ? commit.slice(0, SHA_DISPLAY_LENGTH) : null,
    branch: branch || null,
  };
}
