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
import { createPortal } from "react-dom";

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
  subtitle?: string;
  titleSize?: number;
  meta?: string;
  /** Optional source-image ratio used by the enlarged view. */
  expandedAspectRatio?: number;
  labelAt?: "top" | "bottom";
  labelInset?: number;
  live?: boolean;
  /** Small character cards drop the dates line and show the name only. */
  compact?: boolean;
};

const CARDS: Card[] = [
  {
    id: "tea-party",
    kind: "scene",
    x: 12,
    y: 64,
    w: 480,
    h: 270,
    rotate: -5,
    src: "/scatter/scene-mad-tea-party.webp",
    position: "50% 48%",
    kicker: "Fantasy · Wonderland",
    kickerColor: "#8FD1CB",
    title: "The Mad Tea Party",
    titleSize: 32,
  },
  {
    id: "manhattan",
    kind: "scene",
    x: 505,
    y: 55,
    w: 495,
    h: 205,
    rotate: 2,
    src: "/scatter/scene-manhattan-project.webp",
    position: "55% 12%",
    kicker: "Education · Los Alamos 1945",
    kickerColor: "#A9CFA8",
    title: "The Manhattan Project",
    titleSize: 30,
    expandedAspectRatio: 1586 / 992,
  },
  {
    id: "vinland",
    kind: "scene",
    x: 1068,
    y: 62,
    w: 236,
    h: 315,
    rotate: 6,
    src: "/scatter/scene-voyage-vinland.webp",
    position: "48% 54%",
    kicker: "Viking Age · North Atlantic 1000",
    kickerColor: "#79CED0",
    title: "Voyage to Vinland",
    titleSize: 24,
  },
  {
    id: "shakespeare",
    kind: "character",
    x: 1190,
    y: 382,
    w: 128,
    h: 150,
    rotate: -5,
    src: "/scatter/char-shakespeare.webp",
    position: "center 10%",
    kicker: "Writers",
    kickerColor: "#55BFC0",
    title: "W. Shakespeare",
    meta: "England · 1564–1616",
    compact: true,
  },
  {
    id: "washington",
    kind: "character",
    x: 20,
    y: 375,
    w: 164,
    h: 162,
    rotate: 5,
    src: "/scatter/char-washington.webp",
    position: "center 14%",
    kicker: "Leaders",
    kickerColor: "#60A5FA",
    title: "G. Washington",
    meta: "America · 1732–1799",
  },
  {
    id: "waterloo",
    kind: "scene",
    x: 18,
    y: 570,
    w: 360,
    h: 260,
    rotate: -3,
    src: "/scatter/scene-waterloo.webp",
    position: "50% 50%",
    kicker: "Napoleonic Wars · 1815",
    kickerColor: "#72C9D1",
    title: "The Battle of Waterloo",
    titleSize: 24,
    labelInset: 20,
  },
  {
    id: "abraham",
    kind: "scene",
    x: 445,
    y: 570,
    w: 510,
    h: 275,
    rotate: -4,
    src: "/scatter/scene-abrahams-tent.webp",
    position: "50% 52%",
    kicker: "Ancient World · Canaan",
    kickerColor: "#E8B45E",
    title: "Abraham’s Tent",
    titleSize: 32,
  },
  {
    id: "versailles",
    kind: "scene",
    x: 995,
    y: 610,
    w: 225,
    h: 200,
    rotate: 5,
    src: "/scatter/scene-treaty-versailles.webp",
    position: "50% 48%",
    kicker: "Diplomacy · Versailles 1919",
    kickerColor: "#72C9D1",
    title: "The Treaty of Versailles",
    titleSize: 18,
  },
  {
    id: "create",
    kind: "create",
    x: 1242,
    y: 555,
    w: 180,
    h: 205,
    rotate: -6,
    src: "/scatter/scene-europa-below.webp",
    position: "center",
    title: "Make Your Own World",
    subtitle: "Try: Europa Below",
  },
];

/** A trimmed set that keeps the centre clear on a tall, narrow viewport. */
const MOBILE_CARDS: Card[] = [
  { ...pick("tea-party"), x: -36, y: -40, w: 300, h: 180, rotate: -5, titleSize: 22 },
  { ...pick("washington"), x: -30, y: 170, w: 116, h: 116, rotate: 4, compact: true, meta: undefined },
  { ...pick("manhattan"), x: 230, y: 22, w: 205, h: 128, rotate: 4, titleSize: 17 },
  { ...pick("create"), x: -28, y: 574, w: 118, h: 118, rotate: -6 },
  { ...pick("abraham"), x: 104, y: 596, w: 300, h: 186, rotate: -4, titleSize: 22 },
  { ...pick("shakespeare"), x: -34, y: 712, w: 118, h: 118, rotate: 7 },
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
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);

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

    useEffect(() => {
      if (!selectedCard) return;

      const preventScroll = (event: Event) => event.preventDefault();
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setSelectedCard(null);
          return;
        }

        if (
          ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(
            event.key,
          )
        ) {
          event.preventDefault();
        }
      };

      window.addEventListener("keydown", closeOnEscape);
      window.addEventListener("wheel", preventScroll, { passive: false });
      window.addEventListener("touchmove", preventScroll, { passive: false });
      return () => {
        window.removeEventListener("keydown", closeOnEscape);
        window.removeEventListener("wheel", preventScroll);
        window.removeEventListener("touchmove", preventScroll);
      };
    }, [selectedCard]);

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
                  {card.kind === "create" ? (
                    <ScatterCard card={card} />
                  ) : (
                    <button
                      type="button"
                      aria-label={`Open ${card.title ?? "calling card"}`}
                      aria-haspopup="dialog"
                      className="group h-full w-full cursor-pointer rounded-[inherit] text-left outline-none transition-[filter] duration-300 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#55ddd1] focus-visible:ring-offset-4 focus-visible:ring-offset-white"
                      onClick={() => setSelectedCard(pick(card.id))}
                    >
                      <ScatterCard card={card} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          ref={ctaExitRef}
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
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
              className="pointer-events-auto inline-flex h-[50px] items-center gap-2 rounded-full bg-[#14877e] px-7 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <PlayIcon />
              Enter a scene
            </button>
            <button
              type="button"
              className="pointer-events-auto text-[13px] text-[#0f756d] transition-colors hover:text-[#07110f]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Create a scene &rarr;
            </button>
          </div>
        </div>

        {selectedCard && (
          <ExpandedCardDialog
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
          />
        )}
      </div>
    );
  },
);

function ExpandedCardDialog({
  card,
  onClose,
}: {
  card: Card;
  onClose: () => void;
}) {
  const aspectRatio = card.expandedAspectRatio ?? card.w / card.h;
  const maxWidth = card.kind === "character" ? 520 : 820;
  const viewportHeightWidth = Math.round(aspectRatio * 78);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${card.title ?? "Calling card"} enlarged view`}
      className="card-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center px-5 py-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#03110e]/30 backdrop-blur-[16px] backdrop-saturate-150" />
      <div
        className="card-dialog-enter relative"
        style={{
          width: `min(88vw, ${maxWidth}px, ${viewportHeightWidth}vh)`,
          aspectRatio: `${aspectRatio}`,
        }}
      >
        <ScatterCard card={card} expanded />
        <button
          type="button"
          autoFocus
          aria-label="Close enlarged card"
          onClick={onClose}
          className="absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-[#07110f] text-xl text-white shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55ddd1]"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}

function ScatterCard({
  card,
  expanded = false,
}: {
  card: Card;
  expanded?: boolean;
}) {
  if (card.kind === "create") {
    const compactCreate = card.w < 150;

    return (
      <div className="relative h-full w-full overflow-hidden rounded-[18px] border-[1.5px] border-dashed border-[#14877e]/55 bg-[#dceff0] text-center shadow-[0_22px_48px_rgba(20,135,126,0.16)]">
        {card.src && (
          <Image
            src={card.src}
            alt=""
            fill
            sizes={`${card.w}px`}
            className="object-cover"
            style={{
              objectPosition: card.position,
              filter: "brightness(0.9) contrast(1.28) saturate(1.2)",
            }}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02)_0%,rgba(239,250,250,0.08)_45%,rgba(239,249,249,0.88)_76%,rgba(239,249,249,0.98)_100%)]" />
        <div
          className="absolute left-1/2 top-[31%] z-10 flex -translate-x-1/2 items-center justify-center rounded-xl border border-[#14877e]/35 bg-white/78 font-medium text-[#0f756d] shadow-[0_10px_24px_rgba(7,17,15,0.12)] backdrop-blur-[5px]"
          style={{
            width: compactCreate ? 34 : 44,
            height: compactCreate ? 34 : 44,
            fontSize: compactCreate ? 18 : 22,
          }}
        >
          +
        </div>
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-2"
          style={{ paddingBottom: compactCreate ? 12 : 19 }}
        >
          <span
            className="font-semibold leading-[0.98] tracking-[-0.02em] text-[#07110f]"
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: compactCreate ? 13 : 17,
            }}
          >
            {card.title}
          </span>
          {card.subtitle && (
            <span
              className="mt-2 text-[#0f756d]/85"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: compactCreate ? 7 : 8,
              }}
            >
              {card.subtitle}
            </span>
          )}
        </div>
      </div>
    );
  }

  const isCharacter = card.kind === "character";
  const radius = expanded ? 28 : card.w >= 460 ? 22 : card.w >= 190 ? 20 : 15;
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
          sizes={expanded ? "(max-width: 768px) 88vw, 820px" : `${card.w}px`}
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
        <div
          className="absolute flex items-center gap-1.5"
          style={{ right: expanded ? 24 : 16, top: expanded ? 24 : 15 }}
        >
          <span
            className="rounded-full bg-[#E5484D]"
            style={{ width: expanded ? 8 : 6, height: expanded ? 8 : 6 }}
          />
          <span
            className="uppercase tracking-[0.14em] text-white/85"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: expanded ? 11 : 8,
            }}
          >
            Live now
          </span>
        </div>
      )}

      {isCharacter && card.kicker && (
        <span
          className="absolute uppercase tracking-[0.11em]"
          style={{
            fontFamily: "var(--font-mono)",
            color: card.kickerColor,
            right: expanded ? 24 : 12,
            top: expanded ? 24 : 12,
            fontSize: expanded ? 11 : 8,
          }}
        >
          {card.kicker}
        </span>
      )}

      <div
        className="absolute flex flex-col"
        style={{
          gap: expanded ? 10 : 6,
          left: expanded
            ? isCharacter
              ? 28
              : 36
            : card.labelInset ?? (isCharacter ? 14 : 20),
          right: expanded ? 28 : 14,
          [labelAtTop ? "top" : "bottom"]: expanded
            ? labelAtTop
              ? 34
              : 30
            : labelAtTop
              ? 22
              : 16,
        }}
      >
        {!isCharacter && card.kicker && (
          <span
            className="uppercase tracking-[0.16em]"
            style={{
              fontFamily: "var(--font-mono)",
              color: card.kickerColor,
              fontSize: expanded ? 13 : 9,
            }}
          >
            {card.kicker}
          </span>
        )}
        <span
          className="font-bold tracking-[-0.03em] text-white"
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: expanded
              ? isCharacter
                ? 32
                : Math.min((card.titleSize ?? 22) * 1.5, 52)
              : isCharacter
                ? card.compact
                  ? 13
                  : 16
                : card.titleSize,
            lineHeight: 1,
            fontWeight: isCharacter ? 600 : 700,
          }}
        >
          {card.title}
        </span>
        {card.meta && (
          <span
            className="text-white/50"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: expanded ? 13 : 9,
            }}
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
