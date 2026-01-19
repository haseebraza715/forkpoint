"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useMemo, useState } from "react";

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
  agent: "editor" | "skeptic" | "coach";
  content: string;
  createdAt: string;
  model?: string;
  promptVersion?: string;
};

const AGENT_META: Record<Feedback["agent"], { label: string; role: string }> =
  {
    editor: { label: "Editor", role: "Clarity" },
    skeptic: { label: "Skeptic", role: "Logic" },
    coach: { label: "Coach", role: "Direction" }
  };

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isReflecting, setIsReflecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);

  const isEditingExisting = Boolean(selectedEntry?.id);
  const isDirty = selectedEntry
    ? title !== (selectedEntry.title ?? "") || body !== (selectedEntry.body ?? "")
    : true;

  const sortedFeedback = useMemo(() => {
    const order = { editor: 0, skeptic: 1, coach: 2 };
    return [...feedback].sort((a, b) => order[a.agent] - order[b.agent]);
  }, [feedback]);

  useEffect(() => {
    void loadEntries();
  }, []);

  async function loadEntries() {
    setError(null);
    const response = await fetch("/api/entries");
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error || "Failed to load entries.");
      return;
    }
    const data = (await response.json()) as { entries: Entry[] };
    setEntries(data.entries ?? []);
  }

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
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]">{children}</p>
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
    <div className="min-h-screen px-6 py-12 text-[var(--ink)] md:px-12">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Private reflection workspace
            </p>
            <h1 className="mt-2 font-[var(--font-display)] text-3xl font-semibold tracking-tight md:text-4xl">
              AI Private Blogging Feedback
            </h1>
          </div>
          <div className="rounded-full border border-[var(--stroke)] bg-[var(--card)] px-4 py-2 text-xs text-[var(--muted)] shadow-[var(--shadow-card)]">
            Three agents. One truth.
          </div>
        </div>
        <p className="max-w-3xl text-base text-[var(--muted)] md:text-lg">
          Write something real. Reflect with Editor, Skeptic, and Coach. Clarity
          over noise.
        </p>
      </header>

      <main className="mx-auto mt-10 grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col gap-6">
          <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h2 className="font-[var(--font-display)] text-xl font-semibold">
                New entry
              </h2>
              {selectedEntry && (
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  {selectedEntry.status}
                </span>
              )}
            </div>
            <div className="mt-5 flex flex-col gap-4">
              <input
                className="w-full rounded-2xl border border-[var(--stroke)] bg-white/70 px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
                placeholder="Optional title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <textarea
                className="min-h-[220px] w-full resize-none rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-4 text-sm leading-relaxed outline-none transition focus:border-[var(--accent)]"
                placeholder="Write with honesty. No formatting. No performance."
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="rounded-full border border-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleReflect}
                disabled={isReflecting || !selectedEntry}
              >
                {isReflecting ? "Reflecting..." : "Reflect"}
              </button>
              <button
                className="rounded-full border border-[var(--stroke)] px-5 py-2 text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                onClick={handleNewEntry}
              >
                New entry
              </button>
              {error && (
                <span className="text-sm text-[var(--accent-2)]">{error}</span>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--stroke)] bg-white/70 p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <h2 className="font-[var(--font-display)] text-lg font-semibold">
                Past entries
              </h2>
              <span className="text-xs text-[var(--muted)]">
                {entries.length} total
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {entries.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  No entries yet. Start with a real thought.
                </p>
              )}
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => loadEntry(entry.id)}
                  className={`flex w-full flex-col gap-2 rounded-2xl border px-4 py-3 text-left transition cursor-pointer ${
                    selectedEntry?.id === entry.id
                      ? "border-[var(--accent)] bg-[var(--card)]"
                      : "border-transparent bg-white/60 hover:border-[var(--stroke)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {entry.title || "Untitled entry"}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        {entry.status}
                      </span>
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
                  <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                    <span>{entry.wordCount} words</span>
                    <span>{formatDate(entry.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="rounded-3xl border border-[var(--stroke)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-[var(--font-display)] text-xl font-semibold">
              Reflection
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Each agent responds independently. Read slowly.
            </p>
          </div>

          {sortedFeedback.length === 0 && (
            <div className="rounded-3xl border border-dashed border-[var(--stroke)] bg-white/70 p-6 text-sm text-[var(--muted)]">
              No feedback yet. Save an entry, then click Reflect.
            </div>
          )}

          {sortedFeedback.map((item) => (
            <article
              key={`${item.entryId}-${item.agent}`}
              className="rounded-3xl border border-[var(--stroke)] bg-white/80 p-6 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-[var(--font-display)] text-lg font-semibold">
                    {AGENT_META[item.agent].label}
                  </h3>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    {AGENT_META[item.agent].role}
                  </p>
                </div>
                <span className="text-xs text-[var(--muted)]">
                  {formatDate(item.createdAt)}
                </span>
              </div>
              <div className="mt-4">{renderMarkdown(item.content)}</div>
            </article>
          ))}
        </section>
      </main>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
          <div className="w-full max-w-md rounded-3xl border border-[var(--stroke)] bg-[var(--card)] p-6 shadow-[var(--shadow-card)]">
            <h3 className="font-[var(--font-display)] text-lg font-semibold">
              Delete entry?
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This will permanently remove the entry and its feedback.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
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
