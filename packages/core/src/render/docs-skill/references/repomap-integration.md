# Integrating this skill into the repomap pipeline

repomap calls Claude programmatically via `claude -p --output-format json`, passing a compacted graph and a JSON schema. This file is the contract between the skill and the pipeline: how to wire the skill in, what the prompt should look like, what the schema should produce.

## Two integration modes

You have a choice. Both are valid.

### Mode A: embed the skill body into the system prompt

Best for: a custom pipeline where you do not want to depend on Claude Code's skill-loading machinery.

Read `SKILL.md` and the relevant reference files at build time, concatenate them into a system-prompt string, and pass that to `claude -p` via the `--system-prompt` flag (or however your wrapper handles it).

```bash
SYSTEM_PROMPT=$(cat skill/SKILL.md skill/references/*.md)
claude -p --system-prompt "$SYSTEM_PROMPT" --output-format json < graph_and_request.json > docs.json
```

The advantage: you control exactly what context Claude sees, no surprises.
The disadvantage: every call sends the full skill body in tokens. The references add up.

**Mitigation**: only include the references that are relevant to the call. For example, for the per-service generation pass, include `templates.md`, `writing-principles.md`, and `examples.md` — skip `repomap-integration.md` (which is for you, not for the generator) and `diataxis-for-repos.md` (only relevant when planning structure).

### Mode B: install as a Claude Code skill and trigger by description

Best for: when repomap is invoked from inside Claude Code or via a Claude Code session.

Package the skill folder, install it, and trigger it by making your request use language the skill's `description` field matches. The pipeline then says, e.g., "Generate docs for this repomap graph: [graph]" and the skill auto-triggers, loading only the SKILL.md body initially and pulling references as needed.

The advantage: progressive disclosure — only the SKILL.md body is in context until a reference is actually read.
The disadvantage: requires the Claude Code skill machinery, less control over loading.

For the repomap pipeline as you described it (using `claude -p`), **Mode A is the recommended path**. The rest of this file assumes Mode A.

## Recommended prompt structure

When calling `claude -p`, structure the user message like this:

```
You are generating documentation for a multi-repo system. The system prompt
contains your skill: follow it strictly.

Below is the compacted structural graph of the system. Generate the documentation
JSON matching the schema at the end.

=== GRAPH ===
[paste graphify output here — services, endpoints, calls, env vars, dependencies]

=== REPO METADATA ===
language: [primary]
docs_language: [es | en]
audience: [internal | external | both]
[any other hints: README excerpt, package.json description, etc.]

=== SCHEMA ===
[paste the JSON schema you expect Claude to fill]

=== OUTPUT ===
Generate the JSON now. Do not include any text before or after the JSON.
```

The skill, loaded as system prompt, tells Claude *how* to write. The user message tells Claude *what* to write *about*.

## Schema recommendations

The schema you embed in the prompt should match the HTML templates repomap renders. Here is a recommended shape, with notes on how the skill maps to each field.

```json
{
  "language": "es | en",
  "overview": {
    "headline": "string (one-sentence what-it-does)",
    "narrative": "string (300-700 words, Explanation mode)",
    "system_at_a_glance_diagram": "string (Mermaid)",
    "system_at_a_glance_caption": "string (what to notice)",
    "main_flow_narrative": "string (one canonical flow in prose)",
    "next_steps": [
      {"intent": "string", "link": "string"}
    ]
  },
  "services": [
    {
      "name": "string (matches code identifier, in code font when rendered)",
      "one_liner": "string (one sentence: what for the system)",
      "why_it_exists": "string (2-4 sentences, Explanation)",
      "responsibilities": ["string (verb phrase)"],
      "what_it_does_not_do": ["string"],
      "endpoints": [
        {
          "method": "string",
          "path": "string",
          "summary": "string (one sentence)",
          "auth": "string",
          "request_fields": [
            {"name": "string", "type": "string", "required": "boolean", "description": "string"}
          ],
          "returns": "string",
          "side_effects": "string (optional)"
        }
      ],
      "env_vars": [
        {"name": "string", "required": "boolean", "default": "string|null", "description": "string"}
      ],
      "calls": [
        {"target": "string (service name)", "kind": "http|event|db", "purpose": "string"}
      ],
      "consumes_events": [{"event": "string", "purpose": "string"}],
      "produces_events": [{"event": "string", "purpose": "string"}],
      "common_tasks": [
        {"goal": "string", "steps": ["string"], "verification": "string"}
      ],
      "diagram": "string (Mermaid, optional)",
      "diagram_caption": "string (optional, required if diagram present)"
    }
  ],
  "integrations": {
    "style_intro": "string (one paragraph: integration style)",
    "call_graph_diagram": "string (Mermaid)",
    "call_graph_caption": "string",
    "flows": [
      {
        "name": "string (e.g., 'A user places an order')",
        "diagram": "string (Mermaid sequence)",
        "narrative": "string",
        "what_to_notice": ["string"]
      }
    ],
    "failure_modes": [
      {"service": "string", "consequence": "string"}
    ]
  },
  "onboarding": {
    "outcome": "string (what the reader will have done by the end)",
    "prerequisites": ["string"],
    "steps": [
      {
        "title": "string",
        "actions": ["string"],
        "verification": "string"
      }
    ],
    "what_you_learned": ["string"],
    "where_to_go_next": [
      {"intent": "string", "link": "string"}
    ]
  }
}
```

### How the skill enforces each field

- `overview.headline`: enforced by the "Example 4: the overview opener" rule in `examples.md`. Must be what-it-does-for-whom, not "this codebase implements".
- `overview.narrative`: enforced by the overview template + the "explain why before what" principle.
- `services[].why_it_exists`: enforced by the "Example 1" rule. Must not be tautological.
- `services[].what_it_does_not_do`: instructed in `templates.md`. Optional in the schema; the skill encourages filling it.
- `services[].endpoints`: pure Reference, enforced by `diataxis-for-repos.md` + `writing-principles.md` table format.
- `services[].common_tasks`: How-to mode, enforced by `templates.md` how-to template.
- `integrations.flows`: enforced by "Example 2: an integration description" — must be flow narrative, not call list.
- `onboarding.steps`: Tutorial mode, enforced by the tutorial rules.

## Two-pass generation (recommended)

For large monorepos or multi-repo systems, do not generate everything in one Claude call. Two passes gives you better results and lower per-call token pressure.

### Pass 1: planning

Goal: have Claude build the mental model of the system and decide structure.

Prompt:

```
Given the graph below, do two things and ONLY two things:

1. Write a one-paragraph summary of what this system does, for whom, and what its key
   constraint is. This is your working hypothesis.

2. Propose the documentation structure: an ordered list of pages, each with a one-line
   purpose. Include the overview, one page per service (or merged where two services are
   logically one feature), an integrations page, and an onboarding page if the audience
   includes internal devs.

Output JSON with two fields: "system_hypothesis" and "doc_outline".
```

Cost: small. Token use: low. This pass is cheap because the output is short.

### Pass 2: full generation

Goal: fill the full schema.

Prompt:

```
[Pass 1's system_hypothesis and doc_outline included as context]

Now generate the full documentation JSON matching this schema: [schema]

Use the hypothesis and outline from above to keep the writing consistent across sections.
```

Cost: larger, but the structure is now locked in and Claude is less likely to wander.

## Quality gates on the output

Before sending the JSON to the HTML renderer, run programmatic checks. The skill specifies behaviors; these gates verify Claude actually followed them.

Suggested checks (in your renderer or a CI step):

```python
def quality_gate(docs: dict) -> list[str]:
    issues = []
    # Headline rule
    headline = docs["overview"]["headline"].lower()
    forbidden_openers = ["this codebase", "this repository", "this project implements"]
    if any(headline.startswith(p) for p in forbidden_openers):
        issues.append("overview.headline starts with a forbidden generic opener")

    # Banned words
    banned = ["robust", "seamless", "powerful", "leverages", "state-of-the-art",
              "best practices", "modern", "feel free to", "simply", "easily"]
    full_text = json.dumps(docs).lower()
    for word in banned:
        if word in full_text:
            issues.append(f"banned word found: {word!r}")

    # Each service has a why_it_exists
    for svc in docs["services"]:
        if not svc.get("why_it_exists") or len(svc["why_it_exists"]) < 50:
            issues.append(f"service {svc['name']!r} missing or thin why_it_exists")

    # Every diagram has a caption
    for svc in docs["services"]:
        if svc.get("diagram") and not svc.get("diagram_caption"):
            issues.append(f"service {svc['name']!r} has diagram without caption")
    if docs["overview"].get("system_at_a_glance_diagram") and \
       not docs["overview"].get("system_at_a_glance_caption"):
        issues.append("overview diagram has no caption")
    if docs["integrations"].get("call_graph_diagram") and \
       not docs["integrations"].get("call_graph_caption"):
        issues.append("integrations call graph has no caption")

    # Integrations flows must have what_to_notice
    for flow in docs["integrations"].get("flows", []):
        if not flow.get("what_to_notice"):
            issues.append(f"flow {flow['name']!r} missing what_to_notice")

    return issues
```

If `quality_gate()` returns any issues, you have two options:
1. **Re-prompt Claude with the issues** as feedback ("the following issues were found, fix them and return the corrected JSON").
2. **Fail the build** in strict mode and let the user know.

The first option is more user-friendly. The second is more reliable in CI.

## Cost and token notes

Based on your description (~5-15K tokens of graph, $0.05-0.30 per call):

- The skill body (SKILL.md + references) adds ~6-10K tokens to the system prompt.
- For a one-pass generation, this puts the input around 15-25K tokens.
- Output (the full JSON for a medium project) is typically 5-12K tokens.
- Total per call: 20-35K tokens, well within the cost band you mentioned.

If you want to trim:

- For the **planning pass**, include only `SKILL.md` and `diataxis-for-repos.md`. The skill body is enough to set the voice; the templates are not needed yet.
- For the **generation pass**, include `SKILL.md`, `templates.md`, `writing-principles.md`, and `examples.md`. Skip `diataxis-for-repos.md` (already absorbed in pass 1) and `repomap-integration.md` (for you, not the generator).
- For very large projects, generate per service in parallel with only that service's slice of the graph + the global overview as context.

## Internationalization

You support ES/EN. Two approaches:

1. **Generate in both at once**: have Claude output `overview.narrative_es` and `overview.narrative_en` fields. Higher cost, but consistent terminology.
2. **Generate in one, translate the other**: cheaper, but translation introduces its own errors and the docs feel different in tone.

Recommendation: generate in the user's chosen `docs_language`. If they want both, generate twice with different language hints. The skill's voice rules apply equally to Spanish — "robust", "seamless" etc. have equivalent forbidden Spanish words ("robusto", "potente", "sin fisuras", "aprovecha") that you should add to the banned list when generating in Spanish.

## Iteration: improving the skill over time

When you ship repomap and start getting real generated docs back, you will see failure patterns the skill does not yet address. Treat the skill as living: every recurring complaint becomes a new entry in `examples.md` (bad/good pair) or a new banned word in `writing-principles.md`.

The skill is, in effect, a prompt — and prompts get better with iteration on real examples.
