"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SummaryResponse = {
  totals: Array<{ _id: string; count: number }>;
  overall: {
    total: number;
    avgScore: number;
    minScore: number;
    maxScore: number;
  };
  byPromptVersion: Array<{
    _id: string;
    verdicts: Array<{ verdict: string; count: number }>;
    total: number;
  }>;
  promptStats: Array<{
    _id: string;
    total: number;
    avgScore: number;
    minScore: number;
    maxScore: number;
  }>;
  topViolations: Array<{ _id: string; count: number }>;
  byPromptVersionViolations: Array<{
    _id: string;
    violations: Array<{ violation: string; count: number }>;
  }>;
  redundancy: Array<{ _id: string; count: number }>;
  agentRolePurity: Array<{ _id: { agent: string; rolePurity: string }; count: number }>;
  agentFormat: Array<{ _id: { agent: string; formatCompliance: string }; count: number }>;
  agentPressure: Array<{ _id: { agent: string; pressureLevel: string }; count: number }>;
  recent: Array<{
    result: {
      entryId: string;
      verdict: string;
      overallScore: number;
      timestamp: string;
      promptVersion: string;
      violations?: string[];
    };
  }>;
};

type RegressionResponse = {
  from: {
    promptVersion: string;
    verdicts: Array<{ _id: string; count: number }>;
    violations: Array<{ _id: string; count: number }>;
    scoreStats: { avgScore: number; minScore: number; maxScore: number; total: number };
  };
  to: {
    promptVersion: string;
    verdicts: Array<{ _id: string; count: number }>;
    violations: Array<{ _id: string; count: number }>;
    scoreStats: { avgScore: number; minScore: number; maxScore: number; total: number };
  };
  deltas: {
    avgScoreDelta: number;
    passRateDelta: number;
    totalDelta: number;
  };
};

function countFrom(list: Array<{ _id: string; count: number }>, key: string) {
  const item = list.find((entry) => entry._id === key);
  return item?.count ?? 0;
}

function formatDelta(value: number, isPercent = false): string {
  const sign = value >= 0 ? "+" : "";
  if (isPercent) {
    return `${sign}${(value * 100).toFixed(1)}%`;
  }
  return `${sign}${value.toFixed(1)}`;
}

export default function EvalDashboard() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [regression, setRegression] = useState<RegressionResponse | null>(null);
  const [fromVersion, setFromVersion] = useState<string | null>(null);
  const [toVersion, setToVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const loadSummary = useCallback(async function loadSummary() {
    setError(null);
    let url = "/api/eval/summary";
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url);
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
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

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

  // Build agent metrics from summary data
  const agentMetrics = useMemo(() => {
    if (!summary) return null;
    const agents = ["editor", "definer", "skeptic", "coach"];
    return agents.map((agent) => {
      const purityData = summary.agentRolePurity.filter((item) => item._id.agent === agent);
      const formatData = summary.agentFormat.filter((item) => item._id.agent === agent);
      const pressureData = summary.agentPressure.filter((item) => item._id.agent === agent);

      const purityTotal = purityData.reduce((sum, item) => sum + item.count, 0);
      const cleanCount = purityData.find((item) => item._id.rolePurity === "clean")?.count || 0;
      const compliantCount = formatData.find((item) => item._id.formatCompliance === "compliant")?.count || 0;
      const formatTotal = formatData.reduce((sum, item) => sum + item.count, 0);
      const calibratedCount = pressureData.find((item) => item._id.pressureLevel === "calibrated")?.count || 0;
      const pressureTotal = pressureData.reduce((sum, item) => sum + item.count, 0);

      return {
        agent,
        cleanRate: purityTotal > 0 ? (cleanCount / purityTotal) * 100 : 0,
        compliantRate: formatTotal > 0 ? (compliantCount / formatTotal) * 100 : 0,
        calibratedRate: pressureTotal > 0 ? (calibratedCount / pressureTotal) * 100 : 0
      };
    });
  }, [summary]);

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
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="date"
              className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From date"
            />
            <span className="text-sm text-[var(--muted)]">to</span>
            <input
              type="date"
              className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-3 py-2 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To date"
            />
            <button
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              onClick={loadSummary}
            >
              Filter
            </button>
            {(dateFrom || dateTo) && (
              <button
                className="text-sm text-[var(--muted)] underline"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  void loadSummary();
                }}
              >
                Clear
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4 text-sm text-[var(--accent-2)]">
            {error}
          </div>
        )}

        {summary && (
          <section className="grid gap-4 md:grid-cols-4">
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
            <div className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-5 shadow-[var(--shadow-card)]">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                Avg Score
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {summary.overall.avgScore?.toFixed(1) || "—"}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                min: {summary.overall.minScore?.toFixed(0) || "—"} / max: {summary.overall.maxScore?.toFixed(0) || "—"}
              </p>
            </div>
          </section>
        )}

        {summary && agentMetrics && (
          <section className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-[var(--font-display)] text-lg font-semibold">
              Agent Health
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              {agentMetrics.map((agent) => (
                <div key={agent.agent} className="rounded-2xl border border-[var(--stroke)] bg-[var(--card)] p-4">
                  <p className="text-sm font-semibold capitalize">{agent.agent}</p>
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    <div className="flex justify-between">
                      <span>Role Purity</span>
                      <span className={agent.cleanRate >= 90 ? "text-green-600" : agent.cleanRate >= 70 ? "text-yellow-600" : "text-red-600"}>
                        {agent.cleanRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Format</span>
                      <span className={agent.compliantRate >= 90 ? "text-green-600" : agent.compliantRate >= 70 ? "text-yellow-600" : "text-red-600"}>
                        {agent.compliantRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pressure</span>
                      <span className={agent.calibratedRate >= 90 ? "text-green-600" : agent.calibratedRate >= 70 ? "text-yellow-600" : "text-red-600"}>
                        {agent.calibratedRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
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
                {summary.byPromptVersion.map((item) => {
                  const stats = summary.promptStats.find((s) => s._id === item._id);
                  return (
                    <div
                      key={item._id}
                      className="rounded-2xl border border-[var(--stroke)] bg-white/80 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{item._id}</span>
                        <span className="text-xs text-[var(--muted)]">
                          {item.total} evals | avg: {stats?.avgScore?.toFixed(1) || "—"}
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
                  );
                })}
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
              <>
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <div className={`rounded-2xl border px-4 py-2 ${regression.deltas.avgScoreDelta >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    <span className="text-[var(--muted)]">Avg Score: </span>
                    <span className={regression.deltas.avgScoreDelta >= 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                      {formatDelta(regression.deltas.avgScoreDelta)}
                    </span>
                  </div>
                  <div className={`rounded-2xl border px-4 py-2 ${regression.deltas.passRateDelta >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    <span className="text-[var(--muted)]">Pass Rate: </span>
                    <span className={regression.deltas.passRateDelta >= 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                      {formatDelta(regression.deltas.passRateDelta, true)}
                    </span>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--card)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      {regression.from.promptVersion}
                    </p>
                    <p className="mt-1 text-sm">
                      Avg: {regression.from.scoreStats.avgScore?.toFixed(1)} |
                      Min: {regression.from.scoreStats.minScore} |
                      Max: {regression.from.scoreStats.maxScore}
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
                      {regression.from.violations.slice(0, 5).map((item) => (
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
                    <p className="mt-1 text-sm">
                      Avg: {regression.to.scoreStats.avgScore?.toFixed(1)} |
                      Min: {regression.to.scoreStats.minScore} |
                      Max: {regression.to.scoreStats.maxScore}
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
                      {regression.to.violations.slice(0, 5).map((item) => (
                        <div key={item._id} className="flex justify-between">
                          <span>{item._id}</span>
                          <span>{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
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
                  <span className={`text-xs uppercase tracking-[0.2em] font-semibold ${
                    item.result.verdict === "pass" ? "text-green-600" :
                    item.result.verdict === "fail" ? "text-red-600" : "text-yellow-600"
                  }`}>
                    {item.result.verdict}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    Score: {item.result.overallScore}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {item.result.promptVersion}
                  </span>
                  {item.result.violations && item.result.violations.length > 0 && (
                    <span className="text-xs text-red-500">
                      {item.result.violations.length} violation{item.result.violations.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
