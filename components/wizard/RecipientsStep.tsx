"use client";

/**
 * Step 3 (Recipients) — row-based recipient input.
 *
 * IMPORTANT DATA CONTRACT (do not break): the wizard's single source of truth
 * for recipients is still the `csvText` string held in CreateWizard state, and
 * the parent still derives `parsed = useCsvParse(state.csvText)` from it. This
 * component is only a *controller/view* over that string:
 *   - it initializes editable rows FROM `csvText` (via the existing parser), and
 *   - on every edit it serializes the rows BACK into the same `wallet,amount,note`
 *     CSV shape and pushes it up through `onChange`.
 * Because the downstream `parsed` object (consumed by Step 4/5 in ExecuteStep) is
 * produced by the exact same `parseRecipientsCsv` call on that same string, its
 * shape is byte-for-byte identical to the old textarea path. Validation, the
 * valid/error counts, the total, and Continue-gating are all still driven by that
 * one parser — there is deliberately no second, parallel validator here.
 */

import { useMemo, useRef, useState } from "react";
import {
  formatRawUnits,
  parseRecipientsCsv,
  RECIPIENT_SOFT_CAP,
  type CsvParseResult,
} from "../../lib/csv";
import { CTTT_DECIMALS, CTTT_SYMBOL, DEMO } from "../../lib/constants";
import { Badge, Card } from "../ui";
// Reuse the SAME live-testnet cap the execute step already defines — never a new one.
import { LIVE_RECIPIENT_CAP } from "./ExecuteStep";

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

/* ------------------------------------------------------------------ */
/* Editable row model (local UI state; CSV remains the source of truth) */
/* ------------------------------------------------------------------ */

interface EditableRow {
  id: number;
  wallet: string;
  amount: string;
  note: string;
}

function isRowEmpty(row: EditableRow): boolean {
  return !row.wallet.trim() && !row.amount.trim() && !row.note.trim();
}

/**
 * Monotonic row-id source. Module-level (not a React ref) so the useState
 * initializer can call it without reading a ref during render. Ids are only
 * used as React keys / focus targets, never rendered, so this is hydration-safe.
 */
let rowUid = 0;
const nextRowId = (): number => (rowUid += 1);

/**
 * Serialize rows back into the exact `wallet,amount,note` CSV the existing
 * parser understands. Fully-empty rows are omitted so a blank row reads as
 * "neutral" (neither valid nor an error) — matching the reference behavior and
 * keeping `parsed` identical to what the textarea would have produced.
 */
function serializeRows(rows: EditableRow[]): string {
  return rows
    .filter((row) => !isRowEmpty(row))
    .map((row) =>
      row.note.trim().length > 0
        ? `${row.wallet},${row.amount},${row.note}`
        : `${row.wallet},${row.amount}`,
    )
    .join("\n");
}

/**
 * Build editable rows from a CSV string using the existing parser (so header
 * detection and the "note may contain commas" rule are honored identically).
 * Always returns at least one row so the UI never renders empty.
 */
function rowsFromCsv(csvText: string, nextId: () => number): EditableRow[] {
  const parsed = parseRecipientsCsv(csvText, CTTT_DECIMALS);
  const rows = parsed.rows.map((row) => ({
    id: nextId(),
    wallet: row.wallet,
    amount: row.amount,
    note: row.note,
  }));
  return rows.length > 0
    ? rows
    : [{ id: nextId(), wallet: "", amount: "", note: "" }];
}

/** Route a parser error string to the field it concerns (display styling only). */
function classifyErrors(errors: string[]): {
  walletError?: string;
  amountError?: string;
} {
  return {
    walletError: errors.find((e) => /wallet|hex address|duplicate/i.test(e)),
    amountError: errors.find((e) => /amount|decimal|negative|zero/i.test(e)),
  };
}

const fieldBase =
  "w-full rounded-lg border bg-black/30 px-3.5 py-2.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 transition focus:outline-none focus:border-violet-500/60";

function fieldClass(state: "idle" | "valid" | "invalid", mono = true): string {
  const border =
    state === "invalid"
      ? "border-rose-500/60"
      : state === "valid"
        ? "border-emerald-500/40"
        : "border-white/10";
  return `${fieldBase} ${border} ${mono ? "font-mono" : ""}`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function RecipientsStep({
  csvText,
  onChange,
  parsed,
}: {
  csvText: string;
  onChange: (text: string) => void;
  parsed: CsvParseResult;
}) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    rowsFromCsv(csvText, nextRowId),
  );
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  // Id of a freshly-added row to autofocus once its input mounts (commit phase,
  // via the ref callback below) — avoids a state+effect focus dance.
  const pendingFocusRef = useRef<number | null>(null);

  // Every mutation flows through here: update local rows AND push the serialized
  // CSV up so the parent's `parsed` (and Step 4/5) stay in sync.
  function commit(next: EditableRow[]) {
    setRows(next);
    onChange(serializeRows(next));
  }

  function updateField(
    id: number,
    field: "wallet" | "amount" | "note",
    value: string,
  ) {
    commit(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    if (rows.length >= LIVE_RECIPIENT_CAP) return;
    const row: EditableRow = { id: nextRowId(), wallet: "", amount: "", note: "" };
    pendingFocusRef.current = row.id;
    commit([...rows, row]);
  }

  function removeRow(id: number) {
    // Keep a minimum of one row: removing the last one just clears it.
    if (rows.length <= 1) {
      commit(
        rows.map((row) =>
          row.id === id ? { ...row, wallet: "", amount: "", note: "" } : row,
        ),
      );
      return;
    }
    commit(rows.filter((row) => row.id !== id));
  }

  function loadSample() {
    commit(rowsFromCsv(SAMPLE_CSV, nextRowId).slice(0, LIVE_RECIPIENT_CAP));
  }

  function clearAll() {
    commit([{ id: nextRowId(), wallet: "", amount: "", note: "" }]);
  }

  function applyPaste() {
    commit(rowsFromCsv(pasteText, nextRowId).slice(0, LIVE_RECIPIENT_CAP));
    setPasteOpen(false);
    setPasteText("");
  }

  // Map each non-empty local row to its parser result (in order). The header
  // line, if the parser detected one, has no editable row and is skipped. This
  // is display-only; authoritative counts/gating come from `parsed` itself.
  const rowValidation = useMemo(() => {
    const map = new Map<
      number,
      { walletError?: string; amountError?: string; errors: string[] }
    >();
    let headerConsumed = !parsed.headerDetected;
    let parsedIndex = 0;
    for (const row of rows) {
      if (isRowEmpty(row)) continue;
      if (!headerConsumed) {
        headerConsumed = true;
        continue;
      }
      const parsedRow = parsed.rows[parsedIndex];
      parsedIndex += 1;
      if (!parsedRow) continue;
      map.set(row.id, {
        ...classifyErrors(parsedRow.errors),
        errors: parsedRow.errors,
      });
    }
    return map;
  }, [rows, parsed]);

  const atCap = rows.length >= LIVE_RECIPIENT_CAP;
  const hasInput = parsed.rows.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Add recipients and amounts</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Add each recipient in their own row — wallet, allocation, and an optional
          note. Everything is parsed and validated in your browser; the{" "}
          <span className="text-zinc-300">note</span> column never leaves it. Amounts
          use up to {CTTT_DECIMALS} decimals ({CTTT_SYMBOL}).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={loadSample}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-zinc-200 transition hover:bg-white/10"
        >
          Load sample
        </button>
        {hasInput && (
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md px-3 py-1.5 text-[13px] text-zinc-500 transition hover:text-zinc-300"
          >
            Clear
          </button>
        )}
      </div>

      {/* Column labels (hidden on mobile; each field carries its own label there) */}
      <div className="hidden gap-3 px-1 sm:grid sm:grid-cols-[1fr_150px_1.2fr_44px]">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Wallet address
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Allocation
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
          Note <span className="text-zinc-600 normal-case tracking-normal">— private, optional</span>
        </span>
        <span />
      </div>

      {/* Recipient rows */}
      <div className="space-y-2.5">
        {rows.map((row) => {
          const v = rowValidation.get(row.id);
          const walletFilled = row.wallet.trim().length > 0;
          const amountFilled = row.amount.trim().length > 0;
          const walletState = v?.walletError
            ? "invalid"
            : walletFilled
              ? "valid"
              : "idle";
          const amountState = v?.amountError
            ? "invalid"
            : amountFilled
              ? "valid"
              : "idle";
          const rowError = v?.errors?.[0];

          return (
            <div key={row.id} className="grid gap-2.5 sm:grid-cols-[1fr_150px_1.2fr_44px] sm:items-start">
              {/* Wallet */}
              <div>
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 sm:hidden">
                  Wallet address
                </span>
                <input
                  ref={(el) => {
                    // Autofocus a freshly-added row's wallet input (commit phase).
                    if (el && pendingFocusRef.current === row.id) {
                      pendingFocusRef.current = null;
                      el.focus();
                    }
                  }}
                  value={row.wallet}
                  onChange={(e) => updateField(row.id, "wallet", e.target.value)}
                  placeholder="0x… recipient address"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Recipient wallet address"
                  aria-invalid={walletState === "invalid"}
                  className={fieldClass(walletState)}
                />
              </div>

              {/* Amount (with CTTT suffix) */}
              <div>
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 sm:hidden">
                  Allocation
                </span>
                <div className="relative">
                  <input
                    value={row.amount}
                    onChange={(e) => updateField(row.id, "amount", e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Allocation in ${CTTT_SYMBOL}`}
                    aria-invalid={amountState === "invalid"}
                    className={`${fieldClass(amountState)} pr-14`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-zinc-500">
                    {CTTT_SYMBOL}
                  </span>
                </div>
              </div>

              {/* Note (private) */}
              <div>
                <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500 sm:hidden">
                  Note — private
                </span>
                <input
                  value={row.note}
                  onChange={(e) => updateField(row.id, "note", e.target.value)}
                  placeholder="e.g. advisor — never on-chain"
                  autoComplete="off"
                  aria-label="Private note (stays in your browser)"
                  className={fieldClass("idle", false)}
                />
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                aria-label="Remove recipient"
                title="Remove recipient"
                className="flex h-[42px] w-11 items-center justify-center rounded-lg border border-white/10 text-zinc-500 transition hover:border-rose-500/50 hover:bg-rose-500/[0.06] hover:text-rose-300"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                </svg>
              </button>

              {/* Inline per-row error (verbatim parser message) */}
              {rowError && (
                <p className="text-[12px] leading-snug text-rose-300 sm:col-span-4">
                  {rowError}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Add recipient */}
      <div>
        <button
          type="button"
          onClick={addRow}
          disabled={atCap}
          className="inline-flex items-center gap-2.5 rounded-lg border border-dashed border-white/15 px-5 py-3 text-[13px] font-medium text-zinc-400 transition hover:border-violet-500/50 hover:bg-violet-500/[0.06] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/15 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/15 text-[15px] leading-none text-violet-300">
            +
          </span>
          Add recipient
        </button>
        {atCap && (
          <p className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500">
            <span className="text-amber-300">▲</span>
            Live testnet cap: up to {LIVE_RECIPIENT_CAP} recipients per distribution.
          </p>
        )}
      </div>

      {/* Privacy reassurance (amounts encrypted; registry stores metadata only) */}
      <div className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-[12.5px] leading-relaxed text-zinc-400">
        <span className="mt-0.5 text-violet-300" aria-hidden="true">🛡</span>
        <span>
          <span className="font-semibold text-zinc-200">Allocation amounts stay confidential.</span>{" "}
          They&apos;re encrypted with TokenOps/Zama before anything is sent — the public
          registry only ever sees the title, token, and recipient count. Notes never leave
          this browser.
        </span>
      </div>

      {/* Summary + validation counts (same indicators the step already showed) */}
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
        </>
      )}

      {/* Escape hatch: paste a list, parsed into rows by the existing parser */}
      <Card className="p-4">
        <button
          type="button"
          onClick={() => setPasteOpen((o) => !o)}
          aria-expanded={pasteOpen}
          className="flex w-full items-center justify-between gap-3 text-left text-[13px] font-medium text-zinc-300 transition hover:text-white"
        >
          <span>Paste a list instead</span>
          <span className="font-mono text-[12px] text-zinc-500">
            {pasteOpen ? "▲ hide" : "▼ open"}
          </span>
        </button>
        {pasteOpen && (
          <div className="mt-3 space-y-3">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              spellCheck={false}
              rows={5}
              placeholder={"wallet,amount,note\n0xabc…,100,Advisor allocation"}
              className="w-full rounded-lg border border-white/10 bg-black/30 p-3.5 font-mono text-[12.5px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={applyPaste}
                className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-[13px] font-medium text-zinc-200 transition hover:bg-white/10"
              >
                Parse into rows
              </button>
              <span className="font-mono text-[11.5px] text-zinc-600">
                wallet, amount, note — header row optional (first {LIVE_RECIPIENT_CAP} used)
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
