# Examples: bad vs good

Real examples of common documentation failures and their fixes. Use these as calibration when your output feels generic.

## Example 1: the service-page opener

### Bad (Reference disguised as Explanation)

> The `auth` service is a Python-based microservice that provides authentication functionality. It exposes REST endpoints, uses JWT tokens, and connects to PostgreSQL. It is a critical component of the system and handles user login, token validation, and password resets.

**What's wrong:**
- "Python-based microservice" — the reader can see the language from the file extension. Filler.
- "provides authentication functionality" — tautology, restates the name.
- "exposes REST endpoints, uses JWT tokens" — Reference material in the wrong place.
- "critical component of the system" — marketing language, says nothing.
- "handles X, Y, Z" — list of features without context.

### Good (Explanation that earns the reader's time)

> `auth` issues and validates access tokens for every internal service. It was the first piece we extracted from the original monolith, in 2023, after a token-format inconsistency caused a security incident — having a single source of truth for what a valid token looks like was worth the operational cost of running it as a separate service. Today, if `auth` is down, the system accepts no new requests; existing sessions continue to work until their tokens expire.

**What's better:**
- Opens with what it does for the system (issues and validates tokens).
- Includes the *why* (centralizing token logic, post-incident).
- Acknowledges a tradeoff (hard dependency for new requests).
- Sets up future Reference and How-to sections without doing their job.

## Example 2: an integration description

### Bad (call list)

> The orders service calls inventory at `POST /inventory/check`, then writes to its database, then publishes an event. The payments service consumes the event and calls Stripe at `https://api.stripe.com/v1/charges`. The notifications service also consumes the event and sends an email via SendGrid.

**What's wrong:**
- Reads like a transcript of a method trace.
- No sense of *what* is happening from the user's perspective.
- No mention of which steps the user waits for.
- The reader gets all the facts and none of the story.

### Good (flow narrative)

> When a user places an order, the web app posts to `orders`, which validates inventory by calling `inventory` synchronously — the user is waiting on a response, so we cannot be lazy here. Once inventory is confirmed and the order is created, the user gets their confirmation, and everything downstream happens in the background: `payments` charges the card via Stripe, and `notifications` sends a confirmation email. Both react to the same `order.created` event and do not know about each other.

**What's better:**
- Narrated from the user's perspective ("when a user places an order").
- Distinguishes synchronous (user-blocking) from asynchronous (background) work.
- Surfaces the design principle (services don't know about each other).
- The Mermaid sequence diagram that follows is now an aid to a story, not a replacement for it.

## Example 3: a how-to step

### Bad (vague)

> 1. Modify the configuration.
> 2. Update the dependencies as needed.
> 3. Restart the service.
> 4. Verify it works.

**What's wrong:**
- Every step is so generic it could apply to any software, any service, any change.
- The reader cannot follow it without already knowing the answer.

### Good (specific)

> 1. Add the new env var to `services/auth/.env.example` so other developers know it exists.
> 2. Add it to `docker-compose.yml` under the `auth` service.
> 3. Reference it in `src/config.py`: `MY_VAR = os.environ["MY_VAR"]`.
> 4. Restart the auth container: `docker-compose restart auth`.
> 5. Confirm with `docker-compose exec auth env | grep MY_VAR`.

**What's better:**
- Each step names a specific file, command, or expected output.
- The reader can follow the steps without having to guess what you meant.

## Example 4: the overview opener

### Bad ("this codebase implements")

> This codebase implements a microservices-based order processing system built with modern technologies including Python, Node.js, PostgreSQL, and Redis. It leverages event-driven architecture for scalability and provides a robust foundation for e-commerce operations.

**What's wrong:**
- "This codebase implements" — a frame the reader doesn't care about. They want to know what the system *does*, not what the codebase "implements".
- "microservices-based" — already assumes the reader cares about the architectural style first. They care about what it does first.
- "modern technologies" — marketing words.
- "leverages" — see word list. Use "uses".
- "robust foundation" — meaningless.

### Good

> This system processes orders for [Company]'s online store. From the moment a customer clicks "Buy" to the moment they get their shipping confirmation email, every step — inventory check, payment, fulfillment, notification — flows through the services documented here. It serves about 50,000 orders a day and is built to keep accepting orders even when individual services are down.

**What's better:**
- Opens with what it does for whom (processes orders for a specific company).
- Walks the reader through the lifecycle of one order — a concrete example.
- Gives a sense of scale (50k orders/day) and a key design principle (resilience).
- Sets up curiosity for the rest of the docs ("how does that resilience work?").

## Example 5: documenting a service with no obvious purpose

Sometimes the graph shows a service whose purpose is not clear from its code structure alone. AI-generated docs almost always fail here, either by inventing a rationale or by writing a content-free placeholder.

### Bad (invented rationale)

> The `cache-warmer` service exists to optimize performance by preloading frequently-accessed data into the cache, ensuring fast response times and improved user experience.

**Why this is bad:** the graph cannot tell you this is the actual purpose. Maybe it was a one-off experiment that became permanent. Maybe it warms a specific cache for a specific query. Inventing a generic-sounding rationale is worse than admitting uncertainty, because it teaches the reader something that may be false.

### Good (honest)

> `cache-warmer` runs on a schedule and populates the Redis cache with the results of three specific queries (defined in `src/queries.py`). The graph does not reveal *why* these specific queries are pre-warmed — likely because they are slow and called on the hot path of the main UI, but check with the platform team before assuming.

**Why this is better:** the reader knows what the service does (factually) and is given a hypothesis for the why with an explicit hedge. They are not misled.

## Example 6: a wall of bullets

### Bad (a wall of bullets describing each method)

> The `OrderService` class provides the following methods:
> - `create_order(user_id, items)`: Creates a new order
> - `get_order(order_id)`: Retrieves an order by ID
> - `update_order_status(order_id, status)`: Updates the status of an order
> - `cancel_order(order_id)`: Cancels an order
> - `list_orders(user_id)`: Lists all orders for a user
> - `process_payment(order_id)`: Processes payment for an order

**Why this is bad:** the reader gets a flat list of method names with descriptions that restate the names. They have no idea which methods are part of the public contract, which are common to call, which are dangerous, or which are deprecated. The list is alphabetically organized in the worst way: by the order they appeared in the source file.

### Good (prose + selective Reference)

> Most code interacts with `OrderService` through three methods: `create_order`, `get_order`, and `list_orders`. The rest (`update_order_status`, `cancel_order`, `process_payment`) are typically driven by events from the bus rather than called directly — if you find yourself calling them from a request handler, you are probably bypassing a flow that exists for a reason.

> For the full method signatures, see [the auto-generated API reference](...).

**Why this is better:** the reader learns *which* methods matter for their common case, and is warned about a class of mistakes. The full reference is one link away for when they need it.

## Example 7: the architectural "what" without the "why"

### Bad

> The system uses event-driven architecture with a Redis-backed event bus. Services publish events when state changes, and other services subscribe to these events.

**Why this is bad:** describes the mechanism with no rationale. The reader knows that *we did this* but not *why we chose this over the alternatives*.

### Good

> The system uses an event bus (Redis Streams) for any cross-service notification where the caller does not need a response. We chose this over direct HTTP calls for two reasons. First, it lets services react independently: when an order is placed, `notifications` and `analytics` both react to the same event without `orders` having to know either of them exists. Second, it gives us a buffer when downstream services are slow or down — events accumulate in the stream and are processed when the consumer recovers, instead of blocking the producer.
>
> The tradeoff is debugging: a problem in `notifications` does not surface as a failed call from `orders`, but as a delay or absence of an email. The standard tool for tracing these is [tool name], which correlates events by their order ID.

**Why this is better:** rationale, tradeoff, and a debugging note. The reader now has the context to make decisions, not just facts to memorize.

## The pattern across all examples

Every "bad" example sits at the level of *what the code is*. Every "good" example sits at the level of *what the code means to the reader*. This is the single most important shift in writing good documentation. When your output feels generic, the diagnosis is almost always: "I am describing the code instead of explaining it to a reader."
