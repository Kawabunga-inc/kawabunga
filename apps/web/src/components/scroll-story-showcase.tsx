"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const STORIES = [
  {
    number: "01",
    eyebrow: "Live the lesson",
    title: "Experiential understanding",
    body: "Enter a historical crisis, a boardroom, or a first-contact scenario. Understanding comes from experience, not explanation.",
  },
  {
    number: "02",
    eyebrow: "Practice the moment",
    title: "Deliberate practice",
    body: "Rehearse interviews, negotiations, and difficult conversations in a world that listens, remembers, and responds.",
  },
  {
    number: "03",
    eyebrow: "Create the impossible",
    title: "New media",
    body: "Build responsive worlds where characters have memory and every choice changes what becomes possible next.",
  },
] as const;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function smoothstep(start: number, end: number, value: number) {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

export function ScrollStoryShowcase({ embedded = false }: { embedded?: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heroStillRef = useRef<HTMLImageElement>(null);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const heroShadeRef = useRef<HTMLDivElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);
  const whiteWashRef = useRef<HTMLDivElement>(null);
  const cardsLayerRef = useRef<HTMLDivElement>(null);
  const cardsHeadingRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const root = rootRef.current;
    const scrollContainer = scrollContainerRef.current;
    const video = videoRef.current;
    if (!root || (!embedded && !scrollContainer) || !video) return;

    let frame = 0;
    let targetProgress = 0;
    let renderedProgress = 0;
    let videoDuration = 5.083;
    let cardsTriggered = false;
    let cardAnimations: Animation[] = [];

    const resetCards = () => {
      cardsTriggered = false;
      cardAnimations.forEach((animation) => animation.cancel());
      cardAnimations = [];

      if (cardsLayerRef.current) {
        cardsLayerRef.current.style.opacity = "0";
        cardsLayerRef.current.style.pointerEvents = "none";
      }
      if (cardsHeadingRef.current) {
        cardsHeadingRef.current.style.opacity = "0";
        cardsHeadingRef.current.style.transform = "translate3d(0, 32px, 0)";
      }
      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        card.style.opacity = "0";
        card.style.transform =
          `translate3d(0, ${72 + index * 18}px, 0) rotate(${(index - 1) * 1.5}deg)`;
      });
    };

    const triggerCards = () => {
      cardsTriggered = true;

      if (cardsLayerRef.current) {
        cardsLayerRef.current.style.opacity = "1";
        cardsLayerRef.current.style.pointerEvents = "auto";
      }
      if (cardsHeadingRef.current) {
        cardAnimations.push(
          cardsHeadingRef.current.animate(
            [
              { opacity: 0, transform: "translate3d(0, 32px, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            {
              duration: 520,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "forwards",
            },
          ),
        );
      }
      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        cardAnimations.push(
          card.animate(
            [
              {
                opacity: 0,
                transform: `translate3d(0, ${72 + index * 18}px, 0) rotate(${(index - 1) * 1.5}deg)`,
              },
              { opacity: 1, transform: "translate3d(0, 0, 0) rotate(0deg)" },
            ],
            {
              duration: 680,
              delay: 90 + index * 115,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "forwards",
            },
          ),
        );
      });
    };

    resetCards();

    const render = () => {
      renderedProgress += (targetProgress - renderedProgress) * 0.14;
      const progress = renderedProgress;

      const heroOut = smoothstep(0.07, 0.24, progress);
      const videoProgress = smoothstep(0.04, 0.72, progress);
      const washIn = smoothstep(0.69, 0.82, progress);

      if (video.readyState >= 1) {
        const nextTime = Math.min(videoDuration - 0.025, videoProgress * videoDuration);
        if (Math.abs(video.currentTime - nextTime) > 0.018) {
          video.currentTime = nextTime;
        }
      }

      video.style.transform = `scale(${1 + videoProgress * 0.045})`;

      if (heroStillRef.current) {
        heroStillRef.current.style.opacity =
          `${1 - smoothstep(0.004, 0.045, progress)}`;
      }
      if (heroCopyRef.current) {
        heroCopyRef.current.style.opacity = `${1 - heroOut}`;
        heroCopyRef.current.style.transform =
          `translate3d(0, ${heroOut * -64}px, 0) scale(${1 - heroOut * 0.035})`;
      }
      if (heroShadeRef.current) {
        heroShadeRef.current.style.opacity = `${1 - smoothstep(0.12, 0.56, progress)}`;
      }
      if (scrollCueRef.current) {
        scrollCueRef.current.style.opacity = `${1 - smoothstep(0.02, 0.13, progress)}`;
      }
      if (whiteWashRef.current) {
        whiteWashRef.current.style.opacity = `${washIn}`;
      }
      if (!cardsTriggered && progress >= 0.755) triggerCards();
      if (cardsTriggered && progress < 0.68) resetCards();
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${Math.max(progress, 0.015)})`;
      }

      if (Math.abs(targetProgress - renderedProgress) > 0.0005) {
        frame = requestAnimationFrame(render);
      } else {
        frame = 0;
      }
    };

    const measure = () => {
      const viewportHeight = embedded
        ? window.innerHeight
        : scrollContainer?.clientHeight ?? window.innerHeight;
      const distance = Math.max(1, root.offsetHeight - viewportHeight);
      targetProgress = embedded
        ? clamp(-root.getBoundingClientRect().top / distance)
        : clamp(((scrollContainer?.scrollTop ?? 0) - root.offsetTop) / distance);
      if (!frame) frame = requestAnimationFrame(render);
    };

    const handleMetadata = () => {
      if (Number.isFinite(video.duration)) videoDuration = video.duration;
      measure();
    };

    video.addEventListener("loadedmetadata", handleMetadata);
    if (embedded) {
      window.addEventListener("scroll", measure, { passive: true });
    } else {
      scrollContainer?.addEventListener("scroll", measure, { passive: true });
    }
    window.addEventListener("resize", measure);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      cardAnimations.forEach((animation) => animation.cancel());
      video.removeEventListener("loadedmetadata", handleMetadata);
      if (embedded) {
        window.removeEventListener("scroll", measure);
      } else {
        scrollContainer?.removeEventListener("scroll", measure);
      }
      window.removeEventListener("resize", measure);
    };
  }, [embedded, reducedMotion]);

  if (reducedMotion) {
    const reducedSequence = (
      <>
        <section className="relative flex min-h-[100svh] overflow-hidden bg-[#07110f] text-white">
          <Image
            src="/landing-hero-lg.jpg"
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/35" />
          <HeroCopy />
        </section>
        <StoryCards />
      </>
    );

    if (embedded) return reducedSequence;

    return (
      <main className="h-screen overflow-y-auto bg-white text-[#081b19]">
        {reducedSequence}
        <ClosingSection />
      </main>
    );
  }

  const sequence = (
    <section ref={rootRef} className="relative h-[480svh] w-full flex-none bg-white">
        <div className="sticky top-0 h-[100svh] overflow-hidden bg-[#07110f]">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            muted
            playsInline
            preload="auto"
            poster="/landing-hero-lg.jpg"
            aria-hidden="true"
          >
            <source src="/kawabunga-scroll-story.mp4" type="video/mp4" />
          </video>
          <Image
            ref={heroStillRef}
            src="/landing-hero-lg.jpg"
            alt=""
            fill
            priority
            className="pointer-events-none object-cover will-change-[opacity]"
            sizes="100vw"
          />

          <div
            ref={heroShadeRef}
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />
          <div
            ref={whiteWashRef}
            className="pointer-events-none absolute inset-0 bg-white opacity-0"
          />

          <div ref={heroCopyRef} className="absolute inset-0 will-change-transform">
            <HeroCopy />
          </div>

          <div
            ref={scrollCueRef}
            className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-3 text-white sm:bottom-9"
          >
            <span
              className="text-[9px] uppercase tracking-[0.24em] text-white/60"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Scroll to enter
            </span>
            <span className="relative h-10 w-px overflow-hidden bg-white/25">
              <span className="absolute left-0 top-0 h-1/2 w-full animate-pulse bg-white" />
            </span>
          </div>

          <div
            ref={cardsLayerRef}
            className="absolute inset-0 z-20 flex items-center opacity-0"
          >
            <StoryCards
              headingRef={cardsHeadingRef}
              cardRefs={cardRefs}
              layered
            />
          </div>

          <div className="absolute bottom-0 left-0 z-40 h-[2px] w-full bg-black/10">
            <div
              ref={progressRef}
              className="h-full origin-left scale-x-0 bg-[#14877e]"
            />
          </div>
        </div>
    </section>
  );

  if (embedded) return sequence;

  return (
    <main
      ref={scrollContainerRef}
      aria-label="Kawabunga scroll story"
      tabIndex={0}
      className="h-screen overflow-y-auto overscroll-y-contain bg-white text-[#081b19] focus:outline-none"
    >
      {sequence}
      <ClosingSection />
    </main>
  );
}

function HeroCopy() {
  return (
    <div className="relative z-10 flex h-full items-end px-6 pb-24 text-white sm:px-10 sm:pb-24 lg:px-20 lg:pb-28">
      <div className="flex w-full flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p
            className="mb-5 text-[10px] uppercase tracking-[0.22em] text-[#a8e6df]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Voice-first immersive reality
          </p>
          <h1
            className="text-[clamp(2.75rem,5.5vw,5.75rem)] font-medium leading-[0.9] tracking-[-0.055em]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <span className="text-[#8fd1cb] sm:whitespace-nowrap">
              Step into any world
            </span>
            <br />
            you can imagine
          </h1>
        </div>
        <p
          className="max-w-sm text-sm leading-6 text-white/65"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Speak naturally. Shape the narrative. Experience a world that
          remembers every choice you make.
        </p>
      </div>
    </div>
  );
}

type StoryCardsProps = {
  headingRef?: React.RefObject<HTMLDivElement | null>;
  cardRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>;
  layered?: boolean;
};

function StoryCards({ headingRef, cardRefs, layered = false }: StoryCardsProps) {
  return (
    <section
      className={`w-full bg-white px-6 text-[#081b19] sm:px-10 lg:px-20 ${
        layered ? "py-14 sm:py-16 md:py-24" : "py-24 sm:py-32"
      }`}
    >
      <div className="mx-auto max-w-[1440px]">
        <div
          ref={headingRef}
          className={layered ? "opacity-0 will-change-transform" : ""}
        >
          <p
            className="text-[10px] uppercase tracking-[0.22em] text-[#14877e]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            One engine, infinite realities
          </p>
          <h2
            className="mt-4 max-w-3xl text-3xl font-medium leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Worlds built to move with you.
          </h2>
        </div>

        <div
          className={`grid md:grid-cols-3 ${
            layered
              ? "mt-8 gap-2 sm:mt-9 md:mt-14 md:gap-3 lg:gap-5"
              : "mt-10 gap-3 sm:mt-14 lg:gap-5"
          }`}
        >
          {STORIES.map((story, index) => (
            <div
              key={story.number}
              ref={(node) => {
                if (cardRefs) cardRefs.current[index] = node;
              }}
              className={`group flex flex-col justify-between rounded-[24px] border border-[#0b3732]/10 bg-[#f1f7f5] transition-colors duration-300 hover:bg-[#e4f2ef] lg:p-8 ${
                layered
                  ? "min-h-[145px] p-5 opacity-0 will-change-transform sm:min-h-[155px] md:min-h-[290px] md:p-7"
                  : "min-h-[250px] p-6 sm:min-h-[290px] sm:p-7"
              }`}
            >
              <div className="flex items-start justify-between">
                <span
                  className="text-[10px] uppercase tracking-[0.17em] text-[#14877e]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {story.eyebrow}
                </span>
                <span
                  className="text-xs text-[#081b19]/35"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {story.number}
                </span>
              </div>
              <div>
                <h3
                  className={`max-w-xs font-medium leading-tight tracking-[-0.03em] lg:text-3xl ${
                    layered ? "text-xl sm:text-2xl" : "text-2xl"
                  }`}
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {story.title}
                </h3>
                <p
                  className={`max-w-sm text-sm text-[#163c37]/60 ${
                    layered
                      ? "mt-2 line-clamp-2 leading-5 md:mt-4 md:line-clamp-none md:leading-6"
                      : "mt-4 leading-6"
                  }`}
                >
                  {story.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingSection() {
  return (
    <section className="bg-white px-6 pb-8 sm:px-10 lg:px-20">
      <div className="mx-auto flex min-h-[70svh] max-w-[1440px] flex-col justify-between overflow-hidden rounded-[28px] bg-[#09221f] p-7 text-white sm:p-10 lg:min-h-[78svh] lg:p-16">
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[#8fd1cb]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          The next world is waiting
        </p>
        <div>
          <h2
            className="max-w-4xl text-4xl font-medium leading-[0.95] tracking-[-0.05em] sm:text-6xl lg:text-8xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Don&apos;t just watch the story. Enter it.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/about"
              className="rounded-full bg-[#8fd1cb] px-6 py-3 text-sm font-medium text-[#07110f] transition-transform hover:scale-[1.03]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Explore worlds
            </Link>
            <Link
              href="/"
              className="rounded-full border border-white/20 px-6 py-3 text-sm text-white/75 transition-colors hover:border-white/40 hover:text-white"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Current home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
