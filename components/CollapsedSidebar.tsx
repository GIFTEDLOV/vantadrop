"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Theme = "dark" | "light";

const mainLinks = [
  { href: "/", label: "Home", railLabel: "Home" },
  { href: "/create", label: "Create Drop", railLabel: "Create" },
  { href: "/drops", label: "Drops", railLabel: "Drops" },
];

const verificationLinks = [
  { href: "/drop/demo", label: "Drop Proof", railLabel: "Proof" },
  { href: "/verification", label: "Verify", railLabel: "Verify" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CollapsedSidebar({
  theme,
  onToggleTheme,
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const allRailLinks = [...mainLinks, ...verificationLinks];

  return (
    <aside
      className={`sidebar-shell ${expanded ? "is-expanded" : ""}`}
      aria-label="Primary navigation"
    >
      <div
        className="sidebar-rail"
        onMouseEnter={() => setExpanded(true)}
        onFocus={() => setExpanded(true)}
      >
        <Link href="/" className="brand-logo" aria-label="VantaDrop home">
          V
        </Link>
        <nav className="rail-nav" aria-label="Collapsed navigation">
          {allRailLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(pathname, link.href) ? "active" : undefined}
              aria-label={link.railLabel}
              title={link.label}
            >
              <span aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </div>

      <div className="sidebar-drawer">
        <div className="drawer-brand-row">
          <Link href="/" className="drawer-brand">
            <span className="brand-logo">V</span>
            <span>
              <span className="block text-[15px] font-bold tracking-tight text-white">
                VantaDrop
              </span>
              <span className="block text-[11px] text-zinc-500">
                Private allocations. Public settlement.
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="drawer-close"
            onClick={() => setExpanded(false)}
            aria-label="Collapse sidebar"
          >
            x
          </button>
        </div>

        <nav className="drawer-nav" aria-label="Expanded navigation">
          {mainLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(pathname, link.href) ? "active" : undefined}
            >
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="drawer-bottom">
          <div>
            <p className="drawer-section-label">For Verification</p>
            <nav className="drawer-nav mt-2" aria-label="Verification navigation">
              {verificationLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={isActive(pathname, link.href) ? "active" : undefined}
                >
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <button type="button" onClick={onToggleTheme} className="theme-button">
            <span>Theme</span>
            <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
