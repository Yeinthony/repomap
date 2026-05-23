# Writing principles

These are the concrete, line-level rules. The high-level principles in `SKILL.md` tell you what to write; this file tells you how to write it.

## Voice and grammar

### Person and tense

- **Second person, present tense, active voice**: "You define the schema in `models.py`."
- Avoid "we": it makes it ambiguous whether "we" means the system maintainers, the reader, or both. Use "you" for the reader, name the team explicitly when needed ("the platform team owns this service").
- Avoid "the user" when you mean the reader. "You" is more direct.
- Avoid passive voice. "An event is emitted" → "The service emits an event."

### Tense within procedures

- Steps are imperative: "Run the migration."
- Outcomes use present tense: "The container starts and listens on port 8080."
- Avoid future tense ("you will see") — present is more direct ("you see").

### Conditionals before instructions, not after

Bad: "Run `make deploy` if you are deploying to staging."
Good: "If you are deploying to staging, run `make deploy`."

The reader scans for whether the sentence applies before reading the action.

## Word list

These are the most consequential preferences. Apply them mechanically — they account for a surprising amount of the difference between AI-generated documentation and professionally-edited documentation.

### Words to avoid

| Avoid                         | Use instead                              | Why                                    |
|-------------------------------|------------------------------------------|----------------------------------------|
| robust                        | (cut entirely)                           | Marketing word. Means nothing.         |
| seamless                      | (cut entirely)                           | Same.                                  |
| powerful                      | (cut entirely)                           | Same.                                  |
| leverages                     | uses                                     | Plain words are always better.         |
| utilize                       | use                                      | "Utilize" adds syllables, not meaning. |
| in order to                   | to                                       | Almost always shorter is better.       |
| simply                        | (cut entirely)                           | Patronizing — if it's simple, that's evident. |
| easily                        | (cut entirely)                           | Same.                                  |
| obviously                     | (cut entirely)                           | If it's obvious, no need to say it. If it's not, you're insulting the reader. |
| modern                        | (cut entirely)                           | Either describe what's modern about it, or move on. |
| best practices                | (cut entirely or be specific)            | Vague filler. Say which practices.     |
| state-of-the-art              | (cut entirely)                           | Marketing.                             |
| seamlessly integrates         | works with                               | Plain wins.                            |
| out of the box                | by default                               | Cliché.                                |
| feel free to                  | (cut)                                    | Filler. Just give the instruction.     |
| please note that              | (cut)                                    | Same.                                  |
| it should be noted that       | (cut)                                    | Same.                                  |
| desire                        | want, need                               | "Set the size that you want."          |
| as well as                    | and                                      | Shorter wins.                          |
| in the event that             | if                                       | Same.                                  |
| due to the fact that          | because                                  | Same.                                  |
| at this point in time         | now                                      | Same.                                  |
| a number of                   | several, many, a specific count          | Be specific.                           |
| various                       | (be specific or cut)                     | Vague.                                 |

### Words to use carefully

- **may** vs **might** vs **can**: "can" means capability ("you can configure this"), "may" means permission or possibility ("the service may return a 429"), "might" means uncertainty ("this might fail under high load"). Do not mix them.
- **above** / **below**: avoid for referring to other parts of the document; the reader's layout may not match yours. Use "preceding", "following", or a real link.
- **e.g.** / **i.e.**: use "for example" and "that is". Less ambiguity for non-native readers.
- **etc.**: avoid. Either list everything that matters, or write "and others" with a reason.

### Code in code font, but be principled

- Identifiers from the code: `orders`, `User`, `DB_POOL_SIZE` — always code font.
- File paths: `src/services/auth.py` — always code font.
- Commands: `docker-compose up` — always code font.
- Concepts referred to by their name: when you write "the orders service handles…", the *service* is referred to conceptually — use plain text. When you write "import from `orders`", you mean the literal module — use code font.
- This distinction is real and not pedantic. The reader's eye reads code font as "this is something I will type or see in code".

## Sentence and paragraph structure

### Short, declarative sentences win

The worst sentences in AI-generated documentation are long, compound, contain three clauses, and feel like they are conveying a lot of information when actually they are conveying very little because the structure makes the reader work too hard.

Compare the previous sentence to:

> Long sentences hide information. Cut compound clauses. The reader stops parsing and starts skimming.

The second version says the same thing in 16 words and the reader actually understands it.

### One idea per paragraph

Paragraphs are not arbitrary blocks of text. A paragraph is one thought, developed. If you find yourself starting a new idea mid-paragraph, start a new paragraph. If you find a paragraph saying the same thing twice, cut one.

### Lead with the conclusion

A paragraph that opens with "There are several reasons we chose Redis for caching" is worse than one that opens with "We use Redis for caching because it is in-memory, supports the data structures we need, and the team already operates it." The reader can stop after the first sentence if that is all they need.

### Lists vs prose

- Use a list when the items are parallel and the order does not matter (or matters only as ranking).
- Use prose when there are connecting words ("first... then... finally", "either... or").
- Three items or fewer can often be prose. Five items or more should usually be a list.
- Never use a list as a substitute for a paragraph — bullets do not make weak content stronger.

## Headings

- **Sentence case**, not Title Case: "How services communicate", not "How Services Communicate".
- **Imperative or noun phrase**, not full sentence:
  - Good: "Adding a new service"
  - Good: "Authentication"
  - Bad: "How do I add a new service?" (the question is implied by the heading)
- **Heading depth**: avoid going past `####` (h4). If you need more depth, the page is probably too big.
- **No code in main headings**: avoid `## Using \`MyClass\``. Either rephrase or move to a subheading.

## Links

- Link text should be meaningful out of context. "Read the authentication guide" not "click here".
- When linking to a definition, the linked phrase should be the term being defined: "we use the [outbox pattern](...)" not "we use the outbox pattern (see [here](...))".

## Numbers and units

- Numbers under 10 in prose are usually spelled out ("three services"), but use digits in technical contexts ("3 replicas", "8080").
- Always specify units: "5 seconds" not "5s" in prose. "5s" is fine inside code blocks or tables where compactness matters.
- For ranges, use en-dash with no spaces: "5–10 seconds", "100–200 requests".

## Code examples

### The example must be runnable and minimal

- Runnable: a reader who copies the example into the right context can run it. No `...` placeholders that hide essential parts.
- Minimal: every line of the example is essential. Remove imports the reader does not need, comments that restate the obvious, error handling that is not the point of the example.

### Show input and output

Every non-trivial example should show what goes in and what comes out. The reader does not need to run the code mentally to know what to expect.

```bash
$ curl -X POST http://localhost:8080/orders -d '{"sku": "ABC", "qty": 2}'
{"order_id": "ord_abc123", "status": "pending"}
```

### Comment the *why*, not the *what*

```python
# Bad — restates what the code obviously does
# Set the user's name to "Alice"
user.name = "Alice"

# Good — explains why
# We use the canonical email as the unique key, not the display name,
# because display names can change.
user.email_key = email.lower().strip()
```

## Tone calibration

- **Friendly but not casual**: contractions are fine ("you'll", "it's"). Emoji and exclamation marks are not.
- **Confident but not arrogant**: state things as facts when they are facts. Do not hedge unnecessarily ("you may want to consider potentially using..."). But do not overclaim either.
- **Empathetic to the reader's experience**: if a thing is genuinely tricky, acknowledge it briefly. "This part is the most common source of confusion for new contributors, so we are explicit:" — this kind of sentence builds trust.

## Final pass checklist

Before finalizing a section, run this checklist. Cut on every "yes":

1. Does any sentence restate the heading? (Cut it.)
2. Does any paragraph repeat the previous one with different words? (Cut one.)
3. Does any adjective add no information? ("powerful", "modern", "robust" — cut.)
4. Does any list have only one item? (Convert to prose.)
5. Does any heading have no content beneath it? (Cut the heading or fill it.)
6. Does any sentence have a "simply", "easily", "obviously", or "just"? (Cut the word; it's patronizing.)
7. Does the opening sentence start with "This [thing] is..."? (Rewrite to start with what the thing does for the reader.)
8. Does any diagram lack a caption that says what to see in it? (Add one.)

If you go through this checklist and cut everything you should cut, the documentation will be 20–30% shorter and noticeably better.
