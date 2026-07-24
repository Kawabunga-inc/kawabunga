"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GoogleAuthButton } from "./google-auth-button";
import { MeshGradient } from "./mesh-gradient";

const HERO_TIERS = [
  { src: "/landing-hero-placeholder.jpg", minWidth: 0 },
  { src: "/landing-hero-sm.jpg", minWidth: 0 },
  { src: "/landing-hero-md.jpg", minWidth: 0 },
  { src: "/landing-hero-lg.jpg", minWidth: 1280 },
  { src: "/landing-hero.jpg", minWidth: 2560 },
] as const;

function useProgressiveHero() {
  const [tierIndex, setTierIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const vw = window.innerWidth * (window.devicePixelRatio ?? 1);
    let maxTier = HERO_TIERS.length - 1;
    for (let i = HERO_TIERS.length - 1; i > 0; i--) {
      if (vw < HERO_TIERS[i].minWidth) {
        maxTier = i - 1;
      }
    }

    let cancelled = false;
    let current = 0;

    function advance() {
      if (cancelled || current >= maxTier) return;
      const next = current + 1;
      const img = new window.Image();
      img.src = HERO_TIERS[next].src;
      img.onload = () => {
        if (cancelled) return;
        current = next;
        setTierIndex(next);
        setTimeout(advance, 80);
      };
      img.onerror = () => {};
    }

    const kickoff = requestAnimationFrame(() => {
      setReady(true);
      advance();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(kickoff);
    };
  }, []);

  return { src: HERO_TIERS[tierIndex].src, ready, isPlaceholder: tierIndex === 0 };
}

const heading = "var(--font-heading)";
const mono = "var(--font-mono)";

const PILLARS = [
  {
    num: "01",
    title: "Voice-First Immersion",
    body: "Speak naturally and the world responds. Real-time speech recognition and expressive AI voices create conversations that feel alive — not scripted.",
  },
  {
    num: "02",
    title: "Persistent Memory",
    body: "Every character tracks trust, fear, loyalty, and history. Betray an ally and they remember. Win someone over and the relationship deepens across turns.",
  },
  {
    num: "03",
    title: "Real Consequences",
    body: "Stability, morale, resources, pressure — every decision shifts the balance. Groups react. The world state evolves around you.",
  },
];

const PIPELINE = [
  { label: "Policy Guard", desc: "Safety & constraint validation" },
  { label: "Event Selector", desc: "Contextual scenario matching" },
  { label: "State Reducer", desc: "Consequence propagation" },
  { label: "Memory Summarizer", desc: "Relationship history tracking" },
  { label: "AI Generator", desc: "Narration, dialogue, choices" },
];

const USE_CASES = [
  {
    abbr: "EX",
    title: "Experiential Understanding",
    body: "Learn by living. Step into a historical crisis, a corporate boardroom, or a first-contact scenario. Understanding comes from experience, not explanation.",
  },
  {
    abbr: "DP",
    title: "Deliberate Practice",
    body: "Train for interviews, negotiations, presentations, and difficult conversations. Consequence-safe but psychologically real. Practice at the speed of reality.",
  },
  {
    abbr: "NM",
    title: "New Media",
    body: "A frontier for creators and storytellers. Worlds that respond to agency in ways books, games, and films cannot. The most powerful technology disappears — what remains is the experience.",
  },
];

const PHASES = [
  { phase: "Phase 1", title: "Audio Practice Engine", desc: "Voice-first simulation for high-stakes communication practice", active: true },
  { phase: "Phase 2", title: "Immersive Stories", desc: "Wellness, meditations, branching narratives", active: false },
  { phase: "Phase 3", title: "Multimedia Worlds", desc: "2D/3D scene generation, video rendering", active: false },
  { phase: "Phase 4", title: "Full Immersion", desc: "Real-time 3D, spatial audio, persistent worlds", active: false },
];

function AudioWaveBars() {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const BAR_COUNT = 7;
  const BASE_HEIGHTS = [12, 20, 8, 24, 14, 18, 10];
  const BASE_OPACITIES = [0.5, 0.7, 0.4, 1, 0.6, 0.8, 0.45];

  useEffect(() => {
    let frame: number;
    const animate = () => {
      const t = performance.now() / 1000;
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const phase = i * 0.9;
        const wave = Math.sin(t * 2.5 + phase) * 0.4 + 0.6;
        const h = BASE_HEIGHTS[i] * wave;
        const o = BASE_OPACITIES[i] * (0.5 + wave * 0.5);
        bar.style.height = `${h}px`;
        bar.style.opacity = `${o}`;
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex items-end gap-[3px]" style={{ height: 24 }}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="w-[3px] rounded-full bg-[#8fd1cb]"
          style={{
            height: BASE_HEIGHTS[i],
            opacity: BASE_OPACITIES[i],
            transition: "height 0.15s ease, opacity 0.15s ease",
          }}
        />
      ))}
    </div>
  );
}

export function LandingPageV3() {
  const hero = useProgressiveHero();

  return (
    <main className="w-full bg-[#0a0a0a] text-white" style={{ fontFamily: "var(--font-body)" }}>
      {/* ── Hero ── */}
      <section className="relative h-screen w-full overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src={hero.src}
            alt="Immersive digital forest — streams of light and data flowing through ancient trees"
            fill
            className={`object-cover transition-[filter] duration-700 ${hero.isPlaceholder ? "blur-xl scale-105" : ""}`}
            priority
            quality={90}
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-black/20 to-black/40" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
        </div>

        <div className="relative z-10 flex h-full flex-col">
          <header className="flex items-center justify-between px-6 py-5 sm:px-10 lg:px-20">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/kawabunga_wordmark.svg"
                alt="Kawabunga"
                width={178}
                height={24}
                priority
                className="h-6 w-auto"
              />
            </Link>
            <div className="flex items-center gap-2">
              <GoogleAuthButton />
            </div>
          </header>

          <div className="flex flex-1 flex-col justify-end px-6 pb-12 sm:px-10 lg:px-20 lg:pb-16">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl space-y-6">
                <h1
                  className="text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-[64px]"
                  style={{ fontFamily: heading, letterSpacing: "-0.04em" }}
                >
                  <span className="text-[#8fd1cb]">Step into any world</span>
                  <br />
                  you can imagine
                </h1>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Link
                    href="/about"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-6 py-2.5 text-sm backdrop-blur-lg transition-all hover:scale-[1.03] hover:border-white/40 hover:bg-white/25"
                    style={{ fontFamily: mono }}
                  >
                    Explore Worlds
                    <span className="text-white/60">&rarr;</span>
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-6 py-2.5 text-sm backdrop-blur-md transition-all hover:scale-[1.03] hover:border-white/30 hover:bg-white/15"
                    style={{ fontFamily: mono }}
                  >
                    Learn More
                    <span className="text-white/60">&rarr;</span>
                  </Link>
                </div>
              </div>

              <div className="flex flex-col items-start gap-4">
                <AudioWaveBars />
                <p
                  className="max-w-md text-sm leading-relaxed text-white/60 lg:text-[15px] lg:leading-6"
                  style={{ fontFamily: mono }}
                >
                  A voice-first immersive reality engine where you inhabit
                  characters, shape narratives, and experience worlds that respond
                  to every choice you make.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Statement ── */}
      <section className="px-6 py-24 sm:px-10 sm:py-32 lg:px-20 lg:py-36">
        <p
          className="text-[10px] uppercase tracking-[0.2em] text-white/40"
          style={{ fontFamily: mono }}
        >
          The Platform
        </p>
        <p
          className="mt-10 max-w-[960px] text-2xl font-medium leading-snug text-white/85 sm:text-3xl sm:leading-snug lg:text-[42px] lg:leading-[1.3]"
          style={{ fontFamily: heading, letterSpacing: "-0.03em" }}
        >
          Kawabunga is a reality engine that generates living, adaptive
          worlds — where every character remembers, every choice echoes, and the
          story belongs entirely to you.
        </p>
      </section>

      {/* ── Three Pillars ── */}
      <section className="px-6 pb-24 sm:px-10 sm:pb-32 lg:px-20 lg:pb-36">
        <div className="grid gap-4 sm:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.num}
              className="rounded-2xl border border-white/6 bg-white/[0.04] p-7 sm:p-8 lg:p-10"
            >
              <span
                className="text-4xl font-bold text-[#8fd1cb] lg:text-5xl"
                style={{ fontFamily: heading, letterSpacing: "-0.04em", lineHeight: 1 }}
              >
                {p.num}
              </span>
              <h3
                className="mt-4 text-lg font-semibold lg:text-xl"
                style={{ fontFamily: heading }}
              >
                {p.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/45">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The Engine ── */}
      <section className="px-6 pb-24 sm:px-10 sm:pb-32 lg:px-20 lg:pb-36">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-16">
          <div className="flex flex-1 flex-col gap-6 lg:pt-4">
            <p
              className="text-[10px] uppercase tracking-[0.2em] text-white/40"
              style={{ fontFamily: mono }}
            >
              The Engine
            </p>
            <h2
              className="text-2xl font-semibold leading-snug sm:text-3xl lg:text-4xl lg:leading-snug"
              style={{ fontFamily: heading, letterSpacing: "-0.03em" }}
            >
              Five-stage pipeline that turns your words into living narrative
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-white/45 lg:text-[15px] lg:leading-6">
              Every turn flows through policy validation, event selection, state
              reduction, memory summarization, and AI generation — producing
              narration, dialogue, and world-state changes in real time.
            </p>
          </div>

          <div className="flex-1 overflow-hidden rounded-2xl border border-white/8">
            {PIPELINE.map((step, i) => (
              <div
                key={step.label}
                className={`flex items-center gap-3 px-5 py-4 sm:gap-4 sm:px-6 ${
                  i === 0
                    ? "bg-[#8fd1cb]/8"
                    : "bg-white/[0.02]"
                } ${i < PIPELINE.length - 1 ? "border-b border-white/6" : ""}`}
              >
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${
                    i === 0 ? "bg-[#8fd1cb]" : "bg-[#8fd1cb]/60"
                  }`}
                />
                <span
                  className={`text-xs font-medium flex-shrink-0 ${
                    i === 0 ? "text-[#8fd1cb]" : "text-[#8fd1cb]/60"
                  }`}
                  style={{ fontFamily: mono }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium">{step.label}</span>
                <span className="ml-auto hidden text-xs text-white/35 sm:block">
                  {step.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── World Builder ── */}
      <section className="px-6 pb-24 sm:px-10 sm:pb-32 lg:px-20 lg:pb-36">
        <div className="flex flex-col gap-8 lg:flex-row-reverse lg:gap-16">
          <div className="flex flex-1 flex-col gap-6 lg:pt-4">
            <p
              className="text-[10px] uppercase tracking-[0.2em] text-white/40"
              style={{ fontFamily: mono }}
            >
              World Builder
            </p>
            <h2
              className="text-2xl font-semibold leading-snug sm:text-3xl lg:text-4xl lg:leading-snug"
              style={{ fontFamily: heading, letterSpacing: "-0.03em" }}
            >
              Describe any world. We&rsquo;ll build it for you.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-white/45 lg:text-[15px] lg:leading-6">
              Write a prompt in plain language. The AI generates a complete world
              definition — characters with voices and emotional baselines,
              groups with influence scores, event triggers, and a full initial
              state.
            </p>
          </div>

          <div className="flex-1 overflow-hidden rounded-2xl border border-white/8">
            <div className="flex items-center gap-1.5 border-b border-white/6 bg-white/[0.04] px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span
                className="ml-3 text-[11px] text-white/30"
                style={{ fontFamily: mono }}
              >
                world-builder
              </span>
            </div>
            <div className="flex flex-col gap-4 bg-white/[0.02] p-5 sm:p-6">
              <p className="rounded-lg border border-white/6 bg-white/[0.04] p-4 text-sm leading-relaxed text-white/60">
                A pirate captain navigating the golden age of Caribbean piracy.
                Manage your crew&rsquo;s loyalty, negotiate with colonial powers,
                and decide whether to pursue freedom or fortune...
              </p>
              <div>
                <span
                  className="inline-block rounded-lg bg-[#8fd1cb] px-5 py-2.5 text-xs font-semibold text-[#0a0a0a]"
                  style={{ fontFamily: mono }}
                >
                  Build World
                </span>
              </div>
              <div className="border-t border-white/6 pt-4">
                <p
                  className="text-[9px] uppercase tracking-[0.15em] text-white/30"
                  style={{ fontFamily: mono }}
                >
                  Generated
                </p>
                <p
                  className="mt-2 text-lg font-semibold"
                  style={{ fontFamily: heading }}
                >
                  The Buccaneer&rsquo;s Gambit
                </p>
                <p className="mt-1 text-xs text-white/40">
                  4 characters &middot; 3 groups &middot; 5 events &middot; 1
                  role
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Use Cases ── */}
      <section className="px-6 pb-24 sm:px-10 sm:pb-32 lg:px-20 lg:pb-36">
        <p
          className="text-[10px] uppercase tracking-[0.2em] text-white/40"
          style={{ fontFamily: mono }}
        >
          The Opportunity
        </p>
        <h2
          className="mt-4 text-2xl font-semibold leading-snug sm:text-3xl lg:text-4xl lg:leading-snug"
          style={{ fontFamily: heading, letterSpacing: "-0.03em" }}
        >
          Three dimensions of immersion
        </h2>

        <div className="mt-12 grid gap-4 sm:grid-cols-3 lg:mt-16">
          {USE_CASES.map((uc, i) => (
            <div
              key={uc.abbr}
              className="flex flex-col overflow-hidden rounded-2xl border border-white/6"
            >
              <div
                className="flex h-32 flex-shrink-0 items-center justify-center sm:h-44 lg:h-52"
                style={{
                  background: `linear-gradient(135deg, rgba(143,209,203,${0.12 - i * 0.03}) 0%, rgba(143,209,203,${0.03 - i * 0.01}) 100%)`,
                }}
              >
                <span
                  className="text-5xl font-light text-[#8fd1cb]/30 lg:text-6xl"
                  style={{ fontFamily: heading }}
                >
                  {uc.abbr}
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-between bg-white/[0.03] p-6 sm:p-7">
                <div>
                  <h3
                    className="text-lg font-semibold lg:text-xl"
                    style={{ fontFamily: heading }}
                  >
                    {uc.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/45">
                    {uc.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vision + Roadmap ── */}
      <section className="px-6 py-24 sm:px-10 sm:py-32 lg:px-20 lg:py-36">
        <p
          className="text-[10px] uppercase tracking-[0.2em] text-white/40"
          style={{ fontFamily: mono }}
        >
          The Vision
        </p>
        <p
          className="mt-6 max-w-[800px] text-2xl font-medium leading-snug text-white/85 sm:text-3xl sm:leading-snug lg:text-4xl lg:leading-snug"
          style={{ fontFamily: heading, letterSpacing: "-0.03em" }}
        >
          The most fluid, immersive world engine that allows anyone to be fully
          engaged in a complex and dynamic space.
        </p>

        <div className="mt-16 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:gap-6">
          {PHASES.map((ph) => (
            <div
              key={ph.phase}
              className={`rounded-xl p-5 lg:p-7 ${
                ph.active
                  ? "border-l-2 border-l-[#8fd1cb] bg-[#8fd1cb]/[0.04]"
                  : "border-l-2 border-l-white/10 bg-white/[0.02]"
              }`}
            >
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-widest ${
                  ph.active
                    ? "bg-[#8fd1cb]/15 text-[#8fd1cb]"
                    : "bg-white/6 text-white/35"
                }`}
                style={{ fontFamily: mono }}
              >
                {ph.active ? "Active" : "Upcoming"}
              </span>
              <p
                className={`mt-3 text-base font-semibold lg:text-lg ${
                  ph.active ? "text-white" : "text-white/50"
                }`}
                style={{ fontFamily: heading }}
              >
                {ph.phase}
              </p>
              <p
                className={`mt-1 text-sm font-medium ${
                  ph.active ? "text-white/70" : "text-white/40"
                }`}
              >
                {ph.title}
              </p>
              <p
                className={`mt-2 text-xs leading-relaxed ${
                  ph.active ? "text-white/45" : "text-white/30"
                }`}
              >
                {ph.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden border-t border-white/6 px-6 py-20 text-center sm:px-10 sm:py-28 lg:px-20">
        <div className="absolute inset-0">
          <MeshGradient />
        </div>
        <div className="relative z-10">
          <h2
            className="text-3xl font-bold sm:text-4xl lg:text-5xl"
            style={{ fontFamily: heading, letterSpacing: "-0.04em" }}
          >
            Your next world is waiting
          </h2>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/50 sm:text-base">
            Choose a world, step inside, and discover what happens when every
            choice matters.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/about"
              className="inline-flex items-center justify-center rounded-full bg-[#8fd1cb] px-8 py-3.5 text-sm font-semibold text-[#0a0a0a] transition-all hover:scale-[1.03] hover:brightness-110"
              style={{ fontFamily: mono }}
            >
              Explore Worlds
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-8 py-3.5 text-sm text-white/80 transition-all hover:scale-[1.03] hover:border-white/30 hover:bg-white/15"
              style={{ fontFamily: mono }}
            >
              Read the About
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/6 px-6 py-8 sm:px-10 lg:px-20">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
          <Image
            src="/kawabunga_wordmark.svg"
            alt="Kawabunga"
            width={178}
            height={24}
            className="h-5 w-auto opacity-50"
          />
          <div className="flex gap-6 sm:gap-8">
            {["About", "Builder", "Engine", "Roadmap"].map((label) => (
              <Link
                key={label}
                href={
                  label === "About"
                    ? "/about"
                    : `http://localhost:3001/${label.toLowerCase()}`
                }
                className="text-xs text-white/30 transition-colors hover:text-white/60"
              >
                {label}
              </Link>
            ))}
          </div>
          <span className="text-[11px] text-white/20">
            Built with conviction, not permission.
          </span>
        </div>
      </footer>
    </main>
  );
}
