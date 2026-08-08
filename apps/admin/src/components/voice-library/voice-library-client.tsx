"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useHeaderContent } from "@/components/header-context";
import { CostPips, SpecRow, SpeedBolts } from "@/components/voice-card-spec";
import { VoicesSectionNav } from "@/components/voices-section-nav";
import type {
  LibraryVoice,
  ProviderStatus,
  VoiceImportJob,
  VoiceImportPhase,
  VoiceLibraryPage,
  VoiceLibraryQuery,
} from "@/lib/voice-library/types";
import styles from "./voice-library.module.css";

const PHASES: { id: VoiceImportPhase; label: string }[] = [
  { id: "fetching_source", label: "Fetch source recording" },
  { id: "preparing_voice", label: "Prepare voice assets" },
  { id: "extracting_embedding", label: "Extract Pocket embedding" },
  { id: "storing_assets", label: "Store source and embedding" },
  { id: "registering_voice", label: "Register catalog voice" },
  { id: "ready", label: "Ready in catalog" },
];

const PROVIDER_LABELS: Record<string, string> = {
  pocket_tts: "Pocket",
  elevenlabs: "ElevenLabs",
  cartesia: "Cartesia",
  fish_audio: "Fish Audio",
  openai: "OpenAI",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function queryString(searchParams: URLSearchParams): string {
  const value = searchParams.toString();
  return value ? `?${value}` : "";
}

function licenseState(voice: LibraryVoice): "commercial" | "unknown" | "blocked" {
  if (voice.license?.commercialUse === true) return "commercial";
  if (voice.license?.commercialUse === false) return "blocked";
  return "unknown";
}

function metricTier(value: number | null, kind: "cost" | "speed") {
  if (value == null) return null;
  if (kind === "cost") {
    if (value <= 5) return 1 as const;
    if (value <= 20) return 2 as const;
    if (value <= 40) return 3 as const;
    return 4 as const;
  }
  if (value <= 150) return 4 as const;
  if (value <= 250) return 3 as const;
  if (value <= 600) return 2 as const;
  return 1 as const;
}

function useFocusTrap(
  containerRef: { current: HTMLElement | null },
  initialRef?: { current: HTMLElement | null },
) {
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    if (!container) return;
    const focusable = () => [
      ...container.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ];
    (initialRef?.current ?? focusable()[0])?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !container.contains(document.activeElement)) return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previouslyFocused?.focus();
    };
  }, [containerRef, initialRef]);
}

export function VoiceLibraryClient({
  initialPage,
  catalogCount,
  initialQuery,
  selected,
}: {
  initialPage: VoiceLibraryPage;
  catalogCount: number;
  initialQuery: VoiceLibraryQuery;
  selected?: { provider: string; externalId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialQuery.search ?? "");
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<LibraryVoice | null>(() => {
    if (!selected) return null;
    return (
      initialPage.voices.find(
        (voice) =>
          voice.provider === selected.provider &&
          voice.externalId === selected.externalId,
      ) ?? null
    );
  });
  const [importVoice, setImportVoice] = useState<LibraryVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const setQuery = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("cursor");
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      router.replace(`/voices/library${queryString(next)}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (search !== (searchParams.get("q") ?? "")) setQuery({ q: search || null });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, searchParams, setQuery]);

  const closeDrawer = useCallback(() => {
    setSelectedVoice(null);
    router.push(`/voices/library${queryString(searchParams)}`, { scroll: false });
    window.setTimeout(() => restoreFocusRef.current?.focus(), 0);
  }, [router, searchParams]);

  useEffect(() => {
    if (!selected || selectedVoice) return;
    const controller = new AbortController();
    fetch(`/api/voices/library/${selected.provider}/${selected.externalId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ voice: LibraryVoice }>;
      })
      .then((body) => setSelectedVoice(body.voice))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") closeDrawer();
      });
    return () => controller.abort();
  }, [closeDrawer, selected, selectedVoice]);

  useEffect(() => {
    if (!selectedVoice && !importVoice) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (importVoice) setImportVoice(null);
        else closeDrawer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeDrawer, importVoice, selectedVoice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      document.getElementById("voice-library-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { setContent, setFlush } = useHeaderContent();
  useEffect(() => {
    setFlush(true);
    setContent(
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", color: "var(--text-tertiary)" }}>
          VOICE LIBRARY
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/voices?new=1" className={`${styles.secondaryButton} ${styles.cloneAction}`}>Clone voice</Link>
          <Link href="/voices?new=1" className={styles.primaryButton}>+ new voice</Link>
        </div>
      </div>,
    );
    return () => {
      setContent(null);
      setFlush(false);
    };
  }, [setContent, setFlush]);

  const openVoice = useCallback(
    (voice: LibraryVoice, trigger: HTMLElement) => {
      restoreFocusRef.current = trigger;
      setSelectedVoice(voice);
      router.push(
        `/voices/library/${voice.provider}/${voice.externalId}${queryString(searchParams)}`,
        { scroll: false },
      );
    },
    [router, searchParams],
  );

  const togglePreview = useCallback((voice: LibraryVoice) => {
    if (!voice.previewUrl) return;
    if (activePreview === voice.externalId) {
      audioRef.current?.pause();
      setActivePreview(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(voice.previewUrl);
    audioRef.current = audio;
    audio.onended = () => setActivePreview(null);
    audio.onerror = () => setActivePreview(null);
    void audio.play().then(() => setActivePreview(voice.externalId)).catch(() => setActivePreview(null));
  }, [activePreview]);

  const notices = initialPage.providers.filter(
    (provider) => provider.provider === initialQuery.provider && provider.availability !== "available",
  );

  return (
    <main className={styles.page}>
      <VoicesSectionNav
        active="library"
        catalogCount={catalogCount}
        libraryCount={initialPage.providers.reduce(
          (total, provider) => total + (provider.count ?? 0),
          0,
        )}
      />
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span aria-hidden>⌕</span>
          <span className="sr-only">Search voice library</span>
          <input
            id="voice-library-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search voices, accents, use cases…"
          />
          <kbd aria-label="Keyboard shortcut">/</kbd>
        </label>
        <span className={styles.showing}>
          showing {initialPage.voices.length} of {initialPage.total}
        </span>
      </div>

      <ProviderRail
        providers={initialPage.providers}
        active={initialQuery.provider}
        onChange={(provider) => setQuery({ provider })}
      />

      <div className={styles.filters} aria-label="Library filters">
        <FilterSelect label="Language" value={initialQuery.language} options={["en-US"]} onChange={(value) => setQuery({ language: value })} />
        <FilterSelect label="Gender" value={initialQuery.gender} options={["female", "male"]} onChange={(value) => setQuery({ gender: value })} />
        <FilterSelect label="License" value={initialQuery.license} options={["commercial", "unknown", "noncommercial"]} onChange={(value) => setQuery({ license: value })} />
        <FilterSelect label="Catalog" value={initialQuery.imported} options={["imported", "not_imported"]} onChange={(value) => setQuery({ imported: value })} />
        <FilterSelect label="Sort" value={initialQuery.sort} options={["curated", "name"]} includeAll={false} onChange={(value) => setQuery({ sort: value })} />
      </div>

      {notices.map((provider) => <ProviderNotice key={provider.provider} provider={provider} />)}

      <section className={styles.grid} aria-label="Browseable voices">
        {initialPage.voices.length === 0 ? (
          <div className={styles.empty}>
            <h2>No voices match these filters</h2>
            <p>Clear a filter or switch providers. Available providers remain usable if another adapter is down.</p>
            <button type="button" className={styles.secondaryButton} onClick={() => router.push("/voices/library")}>Clear filters</button>
          </div>
        ) : initialPage.voices.map((voice) => (
          <LibraryVoiceCard
            key={`${voice.provider}:${voice.externalId}`}
            voice={voice}
            previewing={activePreview === voice.externalId}
            onPreview={() => togglePreview(voice)}
            onOpen={(trigger) => openVoice(voice, trigger)}
            onImport={() => setImportVoice(voice)}
          />
        ))}
      </section>

      {selectedVoice && (
        <VoiceDrawer
          voice={selectedVoice}
          previewing={activePreview === selectedVoice.externalId}
          onPreview={() => togglePreview(selectedVoice)}
          onClose={closeDrawer}
          onImport={() => setImportVoice(selectedVoice)}
          onRestored={() => router.refresh()}
        />
      )}
      {importVoice && (
        <ImportDialog
          voice={importVoice}
          onClose={() => setImportVoice(null)}
          onFinished={() => router.refresh()}
        />
      )}
    </main>
  );
}

function ProviderRail({ providers, active, onChange }: {
  providers: ProviderStatus[];
  active?: string;
  onChange: (provider: string | null) => void;
}) {
  const tabs = [{ provider: "", label: "All", availability: "available" as const, count: providers.reduce((sum, item) => sum + (item.count ?? 0), 0) }, ...providers];
  return (
    <div className={styles.providers} role="tablist" aria-label="Voice providers" onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const direction = event.key === "ArrowRight" ? 1 : -1;
      buttons[(index + direction + buttons.length) % buttons.length]?.focus();
    }}>
      {tabs.map((provider) => {
        const selected = (active ?? "") === provider.provider;
        return (
          <button
            key={provider.provider || "all"}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`${styles.providerTab} ${selected ? styles.active : ""}`}
            onClick={() => onChange(provider.provider || null)}
          >
            <span className={`${styles.providerDot} ${styles[provider.availability] ?? ""}`} aria-hidden />
            {provider.label}
            {provider.count != null && <span>{provider.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange, includeAll = true }: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string | null) => void;
  includeAll?: boolean;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select className={styles.select} value={value ?? (includeAll ? "" : options[0])} onChange={(event) => onChange(event.target.value || null)}>
        {includeAll && <option value="">All {label.toLowerCase()}</option>}
        {options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
      </select>
    </label>
  );
}

function ProviderNotice({ provider }: { provider: ProviderStatus }) {
  return (
    <div className={styles.providerNotice} role="status">
      <div>
        <strong>{provider.label} library unavailable</strong>
        <div>{provider.reason}</div>
      </div>
      {provider.fallbackHref && <Link className={styles.secondaryButton} href={provider.fallbackHref}>{provider.fallbackLabel ?? "Use fallback"}</Link>}
    </div>
  );
}

function LibraryVoiceCard({ voice, previewing, onPreview, onOpen, onImport }: {
  voice: LibraryVoice;
  previewing: boolean;
  onPreview: () => void;
  onOpen: (trigger: HTMLElement) => void;
  onImport: () => void;
}) {
  const license = licenseState(voice);
  const cardRef = useRef<HTMLElement>(null);
  return (
    <article
      ref={cardRef}
      className={styles.card}
      tabIndex={0}
      aria-label={`${voice.name}, ${PROVIDER_LABELS[voice.provider] ?? voice.provider}`}
      onClick={(event) => onOpen(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(event.currentTarget);
        if (event.key === " ") { event.preventDefault(); onPreview(); }
        if (event.key === "ArrowRight" || event.key === "ArrowDown") (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
      }}
    >
      <div className={styles.cardTop}>
        <button type="button" className={styles.play} aria-label={`${previewing ? "Pause" : "Play"} ${voice.name} preview`} onClick={(event) => { event.stopPropagation(); onPreview(); }} disabled={!voice.previewUrl}>
          {previewing ? "Ⅱ" : "▶"}
        </button>
        <div className={styles.titleWrap}>
          <h2 className={styles.title}>{voice.name}</h2>
          <div className={styles.source}>{voice.source.label}</div>
        </div>
      </div>
      <div className={styles.badges}>
        <span className={styles.badge}>{PROVIDER_LABELS[voice.provider] ?? voice.provider}</span>
        {voice.languageLabel && <span className={styles.badge}>{voice.languageLabel}</span>}
        {voice.gender && <span className={styles.badge}>{voice.gender}</span>}
        <span className={`${styles.badge} ${styles[`license${license[0].toUpperCase()}${license.slice(1)}`]}`}>{voice.license?.name ?? "License unverified"}</span>
      </div>
      <p className={styles.description}>{voice.description}</p>
      <div className={styles.specs}>
        <SpecRow label="Cost" provenance={voice.cost.kind} rating={<CostPips tier={metricTier(voice.cost.value, "cost")} />} value={voice.cost.value == null ? "—" : `${voice.cost.value} ${voice.cost.unit}`} title={voice.cost.note} />
        <SpecRow label="Speed" provenance={voice.latency.kind} rating={<SpeedBolts tier={metricTier(voice.latency.value, "speed")} />} value={voice.latency.value == null ? "—" : `~${voice.latency.value}${voice.latency.unit.startsWith("ms") ? "ms" : ` ${voice.latency.unit}`}`} title={voice.latency.note} />
      </div>
      <div className={styles.cardFooter}>
        <ImportState state={voice.importState.kind} archived={voice.importState.voiceStatus === "archived"} />
        {voice.importState.kind === "not_imported" && license !== "blocked" && (
          <button type="button" className={styles.textButton} onClick={(event) => { event.stopPropagation(); onImport(); }}>
            {license === "unknown" ? "Review & import" : "Import"} →
          </button>
        )}
        {voice.importState.kind === "importing" && voice.importState.jobId && (
          <button type="button" className={styles.textButton} onClick={(event) => { event.stopPropagation(); onImport(); }}>
            View progress →
          </button>
        )}
        {license === "blocked" && <span className={styles.state}>Non-commercial · blocked</span>}
      </div>
    </article>
  );
}

function ImportState({ state, archived }: { state: LibraryVoice["importState"]["kind"]; archived: boolean }) {
  const label = state === "imported" ? (archived ? "Imported · archived" : "In catalog") : state === "importing" ? "Importing" : "Not imported";
  return <span className={styles.state}><span className={`${styles.stateDot} ${styles[state] ?? ""}`} aria-hidden />{label}</span>;
}

function VoiceDrawer({ voice, previewing, onPreview, onClose, onImport, onRestored }: {
  voice: LibraryVoice;
  previewing: boolean;
  onPreview: () => void;
  onClose: () => void;
  onImport: () => void;
  onRestored: () => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [restoring, setRestoring] = useState(false);
  useFocusTrap(drawerRef, titleRef);
  const license = licenseState(voice);
  const restore = async () => {
    if (!voice.importState.voiceId) return;
    setRestoring(true);
    const response = await fetch(`/api/voices/${voice.importState.voiceId}/archive`, { method: "DELETE" });
    setRestoring(false);
    if (response.ok) onRestored();
  };
  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden />
      <aside ref={drawerRef} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="library-drawer-title">
        <div className={styles.drawerHeader}>
          <div><p className={styles.eyebrow}>{PROVIDER_LABELS[voice.provider]} · {voice.importMode.replace("_", " ")}</p><h2 id="library-drawer-title" ref={titleRef} tabIndex={-1}>{voice.name}</h2></div>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close voice details">×</button>
        </div>
        <div className={styles.drawerBody}>
          <div className={styles.hero}>
            <button type="button" className={styles.play} onClick={onPreview} aria-label={`${previewing ? "Pause" : "Play"} preview`}>{previewing ? "Ⅱ" : "▶"}</button>
            <div><p>{voice.description}</p><ImportState state={voice.importState.kind} archived={voice.importState.voiceStatus === "archived"} /></div>
          </div>
          <div className={styles.section}>
            <h3>Voice profile</h3>
            <dl className={styles.definition}>
              <dt>Language</dt><dd>{voice.languageLabel ?? voice.language ?? "Unspecified"}</dd>
              <dt>Gender</dt><dd>{voice.gender ?? "Unspecified"}</dd>
              <dt>Tags</dt><dd>{voice.tags.join(" · ")}</dd>
              <dt>Model</dt><dd>{voice.model ?? "Provider default"}</dd>
              <dt>Cost</dt><dd>{voice.cost.value == null ? "Unknown" : `${voice.cost.value} ${voice.cost.unit}`} · {voice.cost.kind}</dd>
              <dt>First audio</dt><dd>{voice.latency.value == null ? "Unknown" : `${voice.latency.value} ${voice.latency.unit}`} · {voice.latency.kind}</dd>
            </dl>
          </div>
          <div className={styles.section}>
            <h3>License & provenance</h3>
            <div className={styles.badges}><span className={`${styles.badge} ${styles[`license${license[0].toUpperCase()}${license.slice(1)}`]}`}>{voice.license?.name ?? "Unverified"}</span></div>
            <dl className={styles.definition} style={{ marginTop: 14 }}>
              <dt>Commercial use</dt><dd>{voice.license?.commercialUse === true ? "Allowed" : voice.license?.commercialUse === false ? "Not allowed" : "Unverified — review required"}</dd>
              <dt>Attribution</dt><dd>{voice.license?.attributionRequired ? voice.license.attribution ?? "Required" : "Not required"}</dd>
              <dt>Source</dt><dd>{voice.source.url ? <a href={voice.source.url} target="_blank" rel="noreferrer">{voice.source.label} ↗</a> : voice.source.label}</dd>
            </dl>
          </div>
        </div>
        <div className={styles.drawerFooter}>
          {voice.importState.kind === "imported" && voice.importState.voiceStatus === "archived" && <button type="button" className={styles.secondaryButton} disabled={restoring} onClick={restore}>{restoring ? "Restoring…" : "Restore to catalog"}</button>}
          {voice.importState.kind === "imported" && voice.importState.voiceSlug && <Link className={styles.primaryButton} href={`/voices/${voice.importState.voiceSlug}`}>View in catalog</Link>}
          {voice.importState.kind === "importing" && voice.importState.jobId && <button type="button" className={styles.primaryButton} onClick={onImport}>View import progress</button>}
          {voice.importState.kind === "not_imported" && <button type="button" className={styles.primaryButton} disabled={license === "blocked"} title={license === "blocked" ? "Non-commercial license blocks production import" : undefined} onClick={onImport}>{license === "unknown" ? "Review & import" : license === "blocked" ? "Non-commercial · blocked" : "Import voice"}</button>}
        </div>
      </aside>
    </>
  );
}

function ImportDialog({ voice, onClose, onFinished }: { voice: LibraryVoice; onClose: () => void; onFinished: () => void }) {
  const modalRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(voice.name);
  const [slug, setSlug] = useState(slugify(voice.name));
  const [language, setLanguage] = useState(voice.language ?? "en-US");
  const [gender, setGender] = useState(voice.gender ?? "");
  const [accepted, setAccepted] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [job, setJob] = useState<VoiceImportJob | null>(null);
  const [loadingJob, setLoadingJob] = useState(Boolean(voice.importState.jobId));
  const [error, setError] = useState<{ code?: string; message: string; existing?: { slug: string; status: string } } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const needsAcceptance = voice.license?.commercialUse === undefined || voice.license?.attributionRequired === true;
  useFocusTrap(modalRef, firstFieldRef);

  useEffect(() => {
    const jobId = voice.importState.jobId;
    if (!jobId) return;
    const controller = new AbortController();
    fetch(`/api/voices/library/import/${jobId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Import job returned HTTP ${response.status}.`);
        return response.json() as Promise<{ job: VoiceImportJob }>;
      })
      .then((body) => setJob(body.job))
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError({ message: (caught as Error).message });
      })
      .finally(() => setLoadingJob(false));
    return () => controller.abort();
  }, [voice.importState.jobId]);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`/api/voices/library/slug?slug=${encodeURIComponent(slug)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((body: { available: boolean }) => setSlugAvailable(body.available))
        .catch((err) => { if ((err as Error).name !== "AbortError") setSlugAvailable(null); });
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [slug]);

  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/voices/library/import/${job.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { job: VoiceImportJob };
      setJob(body.job);
      if (body.job.status === "succeeded") onFinished();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [job, onFinished]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/voices/library/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: voice.provider, externalId: voice.externalId, displayName: name, slug, language, gender: gender || undefined, tags: voice.tags, licenseAccepted: accepted, allowDuplicate }),
    });
    const body = await response.json().catch(() => ({})) as { job?: VoiceImportJob; error?: string; code?: string; existing?: { slug: string; status: string } };
    setSubmitting(false);
    if (!response.ok || !body.job) {
      setError({ code: body.code, message: body.error ?? `Import failed with HTTP ${response.status}.`, existing: body.existing });
      return;
    }
    setJob(body.job);
  };

  const retry = async () => {
    if (!job) return;
    setError(null);
    const response = await fetch(`/api/voices/library/import/${job.id}/retry`, { method: "POST" });
    const body = await response.json() as { job?: VoiceImportJob; error?: string };
    if (response.ok && body.job) setJob(body.job);
    else setError({ message: body.error ?? "The import could not be retried." });
  };

  const discard = async () => {
    if (!job) return;
    const response = await fetch(`/api/voices/library/import/${job.id}`, { method: "DELETE" });
    if (response.ok) { onFinished(); onClose(); }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !job) { event.preventDefault(); void submit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const currentIndex = job ? PHASES.findIndex((phase) => phase.id === job.phase) : -1;
  const canSubmit = name.trim() && slugAvailable === true && (!needsAcceptance || accepted) && !submitting;
  return (
    <div className={styles.modalWrap} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !job) onClose(); }}>
      <section ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
        <div className={styles.modalHeader}>
          <div><p className={styles.eyebrow}>{job ? "Import job" : "Configure import"} · Pocket</p><h2 id="import-dialog-title">{job ? voice.name : `Import ${voice.name}`}</h2></div>
          <button type="button" className={styles.iconButton} aria-label="Close import dialog" onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          {loadingJob ? (
            <div className={styles.empty} role="status">Loading durable import state…</div>
          ) : !job ? (
            <>
              <div className={styles.field}><label htmlFor="import-name">Catalog name</label><input ref={firstFieldRef} id="import-name" value={name} onChange={(event) => { setName(event.target.value); if (slug === slugify(name)) { setSlugAvailable(null); setSlug(slugify(event.target.value)); } }} /></div>
              <div className={styles.field}><label htmlFor="import-slug">Slug</label><input id="import-slug" value={slug} onChange={(event) => { setSlugAvailable(null); setSlug(slugify(event.target.value)); }} aria-describedby="slug-help" /><p id="slug-help" className={styles.help}>{!slug ? "/slug is unavailable" : slugAvailable === null ? "Checking availability…" : slugAvailable ? `/${slug} is available` : `/${slug} is unavailable`}</p></div>
              <div className={styles.field}><label htmlFor="import-language">Language</label><input id="import-language" value={language} onChange={(event) => setLanguage(event.target.value)} /></div>
              <div className={styles.field}><label htmlFor="import-gender">Gender (optional)</label><select id="import-gender" value={gender} onChange={(event) => setGender(event.target.value)}><option value="">Unspecified</option><option value="female">Female</option><option value="male">Male</option><option value="nonbinary">Nonbinary</option></select></div>
              <div className={styles.warning}>
                <strong>{voice.license?.name ?? "License unverified"}</strong>
                <p className={styles.help}>{voice.license?.commercialUse === undefined ? "Commercial-use permission is unverified. Review the source before importing." : voice.license.attributionRequired ? voice.license.attribution ?? "Attribution is required." : "Commercial use is allowed and no attribution is required."}</p>
                {needsAcceptance && <label className={styles.check}><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>I reviewed this license and will preserve the required attribution and provenance.</span></label>}
              </div>
              {error && <ImportError error={error} onAllowDuplicate={() => { setAllowDuplicate(true); setSlugAvailable(null); setSlug(`${slug}-copy`.slice(0, 63)); setError(null); }} />}
            </>
          ) : (
            <>
              <div className={styles.steps} aria-live="polite">
                {PHASES.map((phase, index) => {
                  const done = job.completedPhases.includes(phase.id) || job.status === "succeeded";
                  const active = index === currentIndex && job.status !== "failed";
                  return <div key={phase.id} className={`${styles.step} ${done ? styles.done : ""} ${active ? styles.active : ""}`}><span className={styles.stepIcon}>{done ? "✓" : index + 1}</span><span>{phase.label}</span><span>{active ? "Working…" : done ? "Done" : "Waiting"}</span></div>;
                })}
              </div>
              {job.status === "succeeded" && <div className={styles.warning}><strong>Voice ready</strong><p className={styles.help}>The Pocket embedding and provenance are stored in your catalog.</p></div>}
              {job.status === "failed" && <div className={styles.error} role="alert"><strong>{job.errorCode}</strong><p>{job.errorMessage}</p><p className={styles.help}>Retry resumes from the stored source recording; it does not download the source again.</p></div>}
            </>
          )}
        </div>
        <div className={styles.modalFooter}>
          {loadingJob ? <button type="button" className={styles.secondaryButton} onClick={onClose}>Close</button> : !job ? <><button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button><button type="button" className={styles.primaryButton} disabled={!canSubmit} onClick={() => void submit()}>{submitting ? "Starting…" : voice.license?.commercialUse === undefined ? "Review & import" : "Import voice"}<span aria-hidden>⌘↵</span></button></> : job.status === "failed" ? <><button type="button" className={styles.dangerButton} onClick={() => void discard()}>Discard draft</button><button type="button" className={styles.primaryButton} onClick={() => void retry()}>Retry from step 3</button></> : job.status === "succeeded" ? <Link className={styles.primaryButton} href={`/voices/${job.voiceSlug}`}>Open catalog voice</Link> : <button type="button" className={styles.secondaryButton} onClick={onClose}>Run in background</button>}
        </div>
      </section>
    </div>
  );
}

function ImportError({ error, onAllowDuplicate }: { error: { code?: string; message: string; existing?: { slug: string; status: string } }; onAllowDuplicate: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <strong>{error.code ? error.code.replaceAll("_", " ") : "Import failed"}</strong>
      <p>{error.message}</p>
      {error.code === "VOICE_ALREADY_IMPORTED" && error.existing && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className={styles.secondaryButton} href={`/voices/${error.existing.slug}`}>View existing</Link><button type="button" className={styles.secondaryButton} onClick={onAllowDuplicate}>Import another copy</button></div>}
    </div>
  );
}
