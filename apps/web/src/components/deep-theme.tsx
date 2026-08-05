"use client";

import { useEffect } from "react";

export function DeepTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.theme;
    root.dataset.theme = "deep";

    return () => {
      if (previousTheme) root.dataset.theme = previousTheme;
      else delete root.dataset.theme;
    };
  }, []);

  return null;
}
