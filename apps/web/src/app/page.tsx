import { LandingPageV3 } from "@/components/landing-page-v3";

const resetLandingScrollScript = `
(() => {
  const navigation = performance.getEntriesByType("navigation")[0];
  const isReload = navigation?.type === "reload" || performance.navigation?.type === 1;

  if (!isReload && window.location.hash) return;

  window.history.scrollRestoration = "manual";

  if (isReload && window.location.hash) {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }

  const resetScroll = () => {
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  resetScroll();
  window.addEventListener("pageshow", resetScroll);
  window.addEventListener("load", () => requestAnimationFrame(resetScroll), { once: true });
  window.addEventListener("pagehide", resetScroll);
})();
`;

export default function Home() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: resetLandingScrollScript }} />
      <LandingPageV3 />
    </>
  );
}
