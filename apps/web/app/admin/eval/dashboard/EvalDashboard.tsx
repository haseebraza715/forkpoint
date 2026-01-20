"use client";

import { useEffect, useMemo, useState } from "react";

type SummaryResponse = {
  totals: Array<{ _id: string; count: number }>;
  byPromptVersion: Array<{
    _id: string;
    verdicts: Array<{ verdict: string; count: number }>;
    total: number;
  }>;
  topViolations: Array<{ _id: string; count: number }>;
  byPromptVersionViolations: Array<{
    _id: string;
    violations: Array<{ violation: string; count: number }>;
  }>;
  redundancy: Array<{ _id: string; count: number }>;
  recent: Array<{
    result: {
      entryId: string;
      verdict: string;
      overallScore: number;
      timestamp: string;
      promptVersion: string;
    };
  }>;
};

type RegressionResponse = {
  from: {
    promptVersion: string;
    verdicts: Array<{ _id: string; count: number }>;
    violations: Array<{ _id: string; count: number }>;
  };
  to: {
    promptVersion: string;
    verdicts: Array<{ _id: string; count: number }>;
    violations: Array<{ _id: string; count: number }>;
  };
};

function countFrom(list: Array<{ _id: string; count: number }>, key: string) {
  const item = list.find((entry) => entry._id === key);
  return item?.count ?? 0;
}

export default function EvalDashboard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [regression, setRegression] = useState<RegressionResponse | null>(null);
  const [fromVersion, setFromVersion] = useState<string | null>(null);
  const [toVersion, setToVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSummary();
  }, []);

  async function loadSummary() {
    setError(null);
    const response = await fetch("/api/eval/summary");
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Failed to load summary.");
      return;
    }
    const data = (await response.json()) as SummaryResponse;
    setSummary(data);

    const versions = data.byPromptVersion.map((item) => item._id);
    if (versions.length >= 2) {
      setFromVersion(versions[1]);
      setToVersion(versions[0]);
    } else if (versions.length === 1) {
      setFromVersion(versions[0]);
      setToVersion(versions[0]);
    }
  }

  const verdictTotals = useMemo(() => {
    if (!summary) return { pass: 0, fail: 0, flag: 0 };
    return {
      pass: countFrom(summary.totals, "pass"),
      fail: countFrom(summary.totals, "fail"),
      flag: countFrom(summary.totals, "flag")
    };
  }, [summary]);

  async function loadRegression() {
    if (!fromVersion || !toVersion) {
      return;
    }
    const response = await fetch(
      `/api/eval/regressions?from=${encodeURIComponent(fromVersion)}&to=${encodeURIComponent(toVersion)}`
    );
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Failed to load regression data.");
      return;
    }
    const data = (await response.json()) as RegressionResponse;
    setRegression(data);
  }

  const promptVersions = summary?.byPromptVersion.map((item) => item._id) ?? [];

  return (
    <div className="min-h-screen px-6 py-12 md:px-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-3xl border border-[var(--stroke)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)]">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Private Eval Mode
          </p>
          <h1 className="mt-2 font-[var(--font-display)] text-3xl font-semibold">
            Eval Dashboard
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Aggregate trends and regression checks for prompt versions.
          </p>
        </header>

        {error && (
          <div className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4 text-sm text-[var(--accent-2)]">
            {error}
          </div>
        )}

        {summary && (
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-5 shadow-[var(--shadow-card)]">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Pass
              </p>
              <p className="mt-2 text-2xl font-semibold">{verdictTotals.pass}</p>
            </div>
            <div className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-5 shadow-[var(--shadow-card)]">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Fail
              </p>
              <p className="mt-2 text-2xl font-semibold">{verdictTotals.fail}</p>
            </div>
            <div className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-5 shadow-[var(--shadow-card)]">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Flag
              </p>
              <p className="mt-2 text-2xl font-semibold">{verdictTotals.flag}</p>
            </div>
          </section>
        )}

        {summary && (
          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow-card)]">
              <h2 className="font-[var(--font-display)] text-lg font-semibold">
                Prompt Versions
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                {summary.byPromptVersion.map((item) => (
                  <div
                    key={item._id}
                    className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{item._id}</span>
                      <span className="text-xs text-[var(--muted)]">
                        {item.total} evals
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {item.verdicts.map((verdict) => (
                        <span
                          key={verdict.verdict}
                          className="rounded-full border border-[var(--stroke)] px-2 py-1 uppercase tracking-[0.2em] text-[var(--muted)]"
                        >
                          {verdict.verdict}: {verdict.count}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow-card)]">
              <h2 className="font-[var(--font-display)] text-lg font-semibold">
                Top Violations
              </h2>
              <div className="mt-4 flex flex-col gap-2 text-sm text-[var(--muted)]">
                {summary.topViolations.length === 0 && (
                  <p>No violations recorded.</p>
                )}
                {summary.topViolations.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between"
                  >
                    <span>{item._id}</span>
                    <span className="text-xs">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {summary && (
          <section className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-[var(--font-display)] text-lg font-semibold">
              Regression Tracker
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-3 py-2 text-sm"
                value={fromVersion ?? ""}
                onChange={(event) => setFromVersion(event.target.value)}
              >
                {promptVersions.map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
              <span className="text-sm text-[var(--muted)]">to</span>
              <select
                className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-3 py-2 text-sm"
                value={toVersion ?? ""}
                onChange={(event) => setToVersion(event.target.value)}
              >
                {promptVersions.map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
              <button
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                onClick={loadRegression}
              >
                Compare
              </button>
            </div>

            {regression && (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--card)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {regression.from.promptVersion}
                  </p>
                  <div className="mt-3 text-sm text-[var(--muted)]">
                    {regression.from.verdicts.map((item) => (
                      <div key={item._id} className="flex justify-between">
                        <span>{item._id}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-[var(--muted)]">
                    {regression.from.violations.map((item) => (
                      <div key={item._id} className="flex justify-between">
                        <span>{item._id}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--card)] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {regression.to.promptVersion}
                  </p>
                  <div className="mt-3 text-sm text-[var(--muted)]">
                    {regression.to.verdicts.map((item) => (
                      <div key={item._id} className="flex justify-between">
                        <span>{item._id}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-[var(--muted)]">
                    {regression.to.violations.map((item) => (
                      <div key={item._id} className="flex justify-between">
                        <span>{item._id}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {summary && (
          <section className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-[var(--font-display)] text-lg font-semibold">
              Recent Evals
            </h2>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {summary.recent.map((item) => (
                <div
                  key={`${item.result.entryId}-${item.result.timestamp}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3"
                >
                  <span className="text-xs text-[var(--muted)]">
                    {new Date(item.result.timestamp).toLocaleString()}
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {item.result.verdict}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    Score: {item.result.overallScore}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    Prompt: {item.result.promptVersion}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
