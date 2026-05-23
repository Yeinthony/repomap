# Diátaxis applied to code repositories

Diátaxis is the documentation framework that Django, Cloudflare, Gatsby, GitLab, and many others have adopted. It identifies four fundamentally distinct types of documentation, each serving a different reader need.

## The four modes

```
                    Practical                Theoretical
                  ┌─────────────────────┬──────────────────────┐
   Study /        │                     │                      │
   acquisition    │     TUTORIALS       │     EXPLANATION      │
                  │   (learning-oriented)│  (understanding-     │
                  │                     │      oriented)       │
                  ├─────────────────────┼──────────────────────┤
   Work /         │                     │                      │
   application    │    HOW-TO GUIDES    │      REFERENCE       │
                  │   (goal-oriented)   │  (information-       │
                  │                     │      oriented)       │
                  └─────────────────────┴──────────────────────┘
```

The mistake almost every codebase makes: mixing modes on the same page. A README that starts with "what this is", then jumps to "how to install", then drops a reference table, then explains the architecture — that is four documents jammed into one. The reader's brain switches gears with every paragraph.

**Rule of thumb**: every page (or major section) is *primarily* one mode. Other modes are present only as clearly-signposted asides.

## Tutorial mode: learning by doing

**For repomap, this maps to**: the onboarding guide, and the "first 30 minutes" section of the overview.

A tutorial is a lesson. The reader has no prior knowledge of the system. They will follow your instructions step by step, and they trust you not to waste their time. Your job is to give them a meaningful, successful first experience.

### Tutorial rules

- **The reader does something concrete and visible**. Not "now understand the architecture" — that is not doing. Instead: "run `docker-compose up`, then open `http://localhost:8080`, and you should see the login page".
- **Every step is necessary and sufficient**. No optional detours. No "you could also...". Save those for how-tos.
- **Each step produces a visible result**. The reader knows they are on the right track because they see something happen.
- **Errors are anticipated, not handled**. Do not write "if you see error X, do Y" inline. Either prevent the error, or move it to a troubleshooting how-to.
- **Theory is minimized**. The tutorial is not the place to explain *why*. It is the place to give the reader a successful first encounter with the system, after which they have the context to read the explanations.

### Tutorial template for a repo onboarding guide

```markdown
# Your first hour with [system name]

By the end of this guide you will have [concrete outcome, e.g., "the full stack running locally,
have made one successful API request, and have made and seen a code change you wrote yourself"].

## What you need before you start

- [Specific prerequisites, with versions]
- [Access requirements: which credentials, which repos]
- [Roughly N minutes of focused time]

## Step 1: Get the code running

[Exact commands, in order. No alternatives, no "you could also". Pick the one path that works
for 90% of new joiners.]

After this step, you should see [specific visible result].

## Step 2: Make a request that exercises the system

[A specific request. Not "explore the API" — a specific curl or click.]

After this step, you should see [specific visible result].

## Step 3: Make a change

[A small, safe, real change that the reader will make and see deployed locally. This step is
what turns the reader from a passive observer into a participant.]

After this step, you should see [specific visible result, ideally something they changed].

## What you just learned

[3–5 bullets, each one a concept they now have experience with. NOT a list of features —
a list of mental models they now own.]

## Where to go next

- "I want to understand why the system is split this way" → link to Explanation
- "I want to add a new endpoint" → link to How-to
- "I need to look up an environment variable" → link to Reference
```

## How-to mode: solving a specific problem

**For repomap, this maps to**: "common tasks" sections inside service pages.

A how-to assumes the reader already has some context. They have a goal in mind. They want to know the steps. Do not re-explain the system from scratch.

### How-to rules

- **The title is the goal**. "How to add a new endpoint to the orders service." Not "Endpoints" — that is a reference page heading.
- **Assumes prior knowledge**. "First, locate the route registration in `routes.py`" is fine. You do not need to explain what a route is.
- **Numbered steps, each a concrete action**.
- **Address realistic situations, including variations**. Unlike tutorials, how-tos *should* acknowledge alternatives: "If your endpoint accepts JSON, use `request.json`; if it accepts form data, use `request.form`."
- **End with verification**. How does the reader know they succeeded?

### How-to template

```markdown
## How to [specific goal in plain language]

Before you start, make sure you have [prerequisites — keep this short, link out for deep prereqs].

1. [Action]
2. [Action]
3. [Action]

You will know it worked when [specific verification]. If it did not work, [link to relevant
troubleshooting or common pitfall].
```

## Reference mode: facts to look up

**For repomap, this maps to**: endpoint specs, env var lists, the cross-service call graph, configuration tables.

Reference is what the reader consults *while* working, not before. They know what they are looking for and they want to find it fast. Reference is the most thankless mode — when done well, the reader does not notice; when done badly, the reader curses your name.

### Reference rules

- **Factual, neutral tone**. No "this useful function..." — the reader will decide what is useful.
- **Consistent structure**. Every endpoint documented the same way. Every env var documented the same way. The reader's eye should know where to look on the page.
- **Complete**. If an endpoint accepts five parameters, list all five — not "the most common ones".
- **No narrative**. Reference is a map, not a story.
- **Searchable**. Use the exact terminology that exists in the code. If the env var is `DB_POOL_SIZE`, the heading is `DB_POOL_SIZE`, not "database pool sizing".

### Reference template for an endpoint

```markdown
### POST /orders

Creates a new order.

**Authentication**: required (Bearer token)

**Request body**:

| Field       | Type    | Required | Description                                         |
|-------------|---------|----------|-----------------------------------------------------|
| user_id     | string  | yes      | UUID of the user placing the order.                 |
| items       | array   | yes      | Items in the order. Maximum 50.                     |
| items[].sku | string  | yes      | Product SKU.                                        |
| items[].qty | integer | yes      | Quantity. Must be ≥1.                               |

**Returns**: `201 Created` with the order object, or `400` if validation fails.

**Side effects**: emits `order.created` event.
```

### Reference template for an env var

```markdown
### DB_POOL_SIZE

Maximum number of database connections in the pool.

- **Type**: integer
- **Default**: 10
- **Used by**: `orders`, `inventory`, `auth`
- **Set in**: `.env`, `docker-compose.yml`
```

## Explanation mode: understanding the why

**For repomap, this maps to**: the overview, the "why this exists" sections in service pages, the architectural narrative on integrations.

Explanation is the mode where you allowed yourself to be conversational, to give context, to acknowledge tradeoffs and history. It is the mode that turns documentation from a manual into a guide.

### Explanation rules

- **Answer "why" questions**. Why is this split into services? Why does this service own this data? Why did we choose this technology?
- **Acknowledge tradeoffs**. "This means X is fast but Y is slower." Honesty earns trust.
- **Give context and background**. "Historically the system was a monolith. The first service to be extracted was `auth`, because..."
- **Make connections explicit**. "Notice that this is the same pattern we use in the `notifications` service — both follow the outbox pattern."
- **Discursive is allowed**. Explanation is the only mode where you can be slightly philosophical. Use it sparingly.

### Explanation template for an architectural decision

```markdown
## Why [decision]

[The decision in one sentence.]

[The problem this solves: 1–2 sentences.]

[What we tried before or considered: 1–2 sentences. Acknowledge tradeoffs.]

[The implication for someone working on the system today: 1–2 sentences.]
```

## Mapping repomap output to Diátaxis

The JSON schema your pipeline produces should be filled in with mode awareness:

| Schema field          | Diátaxis mode(s)                          | Voice                             |
|-----------------------|-------------------------------------------|-----------------------------------|
| `overview`            | Explanation (primary) + brief Tutorial hint | Conversational, contextual        |
| `services[].purpose`  | Explanation                               | "X exists because..."             |
| `services[].responsibilities` | Reference                          | Neutral list                      |
| `services[].endpoints`| Reference                                 | Strictly factual                  |
| `services[].env_vars` | Reference                                 | Table form                        |
| `services[].common_tasks` | How-to                                | Imperative, numbered              |
| `integrations`        | Explanation (flows) + Reference (call graph) | Flows narrative, then call table |
| `onboarding`          | Tutorial                                  | "Let's walk through..."           |
| `diagrams[]` captions | Explanation                               | "Notice that..."                  |

## The single most common Diátaxis violation in AI-generated docs

A service page that opens with: "The `orders` service is responsible for handling orders. It exposes the following endpoints: [list]. It uses the following env vars: [list]. It depends on [list]."

This is a Reference page wearing the costume of an Explanation. The reader gets no "why", no context, no mental model — just facts. Reference pages are valuable, but the *first* thing the reader of a service page needs is one paragraph of Explanation: what this service is for, why it exists, what would break if it disappeared. Then drop into Reference. Then a small How-to section. Mode-aware structure.
