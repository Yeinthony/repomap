# repomap-docs-writer

A skill for generating developer documentation at the quality level of Stripe, Django, FastAPI, and Vue.js — built specifically for the repomap pipeline (graphify → graph.json → Claude → docs JSON → HTML).

## What's in here

- **`SKILL.md`** — The main skill. Loaded first; defines voice, principles, the Diátaxis-based structure, and the repomap-specific workflow. Read this end-to-end.
- **`references/diataxis-for-repos.md`** — The four documentation modes (Tutorial, How-to, Reference, Explanation) and how to apply them to code repositories. Read when planning the structure of a generation.
- **`references/writing-principles.md`** — Line-level rules: word list, voice, sentence patterns, the final-pass checklist. Read when polishing prose.
- **`references/templates.md`** — Exact templates for overview, per-service page, integrations page, onboarding. Read when starting each section.
- **`references/diagrams.md`** — When to use which Mermaid diagram, how to caption, C4 mapping. Read when adding diagrams.
- **`references/examples.md`** — Bad vs good pairs with diagnosis. Read when your output feels generic.
- **`references/repomap-integration.md`** — How to wire the skill into the repomap pipeline: prompt structure, schema recommendations, two-pass generation, quality gates. Read for integration questions.

## Quick start (Mode A: embed into system prompt)

```bash
SYSTEM_PROMPT=$(cat SKILL.md references/templates.md references/writing-principles.md references/examples.md)
claude -p --system-prompt "$SYSTEM_PROMPT" --output-format json < graph_and_request.json > docs.json
```

See `references/repomap-integration.md` for the full integration guide, including the recommended two-pass generation and programmatic quality gates.

## The principles in one sentence each

1. **Reader-first**: write what the reader needs, not what the code is.
2. **Why before what**: every section starts with rationale.
3. **Concrete over abstract**: examples beat descriptions.
4. **Happy path prominent**: document what 90% of developers actually do.
5. **Cognitive load is the enemy**: cut every sentence that doesn't earn its place.
6. **Mode-aware (Diátaxis)**: never mix Tutorial / How-to / Reference / Explanation on the same page without signposting.
7. **Captions earn the diagram**: every diagram followed by "what to notice".

## Iteration

This skill is a prompt — it gets better with real examples. When repomap users complain about generated docs, add the failing pattern to `examples.md` as a new bad/good pair, or add the offending word to the banned list in `writing-principles.md`.
