import Image from "next/image";
import Link from "next/link";
import { FooterWavefield } from "./footer-wavefield";

const footerLinks = [
  { label: "Overview", href: "/#what-is-kawabunga" },
  { label: "Experience", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "About", href: "/about" },
];

export function RootFooter() {
  return (
    <footer className="relative flex min-h-[75svh] w-full flex-col justify-between overflow-hidden bg-[#0a0a0a] px-6 py-10 text-white sm:px-10 sm:py-12 lg:px-20 lg:py-14">
      <FooterWavefield />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-[#0a0a0a]/45 via-[#0a0a0a]/10 to-[#0a0a0a]/65" />

      <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-8">
        <Link href="/" aria-label="Kawabunga home">
          <Image
            src="/kawabunga_wordmark.svg"
            alt="Kawabunga"
            width={178}
            height={24}
            className="h-6 w-auto"
          />
        </Link>
        <p
          className="hidden text-[9px] uppercase tracking-[0.2em] text-white/40 sm:block"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Voice-first immersive reality
        </p>
      </div>

      <div className="relative z-10 flex flex-1 items-center py-14 sm:py-20">
        <div className="max-w-5xl">
          <p
            className="text-[10px] uppercase tracking-[0.22em] text-[#8fd1cb]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            One engine, infinite realities
          </p>
          <h2
            className="mt-5 text-[clamp(3.25rem,8vw,7.5rem)] font-medium leading-[0.88] tracking-[-0.06em]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Enter a world
            <br />
            that listens.
          </h2>
          <p className="mt-7 max-w-xl text-sm leading-6 text-white/50 sm:text-base sm:leading-7">
            Speak naturally. Shape what happens. Return to something that
            remembers you.
          </p>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-7 border-t border-white/10 pt-8 sm:flex-row sm:items-end sm:justify-between">
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap gap-x-6 gap-y-3 sm:gap-x-8"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {footerLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-[10px] uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div
          className="flex items-center justify-between gap-8 text-[10px] uppercase tracking-[0.14em] text-white/30 sm:justify-end"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <span>Built with conviction</span>
          <Link href="#" className="transition-colors hover:text-white/70">
            Back to top
          </Link>
        </div>
      </div>
    </footer>
  );
}
