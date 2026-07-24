"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GoogleAuthButton } from "./google-auth-button";

const PUBLIC_ROUTES = new Set(["/", "/about", "/scroll-story"]);

export function RootHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [darkForeground, setDarkForeground] = useState(false);

  useEffect(() => {
    if (!PUBLIC_ROUTES.has(pathname)) return;

    let frame = 0;

    const updateHeader = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const storyScroller = document.querySelector<HTMLElement>(
          '[aria-label="Kawabunga scroll story"]',
        );
        const scrollStory = document.querySelector<HTMLElement>("[data-scroll-story]");
        const scrollTop = Math.max(window.scrollY, storyScroller?.scrollTop ?? 0);
        const viewportHeight = storyScroller?.clientHeight ?? window.innerHeight;
        const storyRect = scrollStory?.getBoundingClientRect();
        const storyDistance = scrollStory
          ? Math.max(1, scrollStory.offsetHeight - viewportHeight)
          : 1;
        const storyProgress = storyRect
          ? Math.min(1, Math.max(0, -storyRect.top / storyDistance))
          : 0;
        const storyComplete = scrollStory
          ? (storyRect?.bottom ?? 0) <= viewportHeight + 1
          : scrollTop > 24;

        setScrolled(storyComplete);
        setDarkForeground(scrollStory ? storyProgress >= 0.755 : storyComplete);
      });
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    document.addEventListener("scroll", updateHeader, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateHeader);
      document.removeEventListener("scroll", updateHeader, true);
    };
  }, [pathname]);

  if (!PUBLIC_ROUTES.has(pathname)) return null;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[100] border-b transition-[background-color,border-color,box-shadow,color] duration-500 ${
        scrolled
          ? "border-[#0b3732]/10 bg-white/85 text-[#07110f] shadow-[0_1px_0_rgba(11,55,50,0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/75"
          : `border-transparent bg-transparent shadow-none ${
              darkForeground ? "text-[#07110f]" : "text-white"
            }`
      }`}
    >
      <div className="flex h-16 w-full items-center justify-between px-6 sm:px-10 lg:px-20">
        <Link
          href="/"
          aria-label="Kawabunga home"
          className="shrink-0"
        >
          <Image
            src="/kawabunga_wordmark.svg"
            alt="Kawabunga"
            width={178}
            height={24}
            priority
            className={`h-5 w-auto transition-[filter] duration-500 ${
              darkForeground ? "brightness-0" : ""
            }`}
          />
        </Link>

        <nav
          aria-label="Primary navigation"
          className={`hidden items-center gap-7 text-[10px] uppercase tracking-[0.16em] transition-colors duration-500 md:flex ${
            darkForeground ? "text-[#07110f]/55" : "text-white/75"
          }`}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <Link
            href="/#what-is-kawabunga"
            className={`transition-all ${darkForeground ? "hover:text-[#0f756d]" : "hover:text-white"}`}
          >
            Overview
          </Link>
          <Link
            href="/#features"
            className={`transition-all ${darkForeground ? "hover:text-[#0f756d]" : "hover:text-white"}`}
          >
            Experience
          </Link>
          <Link
            href="/#how-it-works"
            className={`transition-all ${darkForeground ? "hover:text-[#0f756d]" : "hover:text-white"}`}
          >
            How It Works
          </Link>
          <Link
            href="/about"
            className={`transition-all ${darkForeground ? "hover:text-[#0f756d]" : "hover:text-white"}`}
          >
            About
          </Link>
        </nav>

        <GoogleAuthButton tone={darkForeground ? "light" : "overlay"} />
      </div>
    </header>
  );
}
