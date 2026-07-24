"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GoogleAuthButton } from "./google-auth-button";

const PUBLIC_ROUTES = new Set(["/", "/about", "/scroll-story"]);

export function RootHeader() {
  const pathname = usePathname();

  if (!PUBLIC_ROUTES.has(pathname)) return null;

  return (
    <header className="fixed inset-x-0 top-0 z-[100] border-b border-[#0b3732]/10 bg-white/85 text-[#07110f] shadow-[0_1px_0_rgba(11,55,50,0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/75">
      <div className="flex h-16 w-full items-center justify-between px-6 sm:px-10 lg:px-20">
        <Link href="/" aria-label="Kawabunga home" className="shrink-0">
          <Image
            src="/kawabunga_wordmark.svg"
            alt="Kawabunga"
            width={178}
            height={24}
            priority
            className="h-5 w-auto brightness-0"
          />
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-7 text-[10px] uppercase tracking-[0.16em] text-[#07110f]/55 md:flex"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <Link href="/#what-is-kawabunga" className="transition-colors hover:text-[#0f756d]">
            Overview
          </Link>
          <Link href="/#features" className="transition-colors hover:text-[#0f756d]">
            Experience
          </Link>
          <Link href="/#how-it-works" className="transition-colors hover:text-[#0f756d]">
            How It Works
          </Link>
          <Link href="/about" className="transition-colors hover:text-[#0f756d]">
            About
          </Link>
        </nav>

        <GoogleAuthButton tone="light" />
      </div>
    </header>
  );
}
