"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Providers } from "../app/providers";
import { CollapsedSidebar } from "./CollapsedSidebar";
import { TopBar } from "./TopBar";

type Theme = "dark" | "light";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("vantadrop-theme");
  return stored === "light" ? "light" : "dark";
}

export function AppShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("vantadrop-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      return next;
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    document.documentElement.style.setProperty("--cursor-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--cursor-y", `${event.clientY}px`);
  }

  return (
    <div className="app-shell" onPointerMove={handlePointerMove}>
      <div className="cursor-glow" aria-hidden="true" />
      <div className="app-noise" aria-hidden="true" />
      <CollapsedSidebar theme={theme} onToggleTheme={toggleTheme} />
      <div className="shell-main">
        <TopBar />
        <Providers>
          <main className="shell-content">{children}</main>
        </Providers>
        <footer className="shell-footer">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
            <p>
              VantaDrop - confidential token distributions on TokenOps and Zama FHE.
            </p>
            <p>Zama Developer Program - Mainnet Season 3 - TokenOps Bounty Track</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
