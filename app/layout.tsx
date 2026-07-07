import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/AppShell";

export const metadata: Metadata = {
  title: {
    default: "VantaDrop",
    template: "%s - VantaDrop",
  },
  description:
    "Confidential token distributions on Sepolia, powered by TokenOps and Zama FHE. Allocation amounts stay encrypted end-to-end; only recipients can decrypt their own.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('vantadrop-theme')||'dark';document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}",
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
