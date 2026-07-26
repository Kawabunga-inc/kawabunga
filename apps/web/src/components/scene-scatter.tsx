"use client";

import Image from "next/image";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * The scatter composition is authored against a fixed 1440x900 stage so card
 * proportions, rotations, and overlaps stay exactly as designed. The stage is
 * scaled to `cover` the viewport at runtime, which lets the edge cards bleed
 * off-screen the way the layout intends. The centre CTA deliberately lives
 * outside the scaled stage so its typography stays under normal responsive
 * control instead of growing with the viewport.
 */
type Stage = { w: number; h: number };

const DESKTOP_STAGE: Stage = { w: 1440, h: 900 };
/**
 * Portrait needs its own composition, not a scaled desktop one: covering a
 * 390x844 viewport with the 1440x900 stage pushes most cards off-screen.
 */
const MOBILE_STAGE: Stage = { w: 390, h: 844 };

/** How far outside its resting spot a card starts, in stage units. */
const ENTRY_PUSH = 210;

type Card = {
  id: string;
  kind: "scene" | "character" | "create";
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  /** Photo fill. Cards without one use `field` instead. */
  src?: string;
  /** Focal point for the photo crop. */
  position?: string;
  /** Gradient used when a card has no photograph of its own. */
  field?: string;
  kicker?: string;
  kickerColor?: string;
  title?: string;
  titleSize?: number;
  meta?: string;
  labelAt?: "top" | "bottom";
  labelInset?: number;
  live?: boolean;
  /** Small character cards drop the dates line and show the name only. */
  compact?: boolean;
};

const SCENE_FIELDS = {
  graphite: "linear-gradient(140deg,#3A3A42 0%,#17171C 58%,#08080A 100%)",
  abyss: "linear-gradient(160deg,#0B3A4E 0%,#06202C 58%,#030C11 100%)",
  violet: "linear-gradient(135deg,#3D1E42 0%,#1A0D1E 58%,#08050A 100%)",
  navy: "linear-gradient(130deg,#16304A 0%,#0A1724 58%,#04090E 100%)",
  amber: "linear-gradient(160deg,#4A3115 0%,#1C1206 58%,#0A0703 100%)",
} as const;

const CARDS: Card[] = [
  {
    id: "firstwood",
    kind: "scene",
    x: -22,
    y: -72,
    w: 520,
    h: 304,
    rotate: -5,
    src: "/scatter/scene-firstwood.webp",
    position: "50% 46%",
    kicker: "Fantasy · The Firstwood",
    kickerColor: "#8FD1CB",
    title: "The Glowing Wood",
    titleSize: 34,
    live: true,
  },
  {
    id: "cleopatra",
    kind: "character",
    x: 302,
    y: 158,
    w: 124,
    h: 124,
    rotate: 8,
    src: "/scatter/char-cleopatra.webp",
    position: "center 12%",
    title: "Cleopatra VII",
    compact: true,
  },
  {
    id: "apollo",
    kind: "scene",
    x: 474,
    y: -58,
    w: 300,
    h: 190,
    rotate: 3,
    field: SCENE_FIELDS.graphite,
    kicker: "Space · July 1969",
    kickerColor: "#E8B45E",
    title: "Apollo 11, Descent",
    titleSize: 22,
  },
  {
    id: "churchill",
    kind: "character",
    x: 842,
    y: -52,
    w: 172,
    h: 172,
    rotate: -5,
    src: "/scatter/char-churchill.webp",
    position: "center 12%",
    kicker: "Leaders",
    kickerColor: "#60A5FA",
    title: "Winston Churchill",
    meta: "Britain · 1874–1965",
  },
  {
    id: "trench",
    kind: "scene",
    x: 1094,
    y: -66,
    w: 238,
    h: 344,
    rotate: 6,
    field: SCENE_FIELDS.abyss,
    kicker: "Exploration · Pacific",
    kickerColor: "#7FB2E0",
    title: "The Deep Trench",
    titleSize: 26,
  },
  {
    id: "lincoln",
    kind: "character",
    x: 1318,
    y: 266,
    w: 118,
    h: 118,
    rotate: -8,
    src: "/scatter/char-lincoln.webp",
    position: "center 12%",
    title: "A. Lincoln",
    compact: true,
  },
  {
    id: "washington",
    kind: "character",
    x: 22,
    y: 382,
    w: 158,
    h: 158,
    rotate: 5,
    src: "/scatter/char-washington.webp",
    position: "center 14%",
    kicker: "Leaders",
    kickerColor: "#60A5FA",
    title: "G. Washington",
    meta: "America · 1732–1799",
  },
  {
    id: "salon",
    kind: "scene",
    x: -42,
    y: 594,
    w: 296,
    h: 184,
    rotate: -3,
    field: SCENE_FIELDS.violet,
    kicker: "Arts · Paris 1889",
    kickerColor: "#C79BE0",
    title: "The Salon",
    titleSize: 22,
    labelInset: 56,
  },
  {
    id: "baker",
    kind: "scene",
    x: 466,
    y: 678,
    w: 480,
    h: 292,
    rotate: -4,
    field: SCENE_FIELDS.navy,
    kicker: "Mystery · London 1891",
    kickerColor: "#7FB2E0",
    title: "Baker Street, 3am",
    titleSize: 32,
    labelAt: "top",
  },
  {
    id: "alexandria",
    kind: "scene",
    x: 1004,
    y: 632,
    w: 196,
    h: 278,
    rotate: 5,
    field: SCENE_FIELDS.amber,
    kicker: "Antiquity · Egypt 48 BC",
    kickerColor: "#E8B45E",
    title: "Alexandria Harbor",
    titleSize: 21,
    labelAt: "top",
  },
  {
    id: "create",
    kind: "create",
    x: 1248,
    y: 596,
    w: 164,
    h: 164,
    rotate: -6,
    title: "Create your own",
  },
];

/** A trimmed set that keeps the centre clear on a tall, narrow viewport. */
const MOBILE_CARDS: Card[] = [
  { ...pick("firstwood"), x: -36, y: -40, w: 300, h: 180, rotate: -5, titleSize: 22 },
  { ...pick("churchill"), x: 268, y: 26, w: 128, h: 128, rotate: 6, compact: true, meta: undefined },
  { ...pick("washington"), x: -30, y: 170, w: 116, h: 116, rotate: 4, compact: true, meta: undefined },
  { ...pick("apollo"), x: 238, y: 180, w: 190, h: 120, rotate: -4, titleSize: 17 },
  { ...pick("create"), x: -28, y: 574, w: 118, h: 118, rotate: -6 },
  { ...pick("baker"), x: 104, y: 596, w: 300, h: 186, rotate: -4, titleSize: 22 },
  { ...pick("lincoln"), x: -34, y: 712, w: 118, h: 118, rotate: 7 },
];

function pick(id: string): Card {
  const card = CARDS.find((item) => item.id === id);
  if (!card) throw new Error(`Unknown scatter card: ${id}`);
  return card;
}

/**
 * Cards arrive outermost-first so the frame builds inward toward the CTA.
 * Distance is measured from the stage centre, which is also the axis each
 * card travels along.
 */
const distanceFromCentre = (card: Card, stage: Stage) =>
  Math.hypot(card.x + card.w / 2 - stage.w / 2, card.y + card.h / 2 - stage.h / 2);

const entryOrderFor = (cards: Card[], stage: Stage) =>
  [...cards]
    .sort((a, b) => distanceFromCentre(b, stage) - distanceFromCentre(a, stage))
    .map((card) => card.id);

function entryTransform(card: Card, stage: Stage) {
  const dx = card.x + card.w / 2 - stage.w / 2;
  const dy = card.y + card.h / 2 - stage.h / 2;
  const length = Math.hypot(dx, dy) || 1;
  const push = stage === MOBILE_STAGE ? 120 : ENTRY_PUSH;
  const outX = (dx / length) * push;
  const outY = (dy / length) * push;
  // Cards further clockwise of centre unwind from a slightly wider angle.
  const spin = card.rotate + (dx >= 0 ? 6 : -6);
  return `translate3d(${outX.toFixed(1)}px, ${outY.toFixed(1)}px, 0) rotate(${spin}deg) scale(0.92)`;
}

const restTransform = (card: Card) =>
  `translate3d(0, 0, 0) rotate(${card.rotate}deg) scale(1)`;

/**
 * Idle motion — a slow drift that runs once a card has landed so the
 * composition keeps breathing instead of freezing. Amplitude and period are
 * derived from the card index so no two cards share a rhythm; without that
 * they visibly pulse in unison. Keyframes start and end at rest, so the loop
 * can begin at any point without a jump.
 */
function idleKeyframes(index: number) {
  const lift = 5 + (index % 3) * 2.5;
  const tilt = (index % 2 === 0 ? 1 : -1) * (0.35 + (index % 3) * 0.2);
  return {
    keyframes: [
      { transform: "translate3d(0, 0, 0) rotate(0deg)" },
      { transform: `translate3d(0, ${-lift}px, 0) rotate(${tilt}deg)` },
      { transform: "translate3d(0, 0, 0) rotate(0deg)" },
    ],
    duration: 5200 + (index % 4) * 900,
    // Desync the loops so the field never lines up on a single beat.
    offset: (index * 1310) % 4200,
  };
}

/** How far the lowest cards travel on the way out, in stage units. */
const EXIT_LIFT = 260;

/**
 * Only the lower half of the field takes part in the exit. Weighting by the
 * card's vertical centre means the bottom cards clear first and the top ones
 * barely move, so the section hands off upward instead of sliding as a slab.
 */
function exitWeight(card: Card, stage: Stage) {
  const centre = card.y + card.h / 2;
  const start = stage.h * 0.42;
  return Math.min(1, Math.max(0, (centre - start) / (stage.h - start)));
}

export type SceneScatterHandle = {
  reveal: () => void;
  reset: () => void;
  /** Scroll-linked exit, 0 at rest through 1 fully lifted. */
  setExit: (value: number) => void;
};

/**
 * `revealed` renders the composition already settled — used by the
 * reduced-motion path, which shows the same scatter without the entry.
 */
export const SceneScatter = forwardRef<SceneScatterHandle, { revealed?: boolean }>(
  function SceneScatter({ revealed = false }, ref) {
    const stageRef = useRef<HTMLDivElement>(null);
    const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const floatRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const exitRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const ctaExitRef = useRef<HTMLDivElement>(null);
    const ctaRefs = useRef<(HTMLDivElement | null)[]>([]);
    const animations = useRef<Animation[]>([]);
    const idleAnimations = useRef<Animation[]>([]);
    const [portrait, setPortrait] = useState(false);

    const stage = portrait ? MOBILE_STAGE : DESKTOP_STAGE;
    const cards = portrait ? MOBILE_CARDS : CARDS;
    const entryOrder = useMemo(
      () => entryOrderFor(cards, stage),
      [cards, stage],
    );

    useEffect(() => {
      const query = window.matchMedia("(max-width: 767px)");
      const sync = () => setPortrait(query.matches);
      sync();
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }, []);

    // Scale the fixed stage to cover the viewport so edge cards keep bleeding
    // off-screen at every window size.
    useEffect(() => {
      const node = stageRef.current;
      if (!node) return;

      const fit = () => {
        const scale = Math.max(
          window.innerWidth / stage.w,
          window.innerHeight / stage.h,
        );
        node.style.transform = `translate(-50%, -50%) scale(${scale})`;
      };

      fit();
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }, [stage]);

    const startIdle = (id: string, index: number) => {
      const node = floatRefs.current[id];
      if (!node) return;

      const { keyframes, duration, offset } = idleKeyframes(index);
      const drift = node.animate(keyframes, {
        duration,
        iterations: Infinity,
        easing: "ease-in-out",
      });
      drift.currentTime = offset;
      idleAnimations.current.push(drift);
    };

    // The drift loops forever, so it must not keep the compositor busy once
    // the section has scrolled away.
    useEffect(() => {
      const node = stageRef.current;
      if (!node) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          const onScreen = entry?.isIntersecting ?? false;
          idleAnimations.current.forEach((drift) => {
            if (onScreen) drift.play();
            else drift.pause();
          });
        },
        { threshold: 0 },
      );

      observer.observe(node);
      return () => observer.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      reset() {
        animations.current.forEach((animation) => animation.cancel());
        animations.current = [];
        idleAnimations.current.forEach((drift) => drift.cancel());
        idleAnimations.current = [];

        cards.forEach((card) => {
          const node = cardRefs.current[card.id];
          if (!node) return;
          node.style.opacity = "0";
          node.style.transform = entryTransform(card, stage);
          node.style.willChange = "transform, opacity";
        });
        ctaRefs.current.forEach((node) => {
          if (!node) return;
          node.style.opacity = "0";
          node.style.transform = "translate3d(0, 24px, 0)";
        });
      },

      setExit(value) {
        cards.forEach((card) => {
          const node = exitRefs.current[card.id];
          if (!node) return;
          const lift = exitWeight(card, stage) * EXIT_LIFT * value;
          node.style.transform =
            lift > 0.1 ? `translate3d(0, ${(-lift).toFixed(1)}px, 0)` : "";
        });
        // The centre lifts with the field so the whole frame clears together,
        // on its own wrapper because the reveal still owns the inner transform.
        if (ctaExitRef.current) {
          ctaExitRef.current.style.transform =
            value > 0.001
              ? `translate3d(0, ${(-value * 90).toFixed(1)}px, 0)`
              : "";
          ctaExitRef.current.style.opacity = `${1 - value * 0.85}`;
        }
      },

      reveal() {
        entryOrder.forEach((id, index) => {
          const card = cards.find((item) => item.id === id);
          const node = cardRefs.current[id];
          if (!card || !node) return;

          const animation = node.animate(
            [
              { opacity: 0, transform: entryTransform(card, stage) },
              { opacity: 1, transform: restTransform(card) },
            ],
            {
              duration: 900,
              delay: index * 55,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "forwards",
            },
          );
          // Drop the compositor hint once the card has landed, then hand the
          // card over to its idle drift.
          animation.finished
            .then(() => {
              node.style.willChange = "auto";
              startIdle(id, index);
            })
            .catch(() => {});
          animations.current.push(animation);
        });

        // The centre reads as its own beat, starting once the frame is mostly
        // built rather than competing with the cards for attention.
        ctaRefs.current.forEach((node, index) => {
          if (!node) return;
          animations.current.push(
            node.animate(
              [
                { opacity: 0, transform: "translate3d(0, 24px, 0)" },
                { opacity: 1, transform: "translate3d(0, 0, 0)" },
              ],
              {
                duration: 620,
                delay: 450 + index * 140,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                fill: "forwards",
              },
            ),
          );
        });
      },
    }));

    return (
      <div className="absolute inset-0 overflow-hidden">
        <div
          ref={stageRef}
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 origin-center"
          style={{ width: stage.w, height: stage.h }}
        >
          {cards.map((card) => (
            // Three layers on purpose, each owning one transform: the outer
            // is the scroll-linked exit, the middle is the idle drift, the
            // inner is the entry. Sharing a `transform` would make them
            // overwrite each other.
            <div
              key={card.id}
              ref={(node) => {
                exitRefs.current[card.id] = node;
              }}
              className="absolute"
              style={{
                left: card.x,
                top: card.y,
                width: card.w,
                height: card.h,
              }}
            >
              <div
                ref={(node) => {
                  floatRefs.current[card.id] = node;
                }}
                className="h-full w-full"
              >
                <div
                  ref={(node) => {
                    cardRefs.current[card.id] = node;
                  }}
                  className="h-full w-full"
                  style={{
                    transform: revealed
                      ? restTransform(card)
                      : entryTransform(card, stage),
                    opacity: revealed ? 1 : 0,
                    willChange: revealed ? "auto" : "transform, opacity",
                  }}
                >
                  <ScatterCard card={card} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          ref={ctaExitRef}
          className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
        >
          <div
            ref={(node) => {
              ctaRefs.current[0] = node;
            }}
            style={{ opacity: revealed ? 1 : 0 }}
          >
            <p
              className="text-[10px] uppercase tracking-[0.24em] text-[#14877e]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Every one of these is open
            </p>
            <h2
              className="mt-5 text-[clamp(3rem,7vw,6rem)] font-bold leading-[0.9] tracking-[-0.06em] text-[#07110f]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Explore Worlds
            </h2>
          </div>

          <div
            ref={(node) => {
              ctaRefs.current[1] = node;
            }}
            style={{ opacity: revealed ? 1 : 0 }}
          >
            <p className="mt-5 max-w-md text-sm leading-6 text-[#07110f]/55 sm:text-[15px]">
              Enter a world that already exists, or describe one that
              doesn&rsquo;t yet.
            </p>
          </div>

          <div
            ref={(node) => {
              ctaRefs.current[2] = node;
            }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4"
            style={{ opacity: revealed ? 1 : 0 }}
          >
            <button
              type="button"
              className="inline-flex h-[50px] items-center gap-2 rounded-full bg-[#14877e] px-7 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <PlayIcon />
              Enter a scene
            </button>
            <button
              type="button"
              className="text-[13px] text-[#0f756d] transition-colors hover:text-[#07110f]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Create a scene &rarr;
            </button>
          </div>
        </div>
      </div>
    );
  },
);

function ScatterCard({ card }: { card: Card }) {
  if (card.kind === "create") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-[9px] rounded-[18px] border-[1.5px] border-dashed border-[#14877e]/40 bg-[#8fd1cb]/[0.07]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#14877e]/30 bg-[#8fd1cb]/15 text-xl text-[#0f756d]">
          +
        </div>
        <span
          className="text-sm font-semibold text-[#07110f]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {card.title}
        </span>
      </div>
    );
  }

  const isCharacter = card.kind === "character";
  const radius = card.w >= 460 ? 22 : card.w >= 190 ? 20 : 15;
  const labelAtTop = card.labelAt === "top";

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#0A0F12] shadow-[0_26px_58px_rgba(7,17,15,0.20)]"
      style={{ borderRadius: radius }}
    >
      {card.src ? (
        <Image
          src={card.src}
          alt=""
          fill
          sizes={`${card.w}px`}
          className="object-cover"
          style={{ objectPosition: card.position, filter: "saturate(72%)" }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: card.field }} />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg,rgba(7,17,15,0.05) 0%,rgba(7,17,15,0) 42%,rgba(7,17,15,0.92) 100%)",
        }}
      />

      {card.live && (
        <div className="absolute right-4 top-[15px] flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E5484D]" />
          <span
            className="text-[8px] uppercase tracking-[0.14em] text-white/85"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Live now
          </span>
        </div>
      )}

      {isCharacter && card.kicker && (
        <span
          className="absolute right-3 top-3 text-[8px] uppercase tracking-[0.11em]"
          style={{ fontFamily: "var(--font-mono)", color: card.kickerColor }}
        >
          {card.kicker}
        </span>
      )}

      <div
        className="absolute flex flex-col gap-1.5"
        style={{
          left: card.labelInset ?? (isCharacter ? 14 : 20),
          right: 14,
          [labelAtTop ? "top" : "bottom"]: labelAtTop ? 22 : 16,
        }}
      >
        {!isCharacter && card.kicker && (
          <span
            className="text-[9px] uppercase tracking-[0.16em]"
            style={{ fontFamily: "var(--font-mono)", color: card.kickerColor }}
          >
            {card.kicker}
          </span>
        )}
        <span
          className="font-bold tracking-[-0.03em] text-white"
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: isCharacter ? (card.compact ? 13 : 16) : card.titleSize,
            lineHeight: 1,
            fontWeight: isCharacter ? 600 : 700,
          }}
        >
          {card.title}
        </span>
        {card.meta && (
          <span
            className="text-[9px] text-white/50"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {card.meta}
          </span>
        )}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 8l6 4-6 4z" fill="currentColor" />
    </svg>
  );
}
