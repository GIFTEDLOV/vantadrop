"use client";

import Link from "next/link";

export function TopBar() {
  return (
    <header className="topbar">
      <div className="flex min-w-0 items-center gap-2">
        <Link href="/" className="flex items-center gap-2 lg:hidden">
          <span className="brand-logo h-8 w-8 rounded-[10px] text-[13px]">V</span>
          <span className="text-[14px] font-semibold text-white">VantaDrop</span>
        </Link>
        <div className="hide-compact flex flex-wrap items-center gap-2">
          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Sepolia
          </span>
          <span className="status-pill">TokenOps + ERC-7984</span>
          <span className="status-pill">Browser flow proven live</span>
        </div>
      </div>

      <div className="hide-compact flex shrink-0 items-center gap-2">
        <span className="status-pill">Claim Vault discovery</span>
      </div>
    </header>
  );
}
