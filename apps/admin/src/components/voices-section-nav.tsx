"use client";

import Link from "next/link";

export function VoicesSectionNav({
  active,
  catalogCount,
  libraryCount,
}: {
  active: "catalog" | "library";
  catalogCount: number;
  libraryCount: number;
}) {
  return (
    <nav className="voices-section-nav" aria-label="Voices section">
      <Link
        href="/voices"
        aria-current={active === "catalog" ? "page" : undefined}
        className={active === "catalog" ? "is-active" : undefined}
      >
        <span>Catalog</span>
        <span className="voices-section-count">{catalogCount}</span>
      </Link>
      <Link
        href="/voices/library"
        aria-current={active === "library" ? "page" : undefined}
        className={active === "library" ? "is-active" : undefined}
      >
        <span>Library</span>
        <span className="voices-section-count">{libraryCount}</span>
      </Link>
      <style jsx>{`
        .voices-section-nav {
          min-height: 48px;
          display: flex;
          align-items: stretch;
          gap: var(--space-4);
          padding: 0 32px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--background);
        }
        a {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: var(--space-8);
          padding: 0 var(--space-14);
          color: var(--text-tertiary);
          text-decoration: none;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: var(--font-size-sm);
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        a::after {
          content: "";
          position: absolute;
          left: var(--space-14);
          right: var(--space-14);
          bottom: 0;
          height: 2px;
          background: transparent;
        }
        a:hover,
        a:focus-visible,
        a.is-active {
          color: var(--text-primary);
        }
        a:focus-visible {
          outline: 2px solid var(--accent-strong);
          outline-offset: -4px;
          border-radius: var(--radius-sm);
        }
        a.is-active::after {
          background: var(--accent-strong);
        }
        .voices-section-count {
          min-width: 22px;
          padding: 2px 6px;
          border-radius: var(--radius-pill);
          background: var(--control-bg);
          color: var(--text-secondary);
          text-align: center;
          letter-spacing: 0;
        }
        @media (max-width: 900px) {
          .voices-section-nav { padding: 0 20px; }
        }
        @media (max-width: 720px) {
          .voices-section-nav { padding: 0 16px; }
          a { min-height: 44px; padding-inline: var(--space-10); }
          a::after { left: var(--space-10); right: var(--space-10); }
        }
      `}</style>
    </nav>
  );
}
