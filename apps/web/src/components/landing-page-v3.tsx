"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { MeshGradient } from "./mesh-gradient";
import { RootFooter } from "./root-footer";
import { ScrollStoryShowcase } from "./scroll-story-showcase";

const heading = "var(--font-heading)";
const mono = "var(--font-mono)";

const EXPERIENCE_CATEGORIES = [
  {
    label: "Education",
    body: "The best way to learn is Socratically. Study for a test or step into history through conversation — like an audio time machine.",
    tags: ["Einstein", "Shakespeare", "George Washington"],
  },
  {
    label: "Creation",
    body: "Turn your ideas and source material into original characters, stories, and responsive worlds.",
    tags: ["Original personalities", "Living casts", "Custom worlds"],
  },
  {
    label: "Entertainment",
    body: "Enter fantasy adventures and mysteries that remember your choices and change around you.",
    tags: ["Fantasy quests", "Mysteries & roleplay", "Play with friends"],
  },
];

const FEATURES = [
  {
    title: "Living AI Characters",
    body: "Speak naturally and they answer in kind. Characters remember what happened, relationships evolve, and an entire cast can share the same scene.",
    context: "Entertainment",
  },
  {
    title: "Historically Accurate Characters",
    body: "Bring any historical character back to life — from Einstein and Shakespeare to George Washington. Speak with them, question their ideas, and learn like never before.",
    context: "Education",
  },
  {
    title: "Transparent Sources",
    body: "Historical characters are grounded in curated source material. Each character’s Sources page shows where their knowledge comes from, so exploration stays credible.",
    context: "Education",
  },
  {
    title: "Create Your Own Characters",
    body: "Turn notes, documents, and research into a living personality with a voice, memory, worldview, and relationships of its own.",
    context: "Creation",
  },
  {
    title: "Build Your Own Worlds",
    body: "Build a fantasy kingdom, a mystery, a pirate ship, or a universe entirely your own. Every choice can move the story somewhere new — the possibilities are endless.",
    context: "Creation · Entertainment",
  },
];

const KAWABUNGA_PRINCIPLES = [
  {
    title: "Speak naturally",
    body: "The world listens, understands, and answers in real time.",
  },
  {
    title: "Shape what happens",
    body: "Every choice can redirect relationships, scenes, and stories.",
  },
  {
    title: "Return to something living",
    body: "Characters remember the conversation, so the experience carries its own continuity.",
  },
];

const HOW_IT_WORKS = [
  {
    title: "Relevant Context",
    body: "The knowledge graph finds the people, events, places, and ideas that matter for this exact moment, giving every response focused understanding.",
  },
  {
    title: "Scene Direction",
    body: "The orchestrator chooses who speaks, advances the story, and cues narration, ambience, and sound — keeping the experience coherent and alive.",
  },
];

const TECHNOLOGY_SLIDES = [
  {
    title: "Knowledge Graph Architecture",
    body: "Thousands of facts become connected people, events, places, and ideas. The right context surfaces for each question instead of loading an entire library at once.",
  },
  {
    title: "Source Ingestion Pipeline",
    body: "Documents, books, and research are mapped into structured pages, relationships, timelines, and source-backed passages a character can actually use.",
  },
  {
    title: "Provenance & Citations",
    body: "Knowledge keeps its connection to the original passage and citation, so important claims can be inspected instead of taken on faith.",
  },
  {
    title: "Real-Time Orchestration",
    body: "A real-time director selects the next speaker, gives the scene its next beat, and coordinates narration, ambience, and sound effects.",
  },
  {
    title: "Adaptive Environmental Audio",
    body: "Ambient sound changes with the setting while precisely timed effects land with the action, letting every room and world feel present.",
  },
  {
    title: "Audio Wave Field",
    body: "Voice and atmosphere become a living visual field that moves with every word, giving the scene a pulse you can see as well as hear.",
  },
];

type RevealVariant = "up" | "left" | "right" | "scale" | "fade";

function Reveal({
  children,
  className = "",
  delay = 0,
  variant = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: RevealVariant;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisible(true);
        observer.unobserve(entry.target);
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`motion-reveal ${className}`}
      data-reveal-state={visible ? "visible" : "hidden"}
      data-reveal-variant={variant}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function ParallaxLayer({
  children,
  className = "",
  speed = 0.06,
  maxOffset = 48,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
  maxOffset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const viewportCenter = window.innerHeight / 2;
      const elementCenter = rect.top + rect.height / 2;
      const offset = Math.max(-maxOffset, Math.min(maxOffset, (viewportCenter - elementCenter) * speed));
      element.style.setProperty("--parallax-y", `${offset.toFixed(2)}px`);
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, [maxOffset, speed]);

  return (
    <div ref={ref} className={`motion-parallax ${className}`}>
      {children}
    </div>
  );
}

function ImageCarousel({
  slides,
  initialIndex = 0,
}: {
  slides: Array<{ title: string; body: string }>;
  initialIndex?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(initialIndex);

  const scrollToSlide = (index: number) => {
    const card = trackRef.current?.children[index] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  // Start centered on `initialIndex` so its neighbors peek on load, rather
  // than always opening on the first card. A direct `scrollLeft` write
  // keeps this instant, with no scroll animation on first paint.
  useEffect(() => {
    const track = trackRef.current;
    const card = track?.children[initialIndex] as HTMLElement | undefined;
    if (!track || !card) return;
    const cardRect = card.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    track.scrollLeft += cardRect.left - trackRect.left + cardRect.width / 2 - track.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const viewportCenter = track.getBoundingClientRect().left + track.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;
    Array.from(track.children).forEach((child, idx) => {
      const rect = (child as HTMLElement).getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = idx;
      }
    });
    setActive(closestIndex);
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-[6%] sm:gap-6 sm:px-[13%] lg:px-[20%]"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.title}
            className="relative flex aspect-square w-full flex-shrink-0 snap-center overflow-hidden rounded-2xl border border-[#0b3732]/10 bg-[#f1f7f5] sm:aspect-[16/10]"
          >
            {/* Image placeholder — becomes the card's background once real art is dropped in. */}
            <div className="cinematic-surface absolute inset-0 flex items-center justify-center bg-[#e8f1ef]">
              <span
                className="text-[10px] uppercase tracking-[0.2em] text-[#07110f]/20"
                style={{ fontFamily: mono }}
              >
                Image
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/45 to-transparent" />

            <span
              className="absolute left-5 top-5 rounded-full border border-[#0b3732]/15 bg-white/70 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[#07110f]/65 backdrop-blur-sm"
              style={{ fontFamily: mono }}
            >
              {String(i + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
            </span>

            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <h3 className="text-2xl font-semibold sm:text-3xl" style={{ fontFamily: heading }}>
                {slide.title}
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[#07110f]/65 sm:text-base">
                {slide.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        {slides.map((slide, i) => (
          <button
            key={slide.title}
            type="button"
            onClick={() => scrollToSlide(i)}
            aria-label={`Go to ${slide.title}`}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-6 bg-[#14877e]" : "w-1.5 bg-[#07110f]/15 hover:bg-[#07110f]/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ExperienceConnector() {
  return (
    <div className="flex h-10 items-center justify-center lg:h-auto lg:w-10" aria-hidden="true">
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        className="rotate-90 text-[#14877e]/45 lg:rotate-0"
      >
        <line x1="3" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" />
        <path d="M29 14l7 6-7 6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/**
 * A hybrid of the two reference layouts: three connected square cards set up
 * the kinds of worlds Kawabunga can become, then alternating editorial rows
 * create a zigzag down the page. The empty surfaces are intentionally blank so
 * art, product UI, motion, or video can be added later without redesigning the
 * content structure.
 */
function ExperienceCanvas({
  categories,
  features,
}: {
  categories: Array<{ label: string; body: string; tags: string[] }>;
  features: Array<{ title: string; body: string; context: string }>;
}) {
  return (
    <div className="px-6 sm:px-10 lg:px-20">
      <Reveal>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p
            className="text-[11px] uppercase tracking-[0.2em] text-[#0f756d]"
            style={{ fontFamily: mono }}
          >
            Choose the kind of world
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-[#07110f]/55 sm:text-right">
            Learn inside it. Create it from scratch. Or enter it purely for the experience.
          </p>
        </div>
      </Reveal>

      <div className="grid items-center lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)_40px_minmax(0,1fr)]">
        {categories.map((category, i) => (
          <Fragment key={category.label}>
            <Reveal delay={i * 110} variant="scale" className="h-full">
              <article className="flex min-h-[380px] flex-col overflow-hidden rounded-3xl border border-[#0b3732]/10 bg-[#f1f7f5] lg:aspect-square lg:min-h-0">
                <div className="cinematic-surface min-h-24 flex-1 bg-[#e8f1ef]" aria-hidden="true" />
                <div className="border-t border-[#0b3732]/10 p-5 sm:p-6">
                  <span
                    className="text-[10px] uppercase tracking-[0.2em] text-[#07110f]/35"
                    style={{ fontFamily: mono }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3
                    className="mt-2 text-xl font-semibold text-[#0f756d] sm:text-2xl"
                    style={{ fontFamily: heading }}
                  >
                    {category.label}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#07110f]/60 sm:text-sm">{category.body}</p>
                  <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5">
                    {category.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] uppercase tracking-[0.09em] text-[#07110f]/38"
                        style={{ fontFamily: mono }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            </Reveal>
            {i < categories.length - 1 && (
              <Reveal delay={i * 110 + 140} variant="fade">
                <ExperienceConnector />
              </Reveal>
            )}
          </Fragment>
        ))}
      </div>

      <div className="mt-24 border-t border-[#0b3732]/10 pt-10 sm:mt-32 sm:pt-12">
        <Reveal>
          <div className="mb-14 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="text-2xl font-semibold sm:text-3xl" style={{ fontFamily: heading }}>
              What makes it feel alive
            </h3>
            <p className="max-w-sm text-sm leading-relaxed text-[#07110f]/55 sm:text-right">
              Five connected capabilities, each with room to become its own visual story.
            </p>
          </div>
        </Reveal>

        <div className="space-y-20 sm:space-y-28 lg:space-y-32">
          {features.map((feature, i) => {
            const canvasOnRight = i % 2 === 0;

            return (
              <article key={feature.title} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-0">
                <Reveal
                  className={`lg:row-start-1 lg:col-span-4 ${
                    canvasOnRight ? "lg:col-start-1" : "lg:col-start-9"
                  }`}
                  variant={canvasOnRight ? "left" : "right"}
                >
                  <div>
                    <p
                      className="text-[10px] uppercase tracking-[0.2em] text-[#0f756d]"
                      style={{ fontFamily: mono }}
                    >
                      {String(i + 1).padStart(2, "0")} — {feature.context}
                    </p>
                    <h4
                      className="mt-4 max-w-md text-2xl font-semibold leading-tight sm:text-3xl"
                      style={{ fontFamily: heading, letterSpacing: "-0.025em" }}
                    >
                      {feature.title}
                    </h4>
                    <p className="mt-4 max-w-md text-sm leading-relaxed text-[#07110f]/60 sm:text-base sm:leading-7">
                      {feature.body}
                    </p>
                  </div>
                </Reveal>

                <Reveal
                  delay={100}
                  variant="scale"
                  className={`aspect-[16/10] rounded-3xl border border-[#0b3732]/10 bg-[#f1f7f5] lg:row-start-1 lg:col-span-7 ${
                    canvasOnRight ? "lg:col-start-6" : "lg:col-start-1"
                  }`}
                >
                  <div className="cinematic-surface h-full w-full rounded-3xl" aria-hidden="true" />
                </Reveal>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function LandingPageV3() {
  useEffect(() => {
    document.documentElement.classList.add("motion-ready");
    return () => document.documentElement.classList.remove("motion-ready");
  }, []);

  return (
    <>
      <main
        className="relative z-10 flex w-full flex-col rounded-b-4xl bg-white text-[#07110f]"
        style={{ fontFamily: "var(--font-body)" }}
      >
        <ScrollStoryShowcase embedded />

      {/* ── What is Kawabunga ── */}
      <section
        id="what-is-kawabunga"
        className="relative bg-white px-6 py-24 before:pointer-events-none before:absolute before:inset-x-0 before:-top-40 before:h-40 before:bg-gradient-to-b before:from-transparent before:to-white sm:px-10 sm:py-28 lg:px-20 lg:py-32"
      >
        <div className="relative z-10 grid gap-14 lg:grid-cols-12 lg:items-start lg:gap-8">
          <Reveal className="lg:col-span-5">
            <div>
              <p
                className="text-[10px] uppercase tracking-[0.2em] text-[#0f756d]"
                style={{ fontFamily: mono }}
              >
                A new kind of medium
              </p>
              <h2
                className="mt-4 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl lg:leading-tight"
                style={{ fontFamily: heading, letterSpacing: "-0.03em" }}
              >
                What is Kawabunga
              </h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-[#07110f]/80 sm:text-xl">
                Not a chatbot. <span className="text-[#0f756d]">A world that becomes whatever you need it to be.</span>
              </p>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-[#07110f]/55 lg:text-base lg:leading-7">
                Living audio worlds where voices, characters, and stories respond to you in real time.
              </p>
            </div>
          </Reveal>

          <div className="border-y border-[#0b3732]/10 lg:col-span-6 lg:col-start-7">
            {KAWABUNGA_PRINCIPLES.map((principle, i) => (
              <Reveal
                key={principle.title}
                delay={i * 100}
                variant="right"
                className="border-b border-[#0b3732]/10 last:border-b-0"
              >
                <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-4 py-6 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-6 sm:py-7">
                  <span
                    className="pt-1 text-[10px] tracking-[0.18em] text-[#07110f]/35"
                    style={{ fontFamily: mono }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold sm:text-2xl" style={{ fontFamily: heading }}>
                      {principle.title}
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-[#07110f]/55 sm:text-base">
                      {principle.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="pb-24 pt-12 sm:pb-32 sm:pt-16 lg:pb-36">
        <div className="px-6 sm:px-10 lg:px-20">
          <Reveal>
            <h2
              className="max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl lg:leading-tight"
              style={{ fontFamily: heading, letterSpacing: "-0.03em" }}
            >
              The Kawabunga Experience
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#0f756d] lg:text-base lg:leading-7">
              Everything that makes a world feel alive.
            </p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#07110f]/60 lg:text-base lg:leading-7">
              Browse what&rsquo;s possible.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 sm:mt-20">
          <ExperienceCanvas categories={EXPERIENCE_CATEGORIES} features={FEATURES} />
        </div>
      </section>

      {/* ── How It Works · Technology ── */}
      <section id="how-it-works" className="px-6 py-24 sm:px-10 sm:py-32 lg:px-20 lg:py-36">
        <Reveal>
          <h2
            className="max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl lg:leading-tight"
            style={{ fontFamily: heading, letterSpacing: "-0.03em" }}
          >
            How It Works
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#0f756d] lg:text-base lg:leading-7">
            Three systems, working together in real time.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#07110f]/55 lg:text-base lg:leading-7">
            Source material becomes a character&rsquo;s mind. Relevant knowledge surfaces for each turn, and an invisible director turns it into a responsive scene.
          </p>
        </Reveal>

        {/* Character Brain — the signature graphic, given the most room. */}
        <Reveal className="mt-14" variant="scale">
          <div className="relative flex aspect-square w-full overflow-hidden rounded-2xl border border-[#0b3732]/10 bg-[#f1f7f5] sm:aspect-[21/9]">
            <div className="cinematic-surface absolute inset-0 flex items-center justify-center bg-[#e8f1ef]">
              <span
                className="text-[10px] uppercase tracking-[0.2em] text-[#07110f]/20"
                style={{ fontFamily: mono }}
              >
                Diagram
              </span>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-white via-white/45 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <h3 className="text-2xl font-semibold sm:text-3xl" style={{ fontFamily: heading }}>
                Character Brain
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-[#07110f]/65 sm:text-base">
                Sources become structured knowledge, and structured knowledge becomes a character with a distinct identity, perspective, and understanding of its world.
              </p>
            </div>
          </div>
        </Reveal>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-6">
          {HOW_IT_WORKS.map((item, i) => (
            <Reveal key={item.title} delay={i * 120} variant="scale">
              <div className="relative flex aspect-square w-full overflow-hidden rounded-2xl border border-[#0b3732]/10 bg-[#f1f7f5] sm:aspect-video">
                <div className="cinematic-surface absolute inset-0 flex items-center justify-center bg-[#e8f1ef]">
                  <span
                    className="text-[10px] uppercase tracking-[0.2em] text-[#07110f]/20"
                    style={{ fontFamily: mono }}
                  >
                    Diagram
                  </span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-white via-white/45 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                  <h3 className="text-xl font-semibold sm:text-2xl" style={{ fontFamily: heading }}>
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#07110f]/65 sm:text-base">
                    {item.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Same "How It Works" category, more of the technology — kept as a
            distinct carousel design within this section rather than a
            separate section with its own header. */}
        <div className="mt-16">
          <Reveal>
            <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p
                  className="text-[10px] uppercase tracking-[0.2em] text-[#0f756d]"
                  style={{ fontFamily: mono }}
                >
                  Inside the engine
                </p>
                <h3 className="mt-3 text-2xl font-semibold sm:text-3xl" style={{ fontFamily: heading }}>
                  Technology that disappears into the experience
                </h3>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-[#07110f]/55 lg:text-right">
                Each layer handles one part of the work, so the person inside the world only has to speak, listen, and choose what happens next.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120} variant="scale">
            <ImageCarousel slides={TECHNOLOGY_SLIDES} initialIndex={3} />
          </Reveal>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden rounded-b-4xl border-t border-[#0b3732]/10 px-6 py-20 text-center sm:px-10 sm:py-28 lg:px-20">
        <ParallaxLayer className="absolute -inset-y-12 inset-x-0" speed={0.04} maxOffset={24}>
          <MeshGradient />
        </ParallaxLayer>
        <Reveal className="relative z-10" variant="scale">
          <div>
            <h2
              className="text-3xl font-bold sm:text-4xl lg:text-5xl"
              style={{ fontFamily: heading, letterSpacing: "-0.04em" }}
            >
              Welcome to Kawabunga
            </h2>
            <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-[#07110f]/60 sm:text-base">
              Choose a world, step inside, and discover what happens when every
              choice matters.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/about"
                className="inline-flex items-center justify-center rounded-full bg-[#14877e] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.03] hover:brightness-95"
                style={{ fontFamily: mono }}
              >
                Explore Worlds
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center justify-center rounded-full border border-[#0b3732]/15 bg-white/70 px-8 py-3.5 text-sm text-[#07110f]/80 transition-all hover:scale-[1.03] hover:border-[#0b3732]/30 hover:bg-white"
                style={{ fontFamily: mono }}
              >
                Read the About
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      </main>
      <div
        data-footer-reveal-sentinel
        aria-hidden="true"
        className="h-[75svh] w-full"
      />
      <RootFooter />
    </>
  );
}
