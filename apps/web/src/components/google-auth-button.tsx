"use client";

import { signIn, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";

export function GoogleAuthButton({
  tone = "overlay",
}: {
  tone?: "adaptive" | "light" | "overlay";
}) {
  const { data: session, status } = useSession();
  const light = tone === "light";
  const adaptive = tone === "adaptive";

  if (status === "loading") {
    return (
      <div
        className={`h-9 w-24 animate-pulse rounded-full border ${
          light
            ? "border-[#0b3732]/10 bg-[#f1f7f5]"
            : adaptive
              ? "border-white/25 bg-white/10 mix-blend-difference"
              : "border-white/15 bg-white/8"
        }`}
        aria-label="Loading"
      />
    );
  }

  if (session?.user) {
    return (
      <Link
        href="/dashboard"
        className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm backdrop-blur-lg transition-all ${
          light
            ? "border-[#0b3732]/15 bg-[#f1f7f5]/85 text-[#07110f] hover:border-[#0b3732]/30 hover:bg-white"
            : adaptive
              ? "relative border-transparent bg-transparent before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:border before:border-white/35 before:mix-blend-difference hover:before:bg-white/10"
              : "border-white/25 bg-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] hover:border-white/40 hover:bg-white/25"
        }`}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {session.user.image && (
          <Image
            src={session.user.image}
            alt=""
            width={22}
            height={22}
            className="rounded-full"
          />
        )}
        <span
          className={`max-w-[120px] truncate ${
            adaptive ? "mix-blend-difference text-white" : ""
          }`}
        >
          {session.user.name ?? session.user.email}
        </span>
      </Link>
    );
  }

  return (
    <button
      onClick={() => signIn("google")}
      className={`flex items-center gap-2 rounded-full border px-5 py-1.5 text-sm backdrop-blur-lg transition-all ${
        light
          ? "border-[#0b3732]/15 bg-[#f1f7f5]/85 text-[#07110f] hover:border-[#0b3732]/30 hover:bg-white"
          : adaptive
            ? "relative border-transparent bg-transparent before:pointer-events-none before:absolute before:inset-0 before:rounded-full before:border before:border-white/35 before:mix-blend-difference hover:before:bg-white/10"
            : "border-white/25 bg-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] hover:border-white/40 hover:bg-white/25 hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)]"
      }`}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" className="shrink-0">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      <span className={adaptive ? "mix-blend-difference text-white" : ""}>
        Sign in
      </span>
    </button>
  );
}
