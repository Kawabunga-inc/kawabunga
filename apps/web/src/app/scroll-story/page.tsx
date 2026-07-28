import type { Metadata } from "next";
import { ScrollStoryShowcase } from "@/components/scroll-story-showcase";

export const metadata: Metadata = {
  title: "Scroll Story Study | Kawabunga",
  description:
    "A scroll-driven landing page prototype for Kawabunga's immersive world engine.",
};

export default function ScrollStoryPage() {
  return <ScrollStoryShowcase />;
}
