/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";

type Entry = {
  id: string;
  title: string | null;
  createdAt: string;
  status: "draft" | "reflected";
  wordCount: number;
};

type EvalResult = {
  evalId: string;
  entryId: string;
  promptVersion: string;
  model: string;
  timestamp: string;
  verdict: string;
  overallScore: number;
  fullTranscript: string;
};

export default function EvalPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [evaluation, setEvaluation] = useState<EvalResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [force, setForce] = useState(false);

  const loadEntries = useCallback(async function loadEntries() {
    setError(null);
    const response = await fetch("/api/entries");
    if (!response.ok) {
      setError("Failed to load entries.");
      return;
    }
    const data = (await response.json()) as { entries: Entry[] };
    setEntries(data.entries ?? []);
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function runEval() {
    if (!selectedEntry) {
      setError("Select an entry first.");
      return;
    }

    setIsRunning(true);
    setError(null);

    const response = await fetch("/api/eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: selectedEntry.id, force })
    });

    setIsRunning(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Eval failed.");
      return;
    }

    const data = (await response.json()) as { evaluation: EvalResult };
    setEvaluation(data.evaluation);
  }

  return (
    <div className="min-h-screen px-6 py-12 md:px-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="rounded-3xl border border-[var(--stroke)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)]">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Private Eval Mode
          </p>
          <h1 className="mt-2 font-[var(--font-display)] text-3xl font-semibold">
            Audit Eval Console
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Run the eval agent against an entry and review the JSON output.
          </p>
        </header>

        <section className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-[var(--font-display)] text-lg font-semibold">
              Entries
            </h2>
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={force}
                onChange={(event) => setForce(event.target.checked)}
              />
              Force re-eval
            </label>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedEntry(entry)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  selectedEntry?.id === entry.id
                    ? "border-[var(--accent)] bg-[var(--card)]"
                    : "border-transparent bg-white/60 hover:border-[var(--stroke)]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">
                    {entry.title || "Untitled entry"}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                    {entry.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {entry.wordCount} words
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={runEval}
              disabled={!selectedEntry || isRunning}
            >
              {isRunning ? "Running..." : "Run eval"}
            </button>
            {error && <span className="text-sm text-[var(--accent-2)]">{error}</span>}
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--stroke)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-[var(--font-display)] text-lg font-semibold">
            Latest Eval
          </h2>
          {!evaluation && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              No evaluation loaded yet.
            </p>
          )}
          {evaluation && (
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4 text-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Summary
                </p>
                <p className="mt-2 text-sm">
                  Verdict: <strong>{evaluation.verdict}</strong>
                </p>
                <p className="text-sm">Score: {evaluation.overallScore}</p>
                <p className="text-xs text-[var(--muted)]">
                  Model: {evaluation.model}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Prompt: {evaluation.promptVersion}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {new Date(evaluation.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4 text-xs text-[var(--muted)]">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Transcript
                </p>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--ink)]">
                  {evaluation.fullTranscript}
                </pre>
              </div>
            </div>
          )}
          {evaluation && (
            <div className="mt-4 rounded-2xl border border-[var(--stroke)] bg-white/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Raw JSON
              </p>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--ink)]">
                {JSON.stringify(evaluation, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
