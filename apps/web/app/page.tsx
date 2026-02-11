import Link from "next/link";

const HOW_IT_WORKS = [
  {
    title: "Capture the decision",
    description: "Write one private entry with the real tension."
  },
  {
    title: "Run the five agents",
    description: "Each agent answers a specific question."
  },
  {
    title: "Commit to a move",
    description: "You get a single signal to act on."
  }
];

const OUTCOMES = ["Clarity", "Focus", "Momentum"];

const AGENT_LINES = [
  { name: "Editor", line: "Sharpens the core tension and cleans the story." },
  { name: "Definer", line: "Pins down fuzzy terms so you stop debating yourself." },
  { name: "Risk", line: "Surfaces quiet downsides before you commit." },
  { name: "Skeptic", line: "Stress-tests the weakest claim." },
  { name: "Coach", line: "Recommends the single next move." }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen px-5 pb-16 pt-14 text-[var(--ink)] sm:px-6 md:px-12">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <nav className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-[var(--font-display)] text-xl font-semibold">
                Private Blogging Intelligence
              </h1>
            </div>
          </div>
          <div className="flex w-full items-center justify-center gap-3 sm:w-auto sm:justify-end">
            <Link href="/studio" className="btn-outline w-full sm:w-auto text-center">
              Test the studio
            </Link>
            <Link href="/studio" className="btn-primary w-full sm:w-auto text-center">
              Start now
            </Link>
          </div>
        </nav>

        <section className="card p-6 md:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="flex max-w-full flex-col gap-5 text-center lg:text-left">
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs uppercase tracking-[0.4em] text-[var(--muted)] lg:justify-start">
                <span>Five agents. One signal.</span>
                <span className="h-1 w-1 rounded-full bg-[var(--stroke)]" />
                <span>Private by design</span>
              </div>
              <h2 className="max-w-3xl font-[var(--font-display)] text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl break-words">
                Turn private writing into a decision you can trust.
              </h2>
              <p className="max-w-2xl text-base text-[var(--muted)] md:text-lg break-words mx-auto lg:mx-0">
                A calm reflection studio that turns uncertainty into a single clear next step.
              </p>
              <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                <Link href="/studio" className="btn-primary w-full sm:w-auto text-center">
                  Start a private entry
                </Link>
                <Link href="#how-it-works" className="btn-outline w-full sm:w-auto text-center">
                  See how it works
                </Link>
              </div>
              <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
                {OUTCOMES.map((item) => (
                  <span key={item} className="chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="card-soft overflow-hidden p-3">
              <div className="overflow-hidden rounded-2xl border border-[var(--stroke)] bg-white/60">
                <img
                  src="/landing-hero.jpg"
                  alt="Private Blogging Intelligence preview"
                  className="w-full object-cover h-[220px] sm:h-[260px] md:h-[300px]"
                  style={{ objectPosition: "70% 60%" }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                <span>Studio preview</span>
                <span>Calm workspace</span>
              </div>
            </div>
          </div>
        </section>
      </header>

      <main className="mx-auto mt-14 flex w-full max-w-6xl flex-col gap-14">
        <section id="how-it-works" className="grid gap-6 lg:grid-cols-3">
          {HOW_IT_WORKS.map((item, index) => (
            <div key={item.title} className="card p-6 animate-rise">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Step {index + 1}
              </p>
              <h3 className="mt-3 font-[var(--font-display)] text-xl font-semibold">
                {item.title}
              </h3>
              <p className="mt-3 text-sm text-[var(--muted)]">{item.description}</p>
            </div>
          ))}
        </section>

        <section className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                The five agents
              </p>
              <h3 className="mt-2 font-[var(--font-display)] text-2xl font-semibold">
                One line each. One clear signal.
              </h3>
            </div>
            <span className="tag">Focused</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {AGENT_LINES.map((agent) => (
              <div key={agent.name} className="card-soft p-4">
                <p className="text-sm font-semibold">{agent.name}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">{agent.line}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card flex flex-col gap-4 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
            Ready to test it?
          </p>
          <h3 className="font-[var(--font-display)] text-3xl font-semibold">
            Start an entry. Get a single signal.
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/studio" className="btn-primary">
              Open the studio
            </Link>
            <Link href="/studio" className="btn-outline">
              Run a reflection
            </Link>
          </div>
        </section>

        <section className="flex flex-col items-center gap-2 pb-6 text-center text-sm text-[var(--muted)]">
          <span className="text-xs uppercase tracking-[0.4em]">
            Crafted for calm decisions
          </span>
          <p className="text-base font-semibold text-[var(--ink)]">
            By Haseeb Raza
          </p>
          <p className="text-xs">
            Quiet thinking deserves a beautiful room.
          </p>
          <div className="flex flex-wrap justify-center gap-2 text-xs uppercase tracking-[0.25em]">
            <a
              className="tag transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              href="https://github.com/haseebraza715"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              className="tag transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              href="https://www.linkedin.com/in/haseebraza715"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
            <a
              className="tag transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              href="https://x.com/haseebraza715"
              target="_blank"
              rel="noreferrer"
            >
              X
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
