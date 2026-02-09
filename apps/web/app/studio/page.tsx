/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useMemo, useState } from "react";

type Entry = {
  id: string;
  title: string | null;
  body?: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "reflected";
  wordCount: number;
};

type Feedback = {
  id?: string;
  entryId: string;
  agent: "editor" | "definer" | "skeptic" | "coach" | "risk";
  content: string;
  createdAt: string;
  model?: string;
  promptVersion?: string;
};

const AGENT_META: Record<
  Feedback["agent"],
  { label: string; role: string; accent: string; tint: string }
> = {
  editor: {
    label: "Editor",
    role: "Clarity",
    accent: "#7a4f2b",
    tint: "rgba(122,79,43,0.08)"
  },
  definer: {
    label: "Definer",
    role: "Definitions",
    accent: "#2f6f73",
    tint: "rgba(47,111,115,0.08)"
  },
  risk: {
    label: "Risk",
    role: "Safeguards",
    accent: "#9b2c2c",
    tint: "rgba(155,44,44,0.08)"
  },
  skeptic: {
    label: "Skeptic",
    role: "Logic",
    accent: "#2d4f6f",
    tint: "rgba(45,79,111,0.08)"
  },
  coach: {
    label: "Coach",
    role: "Direction",
    accent: "#7a3f5f",
    tint: "rgba(122,63,95,0.08)"
  }
};


function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getPreviewLine(content: string) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] ?? "No content returned.";
}

function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function parseSections(content: string) {
  const lines = content.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^([A-Z][A-Z ]+):\s*$/);
    if (headingMatch) {
      if (current) {
        sections.push({ title: current.title, body: current.lines.join("\n").trim() });
      }
      current = { title: headingMatch[1], lines: [] };
      continue;
    }
    if (!current) {
      current = { title: "Output", lines: [] };
    }
    current.lines.push(line);
  }

  if (current) {
    sections.push({ title: current.title, body: current.lines.join("\n").trim() });
  }

  return sections.filter((section) => section.body.length > 0);
}

export default function StudioPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isReflecting, setIsReflecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [agentFilter, setAgentFilter] = useState<Feedback["agent"] | "all">(
    "all"
  );
  const [showAllEntries, setShowAllEntries] = useState(false);

  const isEditingExisting = Boolean(selectedEntry?.id);
  const isDirty = selectedEntry
    ? title !== (selectedEntry.title ?? "") || body !== (selectedEntry.body ?? "")
    : true;
  const liveWordCount = useMemo(() => countWords(body), [body]);

  const sortedFeedback = useMemo(() => {
    const order = { editor: 0, definer: 1, risk: 2, skeptic: 3, coach: 4 };
    return [...feedback].sort((a, b) => order[a.agent] - order[b.agent]);
  }, [feedback]);

  const filteredFeedback = useMemo(() => {
    if (agentFilter === "all") {
      return sortedFeedback;
    }
    return sortedFeedback.filter((item) => item.agent === agentFilter);
  }, [agentFilter, sortedFeedback]);

  const agentCounts = useMemo(() => {
    return sortedFeedback.reduce(
      (acc, item) => {
        acc[item.agent] = (acc[item.agent] || 0) + 1;
        return acc;
      },
      {} as Record<Feedback["agent"], number>
    );
  }, [sortedFeedback]);

  const visibleEntries = useMemo(() => {
    if (showAllEntries) {
      return entries;
    }
    return entries.slice(0, 5);
  }, [entries, showAllEntries]);

  const loadEntries = useCallback(async function loadEntries() {
    setError(null);
    const response = await fetch("/api/entries");
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Failed to load entries.");
      return;
    }
    const data = (await response.json()) as { entries: Entry[] };
    setEntries(data.entries ?? []);
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function loadEntry(entryId: string) {
    setError(null);
    const response = await fetch(`/api/entries/${entryId}`);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Failed to load entry.");
      return;
    }
    const data = (await response.json()) as {
      entry: Entry;
      feedback: Feedback[];
    };
    setSelectedEntry(data.entry);
    setFeedback(data.feedback ?? []);
    setTitle(data.entry.title ?? "");
    setBody(data.entry.body ?? "");
  }

  async function handleCreate() {
    if (!body.trim()) {
      setError("Write something before saving.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const response = await fetch(
      selectedEntry?.id ? `/api/entries/${selectedEntry.id}` : "/api/entries",
      {
        method: selectedEntry?.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body })
      }
    );

    setIsSaving(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Could not save entry.");
      return;
    }

    const data = (await response.json()) as { entry: Entry };
    setSelectedEntry(data.entry);
    setFeedback([]);
    await loadEntries();
  }

  async function handleReflect() {
    if (!selectedEntry?.id) {
      setError("Save an entry before reflecting.");
      return;
    }

    setIsReflecting(true);
    setError(null);
    setFeedback([]);

    const response = await fetch(
      `/api/entries/${selectedEntry.id}/reflect/stream`,
      {
        method: "POST"
      }
    );

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null);
      setIsReflecting(false);
      setError(data?.error || "Reflection failed.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const payload = JSON.parse(trimmed) as
            | { type: "feedback"; data: Feedback }
            | { type: "done" }
            | { type: "error"; message: string };

          if (payload.type === "error") {
            setError(payload.message);
            setIsReflecting(false);
            return;
          }

          if (payload.type === "feedback") {
            setFeedback((prev) => {
              const next = prev.filter((item) => item.agent !== payload.data.agent);
              return [...next, payload.data];
            });
          }
        } catch (parseError) {
          console.error(parseError);
        }
      }
    }

    setIsReflecting(false);
    await loadEntries();
  }

  function handleNewEntry() {
    setSelectedEntry(null);
    setFeedback([]);
    setTitle("");
    setBody("");
    setError(null);
  }

  async function handleDelete(entryId: string) {
    setError(null);
    const response = await fetch(`/api/entries/${entryId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Delete failed.");
      return;
    }

    if (selectedEntry?.id === entryId) {
      handleNewEntry();
    }

    await loadEntries();
  }

  function renderMarkdown(content: string) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3 className="mt-4 text-base font-semibold text-[var(--ink)]">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 text-base font-semibold text-[var(--ink)]">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-4 text-sm font-semibold text-[var(--ink)]">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--ink)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--ink)]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--ink)]">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-[var(--ink)]">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-[var(--bg-2)] px-1 py-0.5 text-xs text-[var(--ink)]">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-3 border-l-2 border-[var(--stroke)] pl-3 text-sm text-[var(--muted)]">
              {children}
            </blockquote>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10 text-[var(--ink)] md:px-12">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <nav className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--muted)]">
              Reflection studio
            </p>
            <h1 className="font-[var(--font-display)] text-2xl font-semibold">
              Private Blogging Intelligence
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="tag">{entries.length} entries</span>
            <Link href="/" className="btn-ghost">
              View landing
            </Link>
          </div>
        </nav>
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
                Work session
              </p>
              <h2 className="mt-3 font-[var(--font-display)] text-3xl font-semibold">
                Capture the decision. Review the signal.
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
                Write clearly, then run reflection when the entry is ready.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-outline" onClick={handleCreate}>
                Save entry
              </button>
              <button
                className="btn-primary"
                onClick={handleReflect}
                disabled={isReflecting || !selectedEntry}
              >
                {isReflecting ? "Reflecting..." : "Run reflection"}
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-4 rounded-2xl border border-[var(--accent-2)] bg-white/70 p-4 text-sm text-[var(--accent-2)]">
              {error}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto mt-10 flex w-full max-w-6xl flex-col gap-8">
        <section className="grid items-start gap-6 lg:grid-cols-2">
          <div className="card h-fit self-start p-6 animate-rise">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-[var(--font-display)] text-xl font-semibold">
                  Entry workspace
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Focus on the decision, not the story.
                </p>
              </div>
              {selectedEntry && (
                <span className="tag">{selectedEntry.status}</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["editor", "definer", "risk", "skeptic", "coach"] as const).map((agent) => (
                <span key={agent} className="chip">
                  {AGENT_META[agent].label}
                </span>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-4">
              <input
                className="w-full rounded-2xl border border-[var(--stroke)] bg-[var(--card-2)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                placeholder="Optional title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <textarea
                className="min-h-[260px] w-full resize-none rounded-2xl border border-[var(--stroke)] bg-[var(--card-2)] px-4 py-4 text-sm leading-relaxed outline-none transition focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
                placeholder="Write the decision, the tension, and what you want next."
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
                <div className="flex items-center gap-3">
                  <span className="tag">{liveWordCount} words</span>
                  <span className="tag">{isDirty ? "Unsaved" : "Saved"}</span>
                </div>
                <span className="text-[10px] uppercase tracking-[0.2em]">
                  Private · Not shared
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn-primary"
                  onClick={handleCreate}
                  disabled={isSaving || !body.trim() || (isEditingExisting && !isDirty)}
                >
                  {isSaving
                    ? "Saving..."
                    : isEditingExisting
                      ? "Update entry"
                      : "Save entry"}
                </button>
                <button
                  className="btn-outline"
                  onClick={handleReflect}
                  disabled={isReflecting || !selectedEntry}
                >
                  {isReflecting ? "Reflecting..." : "Run reflection"}
                </button>
                <button className="btn-ghost" onClick={handleNewEntry}>
                  New entry
                </button>
              </div>
            </div>
          </div>

          <div className="card h-fit self-start p-6 animate-rise">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-[var(--font-display)] text-lg font-semibold">
                  Past entries
                </h2>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Latest first
                </p>
              </div>
              <span className="tag">{entries.length} total</span>
            </div>
            <div
              className={`mt-5 grid gap-3 border-[var(--stroke)] md:border-l md:pl-6 ${
                showAllEntries ? "" : "max-h-[520px] overflow-y-auto md:pr-2"
              }`}
            >
              {entries.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  No entries yet. Start with a real thought.
                </p>
              )}
              {visibleEntries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => loadEntry(entry.id)}
                  className={`relative flex w-full flex-col gap-2 rounded-2xl border px-4 py-3 text-left transition cursor-pointer ${
                    selectedEntry?.id === entry.id
                      ? "border-[var(--accent)] bg-[var(--card-2)] shadow-[0_20px_50px_rgba(20,23,27,0.12)]"
                      : "border-transparent bg-[var(--card-2)] hover:border-[var(--stroke)] hover:bg-white"
                  }`}
                >
                  <span className="absolute -left-[34px] top-6 hidden h-3 w-3 rounded-full border border-[var(--stroke)] bg-[var(--card)] md:block" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold break-words">
                        {entry.title || "Untitled entry"}
                      </span>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {formatDate(entry.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tag">{entry.status}</span>
                      <span className="tag">{entry.wordCount} words</span>
                      <button
                        className="text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--accent)]"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(entry);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {entries.length > 5 && (
              <button
                className="mt-4 btn-ghost"
                onClick={() => setShowAllEntries((prev) => !prev)}
              >
                {showAllEntries ? "Show less" : "See more"}
              </button>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="card p-6 animate-rise">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-[var(--font-display)] text-xl font-semibold">
                  Reflection
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Each agent responds independently. Filter by role.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "editor", "definer", "risk", "skeptic", "coach"] as const).map(
                  (agent) => (
                    <button
                      key={agent}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition flex items-center gap-2 ${
                        agentFilter === agent
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--stroke)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      }`}
                      onClick={() => setAgentFilter(agent)}
                    >
                      {agent !== "all" && (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: AGENT_META[agent].accent }}
                        />
                      )}
                      {agent === "all" ? "All" : AGENT_META[agent].label}
                      {agent !== "all" && (
                        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                          {agentCounts[agent] ?? 0}
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["editor", "definer", "risk", "skeptic", "coach"] as const).map((agent) => (
                <span key={agent} className="chip">
                  {AGENT_META[agent].label} · {AGENT_META[agent].role}
                </span>
              ))}
            </div>
          </div>

          {filteredFeedback.length === 0 && (
            <div className="rounded-[28px] border border-dashed border-[var(--stroke)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
              {selectedEntry
                ? "No feedback yet. Run reflection to generate agent responses."
                : "Select or save an entry to see reflections from the five agents."}
            </div>
          )}

          <div className="flex flex-col gap-5">
            {filteredFeedback.map((item) => {
              const sections = parseSections(item.content);
              const summarySection = sections.find((section) =>
                section.title.toUpperCase().includes("SUMMARY")
              );
              const preview = summarySection?.body || getPreviewLine(item.content);
              const meta = AGENT_META[item.agent];

              return (
                <details
                  key={`${item.entryId}-${item.agent}`}
                  className="group rounded-[28px] border border-[var(--stroke)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] animate-rise"
                  style={{ background: `linear-gradient(180deg, ${meta.tint}, transparent 40%)` }}
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span
                          className="h-10 w-10 rounded-2xl border border-[var(--stroke)]"
                          style={{ background: meta.accent }}
                        />
                        <div>
                          <h3 className="font-[var(--font-display)] text-lg font-semibold">
                            {meta.label}
                          </h3>
                          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            {meta.role}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                      <div className="text-right">
                        <p>{formatDate(item.createdAt)}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                          {item.promptVersion || "local"} · {item.model || "model"}
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
                        <span className="group-open:hidden">Expand</span>
                        <span className="hidden group-open:inline">Collapse</span>
                      </span>
                    </div>
                  </summary>
                  <div className="mt-4 text-sm text-[var(--muted)]">{preview}</div>
                  <div className="mt-5 border-t border-[var(--stroke)] pt-5">
                    <div className="flex flex-col gap-4">
                      {sections.map((section) => (
                        <div
                          key={`${item.agent}-${section.title}`}
                          className="rounded-2xl border border-[var(--stroke)] bg-[var(--card-2)] p-4"
                        >
                          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                            {section.title}
                          </p>
                          <div className="mt-3 text-sm text-[var(--muted)]">
                            {renderMarkdown(section.body)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </main>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
          <div className="card w-full max-w-md p-6">
            <h3 className="font-[var(--font-display)] text-lg font-semibold">
              Delete entry?
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This will permanently remove the entry and its feedback.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  if (target) {
                    await handleDelete(target.id);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
