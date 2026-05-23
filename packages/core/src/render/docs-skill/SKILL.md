---
name: repomap-docs-writer
description: Generate developer documentation for code repositories (single-repo, monorepo, or multi-repo systems) at the quality level of Stripe, Django, FastAPI, and Vue.js. Use this skill whenever you receive a structural graph of a codebase (services, endpoints, inter-service calls, env vars) and must produce documentation — overview, per-service pages, integrations, architectural narrative, onboarding guides — that is pedagogical, opinionated, and friendly to both newcomers joining a team and external API consumers. Trigger this skill for any task involving generating JSON or Markdown documentation from a compact code graph, especially in the repomap pipeline (graphify → graph.json → Claude → docs JSON → HTML). Use it even when the request only says "document this repo" or "write the service docs" — the skill defines how to make those docs genuinely useful instead of generic.
---

# repomap-docs-writer

You are writing developer documentation for code repositories. The input is a structural graph (services, classes, functions, imports, HTTP endpoints, inter-service calls, env vars, docker-compose mappings) — typically 5–15K tokens, never the source code itself. The output is documentation that a real human will read to understand the system.

The bar is the Django tutorial, the Stripe API docs, the FastAPI guide, the Vue.js docs. That is the standard. Do not settle for "describes what the code does" — that is the baseline of bad documentation. The goal is documentation that **teaches**.

## The non-negotiable principles

These five principles override everything else. If a piece of generated text violates any of them, it is wrong, regardless of how technically accurate it is.

### 1. Reader-first, not code-first

Bad documentation describes the code: "The `AuthService` class has a `login` method that takes credentials and returns a token." A reader who already understands the code does not need this. A reader who does not understand the code learns nothing useful from it.

Good documentation answers the questions a reader actually has: *What is this for? When would I touch it? What happens if I change it? How does it fit with everything else?* Always start from the reader's question, not from the code's structure.

### 2. Explain the why before the what

A function signature tells you *what*. A reader who is trying to learn the system needs *why*. Every service page, every architectural section, every onboarding step must include a "why this exists" before the "how it works". One sentence is often enough — but it must be there.

Counter-example to avoid: "The `notifications` service handles notifications." This is a tautology and tells the reader nothing. Replace with: "The `notifications` service exists because three other services (orders, payments, auth) all need to send emails and push notifications, and we did not want each of them to re-implement retry logic, template rendering, and provider failover."

### 3. Concrete over abstract, always

When you have a choice between an abstract description and a concrete example, choose the example. When you must give an abstract description, follow it immediately with a concrete example.

- Bad: "The service uses event-driven communication patterns."
- Better: "When a user places an order, the `orders` service emits an `order.created` event. The `inventory`, `notifications`, and `analytics` services each react to it independently — they do not call `orders` back."

### 4. Show the path 90% of developers will take

This is the Stripe principle. Documentation that documents every possibility equally is documentation that helps no one. Identify the happy path — the workflow that 90% of developers actually use — and make that path obvious, prominent, and unmissable. Edge cases get their own clearly-marked section, not equal billing with the main flow.

For repomap, the happy path is typically: "I am a new developer, I cloned the repo, what do I run, what do I read first, what should I touch and what should I not touch?"

### 5. Cognitive load is the enemy

Every sentence should fight for its place. Every paragraph should earn its existence. If a paragraph can be cut without loss, cut it. If a sentence repeats the previous one with different words, cut it. If a section restates the section heading, cut it.

The reader's attention is a budget. Spend it on things they will remember.

## The Diátaxis structure (mandatory)

Documentation has four distinct modes, and mixing them produces confusing documentation. This is the foundation. Read `references/diataxis-for-repos.md` for the full treatment, but the summary is:

| Mode | Purpose | Voice | Example in repomap context |
|------|---------|-------|----------------------------|
| **Tutorial** | Learning by doing | "Let's walk through..." | "Your first hour with the platform" — onboarding |
| **How-to** | Solve a specific problem | "To do X, follow these steps" | "How to add a new endpoint to the orders service" |
| **Reference** | Look up facts | Neutral, factual, complete | Endpoint specs, env var lists, service inventories |
| **Explanation** | Understand the why | Conversational, reflective | "Why we split auth into two services" |

**For repomap's output**, map graph data to these modes:

- **Overview page** → mostly Explanation + a small Tutorial slice ("read these three services first")
- **Per-service page** → Reference (endpoints, env vars) + Explanation (what it is, why it exists) + targeted How-to (common tasks)
- **Integrations page** → Reference (the call graph) + Explanation (the patterns)
- **Architectural diagrams** → Reference, but with explanatory captions
- **Onboarding guide** → Tutorial (the primary deliverable for the team-internal audience)

Never write a "service page" that is half reference and half tutorial without signposting. The reader's brain switches modes; you must switch with it.

## The repomap-specific workflow

When you receive a compacted graph + a schema, follow this order. Do not skip steps.

### Step 1: Read the graph as a story, not a spec

Before writing a single sentence, build a mental model of the system. Ask:

1. **What kind of system is this?** Monolith, microservices, service-oriented monorepo, library + examples, CLI tool, SDK + backend? The graph shape tells you.
2. **What is the central entity?** What does the system primarily *do*? (Process orders? Serve a UI? Train models? Provide an API?) The most-called service or the entrypoint with the most fan-out is usually the answer.
3. **What are the boundaries?** External APIs called, databases touched, queues used, env vars consumed — these define what is "inside" vs "outside".
4. **What is unusual?** Every codebase has weird parts. A service that nobody calls but exists. A circular dependency. A library used in only one place. These weird parts are where the reader's questions will arise — surface them.

Only after you can answer these four questions in plain English are you ready to write.

### Step 2: Decide the audience split

repomap supports two primary audiences:
- **Internal devs joining the team** — need onboarding, decision history, "why this exists"
- **External consumers of a public API/library** — need stable contracts, examples, edge cases

Detect which from the graph + repo metadata:
- Repos with `package.json` published to a registry, OpenAPI specs, or `pip`/`npm` install instructions → tilts external
- Repos with internal env vars, docker-compose, deploy scripts, multiple services → tilts internal
- Both signals present → write for both, with explicit signposting ("If you are integrating from outside, jump to X. If you are joining the team, start with Y.")

### Step 3: Write the overview first, services second

The overview is the hardest piece because it must give a complete mental model in under 800 words. It is also the piece the reader reads first, so it sets the tone for everything. Read `references/templates.md` → "Overview template" for the exact structure.

Only after the overview is solid should you write the per-service pages. Each service page is partially constrained by the overview — it should not re-explain what was already explained, it should drill down.

### Step 4: Write integrations as a narrative of flows, not a list of calls

The biggest documentation mistake in multi-service systems is documenting integrations as "Service A calls Service B at endpoint X". This is technically accurate and almost useless.

Instead, document **flows**: "When a user signs up, the following happens: (1) the web app calls `auth.register`, which (2) creates the user, emits `user.created`, then (3) `notifications` picks up the event and sends a welcome email, while (4) `analytics` picks up the same event and records the signup."

A flow narrative tells the reader what to expect when they do something. A call list does not.

### Step 5: Add diagrams where prose fails

Mermaid is your friend, but a diagram that does not show something prose cannot show is just noise. Read `references/diagrams.md` for when to use what. The short version:

- **Sequence diagram** when explaining a flow that involves 3+ services in a specific order
- **Flowchart / graph** when explaining structural relationships (who depends on who)
- **C4 Context** when explaining the system to someone who has never seen it
- **C4 Container** when explaining the deployable units and their data stores
- **State diagram** when the system has explicit state machines

Never include a diagram without an accompanying caption that says *what to see* in it. "The diagram below" is not a caption. "Notice that the `orders` service is the only one that writes to the database — everything else reads through it" is a caption.

## Voice and style

- **Second person**, present tense. "You define the schema" not "the user defines the schema" or "one would define the schema".
- **Active voice**. "The service emits an event" not "an event is emitted by the service".
- **Sentence-case headings**. "How services communicate" not "How Services Communicate".
- **Code in code font**, services in code font when referring to the identifier (`orders`), but normal prose when talking about the concept ("the orders service handles…").
- **No marketing language**. No "robust", "seamless", "powerful", "leverages", "best-in-class". These are noise.
- **No hedging**. "The service uses Redis for caching" not "The service generally uses Redis, primarily for caching, in most cases".
- **Define jargon on first use**, even obvious-seeming jargon. The reader may be new to the domain.
- **Match the language of the user's request** (ES or EN). If unspecified, follow the repo's primary language (commit messages, README).

For the full word list of preferred vs avoided terms, see `references/writing-principles.md`.

## Things to actively avoid

These appear so frequently in AI-generated documentation that they have become a smell. Treat them as bugs:

1. **Restating the obvious**: "The `User` class represents a user." — Cut.
2. **Padding adjectives**: "The robust and scalable authentication system" — Cut both adjectives.
3. **Auto-generated-looking lists** without prose: a wall of bullets describing each method with one line of "what". The reader bounces.
4. **The "this codebase implements" preamble**: never start an overview with "This codebase implements a [type] application built with [stack]." Start with what it *does* for whom.
5. **Sycophancy toward the code**: do not call the architecture "elegant" or "well-designed". The reader will form their own opinion. Just describe it.
6. **Hallucinated rationale**: if the graph does not tell you *why* something exists, do not invent a reason. Use phrases like "likely because" or "consistent with" — or omit the rationale entirely. Inventing reasons is worse than omitting them, because it teaches the reader things that are false.
7. **The "best practices" disclaimer**: never write "follows industry best practices" or "uses modern patterns". This is filler.

## Output contract

When called from the repomap pipeline, you produce a single JSON matching the schema provided in the prompt. The schema typically includes:

- `overview` — string, the system narrative (target: 400–800 words)
- `services[]` — array of per-service objects, each with `name`, `purpose`, `responsibilities`, `endpoints`, `env_vars`, `dependencies`, `mermaid_diagram` (optional), `common_tasks`
- `integrations` — narrative of flows + a structural diagram
- `onboarding` — Tutorial-mode "first hour" guide for internal audience (skip or shorten for pure external)
- `diagrams[]` — Mermaid blocks with title + caption + body

Fields not in the schema must not be invented. Fields in the schema must not be skipped — if the graph does not give you data for one, write a short honest note ("No public endpoints detected in this service") instead of inventing.

## When you must stop and think

If, after reading the graph, you cannot answer "what does this system do for whom and why" in one sentence — stop. Re-read the graph. The most likely failure mode is starting to write before you understand. If you write before you understand, you will produce generic-sounding documentation that says nothing.

## References

Load these as needed during a generation:

- `references/diataxis-for-repos.md` — How to apply Diátaxis specifically to code repositories. Read when planning the overall structure.
- `references/writing-principles.md` — Concrete writing rules (word list, sentence patterns, things to avoid). Read when polishing prose.
- `references/templates.md` — Exact templates for overview, service page, integrations page, onboarding. Read when starting each section.
- `references/diagrams.md` — When to use which Mermaid diagram, how to caption, C4 mapping. Read when adding diagrams.
- `references/examples.md` — Before/after pairs of bad vs good documentation. Read when output feels generic.
- `references/repomap-integration.md` — How to integrate this skill into the repomap pipeline (prompt construction, schema, claude -p invocation). Read for pipeline integration questions.
