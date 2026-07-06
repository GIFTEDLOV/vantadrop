import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/AppShell";

export const metadata: Metadata = {
  title: {
    default: "VantaDrop - Private token distributions. Public-chain settlement.",
    template: "%s - VantaDrop",
  },
  description:
    "Confidential ERC-7984 token distributions on Sepolia, powered by TokenOps and Zama FHE. Allocation amounts stay encrypted end-to-end; only recipients can decrypt their own.",
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
