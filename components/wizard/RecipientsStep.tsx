"use client";

import { useMemo } from "react";
import {
  formatRawUnits,
  parseRecipientsCsv,
  RECIPIENT_SOFT_CAP,
  type CsvParseResult,
} from "../../lib/csv";
import { CTTT_DECIMALS, CTTT_SYMBOL, DEMO } from "../../lib/constants";
import { Badge, Card } from "../ui";

export const SAMPLE_CSV = [
  "wallet,amount,note",
  `${DEMO.recipient},1.0,Proven demo recipient (Sepolia spike)`,
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8,25.5,Core contributor Q2",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,10,Community moderator",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906,0.25,Bug bounty",
].join("\n");

export function useCsvParse(csvText: string): CsvParseResult {
  return useMemo(() => parseRecipientsCsv(csvText, CTTT_DECIMALS), [csvText]);
}

export function RecipientsStep({
  csvText,
  onChange,
  parsed,
}: {
  csvText: string;
  onChange: (text: string) => void;
  parsed: CsvParseResult;
}) {
  const hasInput = parsed.rows.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Add recipients and amounts</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Paste CSV as{" "}
          <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[12px] text-zinc-300">
            wallet,amount,note
          </code>{" "}
          — header row optional. Everything is parsed and validated in your browser; the{" "}
          <span className="text-zinc-300">note</span> column never leaves it. Amounts use up to{" "}
          {CTTT_DECIMALS} decimals ({CTTT_SYMBOL}).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(SAMPLE_CSV)}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-zinc-200 transition hover:bg-white/10"
        >
          Load sample CSV
        </button>
        {hasInput && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded-md px-3 py-1.5 text-[13px] text-zinc-500 transition hover:text-zinc-300"
          >
            Clear
          </button>
        )}
      </div>

      <textarea
        value={csvText}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={8}
        placeholder={"wallet,amount,note\n0xabc…,100,Advisor allocation"}
        className="w-full rounded-lg border border-white/10 bg-black/30 p-4 font-mono text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
      />

      {hasInput && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={parsed.errorCount === 0 ? "proven" : "neutral"}>
              {parsed.validCount} valid
            </Badge>
            {parsed.errorCount > 0 && (
              <Badge tone="pending">{parsed.errorCount} with errors</Badge>
            )}
            {parsed.headerDetected && <Badge tone="neutral">Header row detected</Badge>}
            <Badge tone="confidential">
              Total: {formatRawUnits(BigInt(parsed.totalRaw), CTTT_DECIMALS)} {CTTT_SYMBOL}
            </Badge>
          </div>

          {parsed.warnings.map((w) => (
            <div
              key={w}
              className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[13px] leading-relaxed text-amber-200"
            >
              <span className="font-semibold">Soft cap {RECIPIENT_SOFT_CAP}: </span>
              {w}
            </div>
          ))}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.07] text-xs uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-3 font-medium">Wallet</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Note (stays local)</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row) => {
                    const valid = row.errors.length === 0;
                    return (
                      <tr
                        key={row.line}
                        className="border-b border-white/[0.04] last:border-b-0"
                      >
                        <td className="max-w-[220px] truncate px-4 py-2.5 font-mono text-zinc-300">
                          {row.wallet || <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-zinc-300">
                          {row.amount || <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2.5 text-zinc-500">
                          {row.note || <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {valid ? (
                            <Badge tone="proven">Valid</Badge>
                          ) : (
                            <div className="space-y-1">
                              {row.errors.map((err) => (
                                <p key={err} className="text-[12px] leading-snug text-rose-300">
                                  Line {row.line}: {err}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
