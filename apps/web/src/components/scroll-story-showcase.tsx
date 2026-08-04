"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SceneScatter, type SceneScatterHandle } from "./scene-scatter";


const clamp = (value: number) => Math.min(1, Math.max(0, value));
const AUDIO_WAVE_HEIGHTS = [12, 20, 8, 24, 14, 18, 10];
const AUDIO_WAVE_OPACITIES = [0.5, 0.7, 0.4, 1, 0.6, 0.8, 0.45];

function smoothstep(start: number, end: number, value: number) {
  const progress = clamp((value - start) / (end - start));
  return progress * progress * (3 - 2 * progress);
}

export function ScrollStoryShowcase({ embedded = false }: { embedded?: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const scrollContainerRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const stickyViewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heroStillRef = useRef<HTMLImageElement>(null);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const heroShadeRef = useRef<HTMLDivElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);
  const whiteWashRef = useRef<HTMLDivElement>(null);
  const cardsLayerRef = useRef<HTMLDivElement>(null);
  const scatterRef = useRef<SceneScatterHandle>(null);

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

    const scatter = scatterRef.current;
    let frame = 0;
    let targetProgress = 0;
    let renderedProgress = 0;
    let videoDuration = 5.083;
    let videoReady = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    let desiredVideoTime = 0;
    let seekInFlight = false;
    let cardsTriggered = false;

    const resetCards = () => {
      cardsTriggered = false;
      if (cardsLayerRef.current) {
        cardsLayerRef.current.style.opacity = "0";
        cardsLayerRef.current.style.pointerEvents = "none";
      }
      scatter?.reset();
    };

    const triggerCards = () => {
      cardsTriggered = true;
      if (cardsLayerRef.current) {
        cardsLayerRef.current.style.opacity = "1";
        cardsLayerRef.current.style.pointerEvents = "auto";
      }
      scatter?.reveal();
    };

    resetCards();

    const seekVideo = () => {
      if (!videoReady || seekInFlight || video.seeking || video.seekable.length === 0) {
        return;
      }

      const seekableStart = video.seekable.start(0);
      const seekableEnd = video.seekable.end(video.seekable.length - 1);
      const nextTime = Math.min(
        seekableEnd,
        Math.max(seekableStart, desiredVideoTime),
      );

      if (Math.abs(video.currentTime - nextTime) <= 0.035) return;

      seekInFlight = true;
      video.currentTime = nextTime;
    };

    const render = () => {
      renderedProgress += (targetProgress - renderedProgress) * 0.14;
      const progress = renderedProgress;

      // Budget for the section, in progress: the video scrubs, the wash takes
      // over, the scatter reveals itself, the composition then *holds* so it
      // can be read, and only then lifts away into the next section.
      const heroOut = smoothstep(0.07, 0.24, progress);
      const videoProgress = smoothstep(0.04, 0.44, progress);
      const washIn = smoothstep(0.40, 0.52, progress);
      const exit = smoothstep(0.86, 1, progress);

      desiredVideoTime = Math.min(
        videoDuration - 0.025,
        videoProgress * videoDuration,
      );
      seekVideo();

      video.style.transform = `scale(${1 + videoProgress * 0.045})`;

      if (heroStillRef.current) {
        heroStillRef.current.style.opacity =
          `${videoReady ? 1 - smoothstep(0.004, 0.045, progress) : 1}`;
      }
      if (heroCopyRef.current) {
        heroCopyRef.current.style.opacity = `${1 - heroOut}`;
        heroCopyRef.current.style.transform =
          `translate3d(0, ${heroOut * -64}px, 0) scale(${1 - heroOut * 0.035})`;
      }
      if (heroShadeRef.current) {
        heroShadeRef.current.style.opacity = `${1 - smoothstep(0.015, 0.14, progress)}`;
      }
      if (scrollCueRef.current) {
        scrollCueRef.current.style.opacity = `${1 - smoothstep(0.02, 0.13, progress)}`;
      }
      if (whiteWashRef.current) {
        whiteWashRef.current.style.opacity = `${washIn}`;
      }
      if (!cardsTriggered && progress >= 0.50) triggerCards();
      if (cardsTriggered && progress < 0.42) resetCards();
      scatter?.setExit(exit);

      if (Math.abs(targetProgress - renderedProgress) > 0.0005) {
        frame = requestAnimationFrame(render);
      } else {
        frame = 0;
      }
    };

    const measure = () => {
      const viewportHeight =
        stickyViewportRef.current?.offsetHeight ??
        (embedded
          ? window.innerHeight
          : scrollContainer?.clientHeight ?? window.innerHeight);
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

    const handleLoadedData = () => {
      videoReady = true;
      seekVideo();
      measure();
    };

    const handleSeeked = () => {
      seekInFlight = false;
      seekVideo();
      if (!frame) frame = requestAnimationFrame(render);
    };

    const primeVideo = () => {
      void video
        .play()
        .then(() => {
          video.pause();
          seekVideo();
        })
        .catch(() => {
          // The poster remains visible when a mobile browser declines playback.
        });
    };

    video.addEventListener("loadedmetadata", handleMetadata);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("progress", measure);
    window.addEventListener("touchstart", primeVideo, {
      passive: true,
      once: true,
    });
    if (embedded) {
      window.addEventListener("scroll", measure, { passive: true });
    } else {
      scrollContainer?.addEventListener("scroll", measure, { passive: true });
    }
    window.addEventListener("resize", measure);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      scatter?.reset();
      video.removeEventListener("loadedmetadata", handleMetadata);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("progress", measure);
      window.removeEventListener("touchstart", primeVideo);
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
      <div data-scroll-story>
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
          <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />
          <HeroCopy />
        </section>
        <section className="relative h-[100svh] bg-white">
          <SceneScatter revealed />
        </section>
      </div>
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
    <section
      ref={rootRef}
      data-scroll-story
      className="relative h-[520svh] w-full flex-none bg-white"
    >
        <div
          ref={stickyViewportRef}
          className="sticky top-0 h-[100svh] overflow-hidden bg-[#07110f]"
        >
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            muted
            playsInline
            preload="auto"
            poster="/landing-hero-lg.jpg"
            aria-hidden="true"
          >
            <source
              src="/kawabunga-scroll-story-mobile.mp4"
              type="video/mp4"
              media="(max-width: 767px)"
            />
            <source src="/kawabunga-scroll-story-hd.mp4" type="video/mp4" />
          </video>
          <div className="pointer-events-none absolute inset-0">
            <Image
              ref={heroStillRef}
              src="/landing-hero-lg.jpg"
              alt=""
              fill
              priority
              className="object-cover will-change-[opacity]"
              sizes="100vw"
            />
          </div>

          <div
            ref={heroShadeRef}
            className="absolute inset-0"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />
          </div>
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

          <div ref={cardsLayerRef} className="absolute inset-0 z-20 opacity-0">
            <SceneScatter ref={scatterRef} />
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
            <span className="text-[var(--color-accent-strong)] sm:whitespace-nowrap">
              Step into any world
            </span>
            <br />
            you can imagine
          </h1>
        </div>
        <div className="flex flex-col items-start gap-4">
          <AudioWaveBars />
          <p
            className="max-w-sm text-sm leading-6 text-white/65"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Speak naturally. Shape the narrative. Experience a world that
            remembers every choice you make.
          </p>
        </div>
      </div>
    </div>
  );
}

function AudioWaveBars() {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const animate = () => {
      const time = performance.now() / 1000;

      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        const wave = Math.sin(time * 2.5 + index * 0.9) * 0.4 + 0.6;
        bar.style.height = `${AUDIO_WAVE_HEIGHTS[index] * wave}px`;
        bar.style.opacity = `${AUDIO_WAVE_OPACITIES[index] * (0.5 + wave * 0.5)}`;
      });

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex h-6 items-end gap-[3px]" aria-hidden="true">
      {AUDIO_WAVE_HEIGHTS.map((height, index) => (
        <span
          key={index}
          ref={(element) => {
            barsRef.current[index] = element;
          }}
          className="w-[3px] rounded-full bg-[var(--color-accent-strong)]"
          style={{ height, opacity: AUDIO_WAVE_OPACITIES[index] }}
        />
      ))}
    </div>
  );
}

function ClosingSection() {
  return (
    <section className="bg-white px-6 pb-8 sm:px-10 lg:px-20">
      <div className="mx-auto flex min-h-[70svh] max-w-[1440px] flex-col justify-between overflow-hidden rounded-[28px] bg-[#09221f] p-7 text-white sm:p-10 lg:min-h-[78svh] lg:p-16">
        <p
          className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-accent-strong)]"
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
              className="rounded-full bg-[var(--color-accent-strong)] px-6 py-3 text-sm font-medium text-[var(--color-accent-on)] transition-transform hover:scale-[1.03]"
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
