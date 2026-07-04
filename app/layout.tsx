import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "VantaDrop — Private token distributions. Public-chain settlement.",
    template: "%s · VantaDrop",
  },
  description:
    "Confidential ERC-7984 token distributions on Sepolia, powered by TokenOps and Zama FHE. Allocation amounts stay encrypted end-to-end — only recipients can decrypt their own.",
};

const navLinks = [
  { href: "/create", label: "Create" },
  { href: "/drop/demo", label: "Demo Drop" },
  { href: "/recipient/demo", label: "Recipient Portal" },
  { href: "/verification", label: "Verification" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09090e]/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 text-[13px] font-bold text-white">
                V
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-white">
                VantaDrop
              </span>
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline">
                Sepolia testnet
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-2.5 py-1.5 text-[13px] text-zinc-400 transition hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <Providers>
          <main>{children}</main>
        </Providers>

        <footer className="mt-24 border-t border-white/[0.06]">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[13px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>
              VantaDrop — confidential token distributions. Built on{" "}
              <span className="text-zinc-400">TokenOps</span> +{" "}
              <span className="text-zinc-400">Zama FHE</span> (ERC-7984).
            </p>
            <p>Zama Developer Program · Mainnet Season 3 · TokenOps Bounty Track</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
