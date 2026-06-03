import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import type { APIEndpoint } from '../types.js'
import { extractSpringPropertyEnvVars } from './service-urls.js'

// Glob pattern that filters code extensions at the filesystem-walk level.
// Pushing the filter into fast-glob avoids enumerating assets / binaries /
// configs we'd immediately discard, which is the dominant cost on large repos.
const CODE_GLOB = '**/*.{ts,tsx,js,jsx,py,go,rb,java}'
const IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/target/**',           // Maven output
  '**/src/test/**',         // Java/Gradle/Maven test sources — tests aren't part of the documented runtime
]

/**
 * Detect HTTP endpoints (Express/Fastify/NestJS, Flask, FastAPI) and
 * event publishers (.emit/.publish/.send) inside a repo.
 */
export async function detectEndpoints(repoPath: string): Promise<APIEndpoint[]> {
  const files = await fg(CODE_GLOB, {
    cwd: repoPath,
    ignore: IGNORE,
    onlyFiles: true,
    absolute: true,
  })

  const endpoints: APIEndpoint[] = []

  // Lazy Spring property → env var map. Parsed once per repo, only when
  // a Java file is encountered. Empty for repos without application*.yml.
  let springEnvVarsCache: Map<string, string> | null = null
  const getSpringEnvVars = (): Map<string, string> => {
    if (springEnvVarsCache === null) springEnvVarsCache = extractSpringPropertyEnvVars(repoPath)
    return springEnvVarsCache
  }

  for (const file of files) {
    let content: string
    try {
      content = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    const relFile = path.relative(repoPath, file)

    // ── Express / Fastify / generic router .get/.post/.put/.patch/.delete ──
    const expressPattern = /\b(?:app|router|server|fastify)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi
    let m: RegExpExecArray | null
    while ((m = expressPattern.exec(content)) !== null) {
      endpoints.push({
        method: m[1].toUpperCase(),
        path: m[2],
        type: 'http',
        sourceFile: relFile,
      })
    }

    // ── NestJS decorators ──
    const nestPattern = /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?([^'"`)]*?)['"`]?\s*\)/g
    while ((m = nestPattern.exec(content)) !== null) {
      endpoints.push({
        method: m[1].toUpperCase(),
        path: m[2] || '/',
        type: 'http',
        sourceFile: relFile,
      })
    }

    // ── Flask / FastAPI ──
    const pyHttpPattern = /@(?:app|router)\.(get|post|put|patch|delete|route)\s*\(\s*['"`]([^'"`]+)['"`]/gi
    while ((m = pyHttpPattern.exec(content)) !== null) {
      endpoints.push({
        method: m[1].toUpperCase(),
        path: m[2],
        type: 'http',
        sourceFile: relFile,
      })
    }

    // ── Event publishers ──
    // The verb (emit/publish/send) implies direction = 'publish'. Note this
    // is a broad match — it also catches Java `kafkaTemplate.send("topic",…)`
    // and `jmsTemplate.send("dest",…)`. Java-specific patterns below add
    // the same event (deduped) plus richer cases the generic regex can't see.
    const evPattern = /\.\s*(emit|publish|send)\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((m = evPattern.exec(content)) !== null) {
      endpoints.push({
        eventName: m[2],
        type: 'event',
        direction: 'publish',
        sourceFile: relFile,
      })
    }

    // ── Spring (Spring Boot / Spring MVC) — .java only ────────────────────
    // Spring annotations are unambiguous (@GetMapping etc. don't appear in
    // other languages we scan), but gating on .java keeps the regex loop
    // cheap and avoids any future false positives.
    if (path.extname(file) === '.java') {
      const classBase = extractSpringClassBasePath(content)

      // 1. Shortcut annotations: @GetMapping("/x") / @PostMapping(value = "/x")
      const springShortcut = /@(Get|Post|Put|Patch|Delete)Mapping\s*\(\s*([\s\S]*?)\)/g
      while ((m = springShortcut.exec(content)) !== null) {
        const httpMethod = m[1].toUpperCase()
        const subPath = extractSpringPath(m[2])
        if (subPath == null) continue
        endpoints.push({
          method: httpMethod,
          path: joinSpringPaths(classBase, subPath),
          type: 'http',
          sourceFile: relFile,
        })
      }

      // 2. @RequestMapping at method level (class-level was absorbed into
      //    `classBase`; we skip the entry that matches it to avoid dup).
      const springReqMapping = /@RequestMapping\s*\(\s*([\s\S]*?)\)/g
      while ((m = springReqMapping.exec(content)) !== null) {
        const arg = m[1]
        const subPath = extractSpringPath(arg)
        if (subPath == null) continue
        const methods = extractSpringMethods(arg)
        if (methods.length === 0) {
          // No `method=` ⇒ either the class-level annotation (skip) or
          // a method-level catch-all (Spring matches every HTTP verb).
          if (subPath === classBase) continue
          endpoints.push({
            method: 'ALL',
            path: joinSpringPaths(classBase, subPath),
            type: 'http',
            sourceFile: relFile,
          })
          continue
        }
        for (const httpMethod of methods) {
          endpoints.push({
            method: httpMethod,
            path: joinSpringPaths(classBase, subPath),
            type: 'http',
            sourceFile: relFile,
          })
        }
      }

      // ── Events: Google Pub/Sub, Kafka, RabbitMQ, JMS, Spring app events ──
      const springEnvVars = getSpringEnvVars()
      const topicVarMap = buildJavaPropVarMap(content, springEnvVars)

      // Google Cloud Pub/Sub publisher: Publisher.newBuilder(topicVarOrLiteral)
      const pubsubPub = /\bPublisher\s*\.\s*newBuilder\s*\(\s*([^)]+?)\s*\)/g
      while ((m = pubsubPub.exec(content)) !== null) {
        const topic = resolveJavaTopicArg(m[1], topicVarMap)
        if (topic) {
          endpoints.push({
            eventName: topic,
            type: 'event',
            direction: 'publish',
            sourceFile: relFile,
          })
        }
      }

      // Spring Cloud GCP subscriber: @PubSubListener(subscription = "...")
      const pubsubSub = /@PubSubListener\s*\(\s*[^)]*subscription\s*=\s*"([^"]+)"/g
      while ((m = pubsubSub.exec(content)) !== null) {
        endpoints.push({
          eventName: resolveSpringTemplate(m[1], springEnvVars),
          type: 'event',
          direction: 'subscribe',
          sourceFile: relFile,
        })
      }

      // Kafka subscriber: @KafkaListener(topics = "..." | {"a","b"})
      const kafkaSub = /@KafkaListener\s*\(\s*[^)]*topics\s*=\s*(\{[^}]+\}|"[^"]+")/g
      while ((m = kafkaSub.exec(content)) !== null) {
        for (const topic of parseSpringTopicArgs(m[1], springEnvVars)) {
          endpoints.push({
            eventName: topic,
            type: 'event',
            direction: 'subscribe',
            sourceFile: relFile,
          })
        }
      }

      // Rabbit publisher (convertAndSend isn't in the generic verb set, so
      // add it here explicitly with direction):
      const rabbitConvertSend = /\brabbitTemplate\s*\.\s*convertAndSend\s*\(\s*"([^"]+)"/g
      while ((m = rabbitConvertSend.exec(content)) !== null) {
        endpoints.push({
          eventName: m[1],
          type: 'event',
          direction: 'publish',
          sourceFile: relFile,
        })
      }

      // Rabbit subscriber: @RabbitListener(queues = ...)
      const rabbitSub = /@RabbitListener\s*\(\s*[^)]*queues\s*=\s*(\{[^}]+\}|"[^"]+")/g
      while ((m = rabbitSub.exec(content)) !== null) {
        for (const queue of parseSpringTopicArgs(m[1], springEnvVars)) {
          endpoints.push({
            eventName: queue,
            type: 'event',
            direction: 'subscribe',
            sourceFile: relFile,
          })
        }
      }

      // JMS subscriber: @JmsListener(destination = "...")
      const jmsSub = /@JmsListener\s*\(\s*[^)]*destination\s*=\s*"([^"]+)"/g
      while ((m = jmsSub.exec(content)) !== null) {
        endpoints.push({
          eventName: resolveSpringTemplate(m[1], springEnvVars),
          type: 'event',
          direction: 'subscribe',
          sourceFile: relFile,
        })
      }

      // JMS publisher convertAndSend (not in generic verb set):
      const jmsConvertSend = /\bjmsTemplate\s*\.\s*convertAndSend\s*\(\s*"([^"]+)"/g
      while ((m = jmsConvertSend.exec(content)) !== null) {
        endpoints.push({
          eventName: m[1],
          type: 'event',
          direction: 'publish',
          sourceFile: relFile,
        })
      }

      // Spring application events: (publisher|context).publishEvent(new X(…))
      const springEventPub = /\.\s*publishEvent\s*\(\s*new\s+(\w+)\s*\(/g
      while ((m = springEventPub.exec(content)) !== null) {
        endpoints.push({
          eventName: m[1],
          type: 'event',
          direction: 'publish',
          sourceFile: relFile,
        })
      }

      // Spring @EventListener with explicit class arg:
      // @EventListener(SomeEvent.class)  — captures SomeEvent
      const springEventSub = /@EventListener\s*\(\s*(\w+)\s*\.\s*class\s*\)/g
      while ((m = springEventSub.exec(content)) !== null) {
        endpoints.push({
          eventName: m[1],
          type: 'event',
          direction: 'subscribe',
          sourceFile: relFile,
        })
      }
    }
  }

  return dedupe(endpoints)
}

function dedupe(eps: APIEndpoint[]): APIEndpoint[] {
  const seen = new Set<string>()
  const out: APIEndpoint[] = []
  for (const ep of eps) {
    const k = `${ep.type}|${ep.method ?? ''}|${ep.path ?? ''}|${ep.eventName ?? ''}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(ep)
    }
  }
  return out
}

// ── Spring helpers ────────────────────────────────────────────────────────────

/** Detect a class-level @RequestMapping(...) base path, if any.
 *  Returns '' when there isn't one. Heuristic: the last @RequestMapping in
 *  the source BEFORE the first `class Foo` declaration whose closing paren
 *  is not separated from the class by a brace/semicolon (i.e. it's still
 *  inside the class annotation block). */
function extractSpringClassBasePath(content: string): string {
  const classMatch = content.match(/\bclass\s+\w+/)
  if (!classMatch || classMatch.index == null) return ''
  const before = content.slice(0, classMatch.index)
  const all = [...before.matchAll(/@RequestMapping\s*\(\s*([\s\S]*?)\)/g)]
  for (let i = all.length - 1; i >= 0; i--) {
    const ann = all[i]
    if (ann.index == null) continue
    const between = before.slice(ann.index + ann[0].length)
    if (/[{};]/.test(between)) continue
    return extractSpringPath(ann[1]) ?? ''
  }
  return ''
}

/** Extract the path from inside a Spring mapping annotation's argument list.
 *  Handles positional (`"/x"`), named `value = "/x"` and named `path = "/x"`. */
function extractSpringPath(arg: string): string | null {
  const positional = arg.match(/^\s*["']([^"']+)["']/)
  if (positional) return positional[1]
  const named = arg.match(/(?:value|path)\s*=\s*["']([^"']+)["']/)
  if (named) return named[1]
  return null
}

/** Extract HTTP methods declared in `method = RequestMethod.X` (single)
 *  or `method = {RequestMethod.X, RequestMethod.Y}` (multiple). */
function extractSpringMethods(arg: string): string[] {
  const braced = arg.match(/method\s*=\s*\{([^}]+)\}/)
  if (braced) {
    return [...braced[1].matchAll(/RequestMethod\.([A-Z]+)/g)].map((x) => x[1])
  }
  const single = arg.match(/method\s*=\s*RequestMethod\.([A-Z]+)/)
  if (single) return [single[1]]
  return []
}

/** Concatenate a class-level base path with a method-level subpath, ensuring
 *  exactly one slash between them and no trailing slash. */
function joinSpringPaths(base: string, sub: string): string {
  if (!base) return sub
  const a = base.endsWith('/') ? base.slice(0, -1) : base
  const b = sub.startsWith('/') ? sub : '/' + sub
  return a + b
}

// ── Java event helpers ───────────────────────────────────────────────────────

/**
 * Map Java variable names to their topic/destination identifiers by tracing
 * `@Value("${path}") String varName` annotations. Unlike the URL variant in
 * http-calls, this accepts ALL prop paths (not just URL-shaped) so things
 * like `gcp.pubsub-publish-topic` resolve. Returns the env var name when the
 * yml maps that prop path; falls back to the prop path itself otherwise.
 */
function buildJavaPropVarMap(
  content: string,
  springEnvVars: Map<string, string>
): Map<string, string> {
  const map = new Map<string, string>()
  let m: RegExpExecArray | null
  const valueAnnot = /@Value\s*\(\s*"\$\{([^}:]+)(?::[^}]*)?\}"\s*\)\s*(?:(?:private|public|protected|final|static|synchronized|@\w+(?:\([^)]*\))?)\s+)*(?:String|CharSequence)\s+(\w+)/g
  while ((m = valueAnnot.exec(content)) !== null) {
    const propPath = m[1].trim()
    const varName = m[2]
    const envVar = springEnvVars.get(propPath)
    map.set(varName, envVar ?? propPath)
  }
  if (map.size === 0) return map
  // Trace assignments so `this.topic = topicParam` propagates the binding.
  for (let pass = 0; pass < 4; pass++) {
    const before = map.size
    const assignment = /(?:(?:this|[A-Z]\w*)\.)?(\w+)\s*=\s*(?:(?:this|[A-Z]\w*)\.)?(\w+)\s*;/g
    while ((m = assignment.exec(content)) !== null) {
      const lhs = m[1]
      const rhs = m[2]
      if (map.has(rhs) && !map.has(lhs)) map.set(lhs, map.get(rhs) as string)
    }
    if (map.size === before) break
  }
  return map
}

/** Resolve `Publisher.newBuilder(arg)` arg to a topic name. Accepts literal
 *  strings and identifiers (possibly `this.X` / `ClassName.X` qualified). */
function resolveJavaTopicArg(arg: string, varMap: Map<string, string>): string | null {
  const a = arg.trim()
  const lit = a.match(/^"([^"]+)"$/)
  if (lit) return lit[1]
  const ident = a.match(/^(?:(?:this|[A-Z]\w*)\.)?(\w+)$/)
  if (ident) return varMap.get(ident[1]) ?? null
  return null
}

/** Resolve a single `${path}` template (with optional `:default`) against
 *  the Spring env-var map. Plain strings pass through unchanged. */
function resolveSpringTemplate(s: string, springEnvVars: Map<string, string>): string {
  const tpl = s.match(/^\$\{([^}:]+)(?::[^}]*)?\}$/)
  if (!tpl) return s
  const key = tpl[1].trim()
  return springEnvVars.get(key) ?? key
}

/** Parse the `topics = …` / `queues = …` argument of a Spring listener
 *  annotation. Handles both single string and braced multi-value forms,
 *  and resolves `${path}` templates inside each entry. */
function parseSpringTopicArgs(arg: string, springEnvVars: Map<string, string>): string[] {
  let inner = arg.trim()
  if (inner.startsWith('{') && inner.endsWith('}')) inner = inner.slice(1, -1)
  return inner
    .split(',')
    .map((piece) => piece.trim().replace(/^"(.*)"$/, '$1'))
    .filter((s) => s.length > 0)
    .map((s) => resolveSpringTemplate(s, springEnvVars))
}
