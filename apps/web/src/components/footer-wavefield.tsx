"use client";

import { useEffect, useRef, useState } from "react";
import { WavefieldStage, type AudioData } from "@kawabunga/ui";

class SyntheticAudioSequence implements AudioData {
  energy = 0;
  bass = 0;
  mid = 0;
  high = 0;
  peak = 0;
  active = false;

  stop() {
    this.active = false;
  }

  sample(t: number) {
    const slow = Math.sin(t * 0.58);
    const medium = Math.sin(t * 1.07 + 1.4);
    const quick = Math.sin(t * 1.83 + 3.1);

    this.energy = 0.2 + slow * 0.045 + medium * 0.025;
    this.bass = 0.24 + slow * 0.08;
    this.mid = 0.18 + medium * 0.065;
    this.high = 0.12 + quick * 0.035;
    this.peak = Math.max(0, slow * 0.08 + quick * 0.04);
    this.active = true;
  }
}

export function FooterWavefield() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [audioData] = useState(() => new SyntheticAudioSequence());
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const revealSentinel = document.querySelector<HTMLElement>(
      "[data-footer-reveal-sentinel]",
    );
    const observationTarget = revealSentinel ?? element;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "320px 0px" },
    );
    observer.observe(observationTarget);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const audio = audioData;
    if (!visible || reducedMotion) {
      audio.stop();
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const animate = (now: number) => {
      const t = (now - startedAt) / 1000;
      audio.sample(t);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      audio.stop();
    };
  }, [audioData, reducedMotion, visible]);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-0 opacity-75">
      {visible && (
        <WavefieldStage
          audioData={audioData}
          idleMotion={reducedMotion ? "static" : "ambient"}
          backgroundColor="#0a0a0a"
          cameraPosition={[0, 1.55, 1.15]}
          cameraFov={35}
          renderQuality="high"
        />
      )}
    </div>
  );
}
