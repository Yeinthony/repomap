import type {
  AIAdapter,
  CodeGraph,
  Documentation,
  OverviewDoc,
  IntegrationDoc,
  ServiceDoc,
  GettingStartedDoc,
  RepomapConfig,
  RepoSummary,
  HttpRelation,
  GraphifyGraph,
} from './types.js'
import { compactForLLM } from './serialize.js'
import { loadDocsSkill } from './render/docs-skill-loader.js'
import { debugDump } from './debug.js'

// ─────────────────────────────────────────────────────────────────────────────
// PARALLEL DOC GENERATION
//
// Splits the monolithic doc generation into focused sub-calls:
//   1. overview + integrations  (one call, run first to warm the prompt cache)
//   2. one call per service     (parallel, after cache is warm)
//   3. getting-started          (parallel with services)
//
// Why first-then-parallel? Anthropic prompt caching writes the cache on the
// first response. If we fired all 6 calls simultaneously, none would hit
// cache. By awaiting call #1, the cached system prompt is available for the
// rest — 90% off on the cached portion.
//
// Each call has a smaller user prompt (per-service slice instead of the full
// workspace graph) and a narrower JSON schema. Net effect:
//   - 2-3x faster wall-clock
//   - Same or better quality (more focused calls)
//   - With Haiku for sub-sections + apiReference opt-in: ~60% cheaper
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateParallelOpts {
  /** Model used for sub-section calls (services, getting-started).
   *  When falsy, falls back to the same model the adapter would use. */
  modelFast?: string
  /** Include symbol-level API reference in each service. Default false. */
  apiReference?: boolean
}

export async function generateDocsParallel(
  adapter: AIAdapter,
  graph: CodeGraph,
  config: RepomapConfig,
  opts: GenerateParallelOpts = {}
): Promise<Documentation> {
  if (!adapter.chat) {
    throw new Error(
      `Adapter does not implement chat() — parallel orchestration unavailable. ` +
      `Set ai.strategy: single in config, or use a parallel-capable adapter.`
    )
  }
  const chat = adapter.chat.bind(adapter)

  const lang = config.language === 'es' ? 'Spanish' : 'English'
  const skill = loadDocsSkill()
  const compactFull = compactForLLM(graph)
  const modelFast = opts.modelFast ?? config.ai.modelFast
  const withApiRef = opts.apiReference ?? config.ai.apiReference ?? false

  // Stable system-prompt prefix — identical across calls so the LLM provider
  // can cache it. Caching adapters (claude) get a 90% discount on subsequent
  // hits within the 5-min TTL.
  const baseSystem = [
    `You are a senior software architect and technical writer.`,
    `Generate world-class documentation for a multi-service system.`,
    `- Write in ${lang}.`,
    `- Output ONLY a single valid JSON object. No markdown fences, no preamble, no commentary.`,
  ].join('\n')

  const skillBlock = skill ? `=== DOCS WRITER PLAYBOOK ===\n${skill.text}\n=== END PLAYBOOK ===` : ''
  const stablePrefix = skillBlock ? `${baseSystem}\n\n${skillBlock}` : baseSystem

  // ── Call 1: overview + integrations (sequential, warms cache) ──────────────
  const overviewSchema = JSON.stringify(OVERVIEW_INTEGRATIONS_SCHEMA, null, 2)
  const overviewSystem = `${stablePrefix}\n\n=== OUTPUT JSON SCHEMA ===\n${overviewSchema}\n=== END SCHEMA ===`
  const overviewUser = `Here is the structural analysis of the system:\n\n${compactFull}\n\nGenerate the overview and integrations sections following the JSON schema. Output only the JSON object.`

  debugDump('parallel-1-overview-system.txt', overviewSystem)
  debugDump('parallel-1-overview-user.txt', overviewUser)

  const overviewRaw = await chat({
    systemPrompt: overviewSystem,
    userPrompt: overviewUser,
  })
  debugDump('parallel-1-overview-response.txt', overviewRaw)

  const { overview, integrations } = parseSection<{ overview: OverviewDoc; integrations: IntegrationDoc }>(
    overviewRaw,
    'overview+integrations'
  )

  // ── Calls 2..N (services) + Call N+1 (getting-started), all in parallel ────
  const serviceSchema = JSON.stringify(buildServiceSchema(withApiRef), null, 2)
  const gettingStartedSchema = JSON.stringify(GETTING_STARTED_SCHEMA, null, 2)

  const servicePromises = graph.repos.map(async (repo) => {
    const slice = sliceGraphForRepo(graph, repo.name)
    const compactSlice = compactForLLM(slice)
    const sys = `${stablePrefix}\n\n=== OUTPUT JSON SCHEMA (single service) ===\n${serviceSchema}\n=== END SCHEMA ===`
    const usr = `You are documenting the service "${repo.name}". Here is the slice of the system graph relevant to it:\n\n${compactSlice}\n\nProduce a single ServiceDoc JSON object for "${repo.name}", following the schema. Output only the JSON object.`

    debugDump(`parallel-2-service-${repo.name}-user.txt`, usr)
    const raw = await chat({ systemPrompt: sys, userPrompt: usr, model: modelFast })
    debugDump(`parallel-2-service-${repo.name}-response.txt`, raw)
    return parseSection<ServiceDoc>(raw, `service:${repo.name}`)
  })

  const gettingStartedPromise: Promise<GettingStartedDoc | null> = (async () => {
    const sys = `${stablePrefix}\n\n=== OUTPUT JSON SCHEMA (getting started) ===\n${gettingStartedSchema}\n=== END SCHEMA ===`
    const usr = `Generate the gettingStarted section for this system. Here is the structural analysis:\n\n${compactFull}\n\nProduce the gettingStarted JSON object following the schema (quickStart, installation, firstProject, troubleshooting). Output only the JSON object.`
    debugDump('parallel-3-getting-started-user.txt', usr)
    const raw = await chat({ systemPrompt: sys, userPrompt: usr, model: modelFast })
    debugDump('parallel-3-getting-started-response.txt', raw)
    try {
      return parseSection<GettingStartedDoc>(raw, 'gettingStarted')
    } catch {
      // Getting-started is the most error-prone section because of nested
      // optional fields. If parsing fails, omit it rather than failing the
      // whole pipeline — overview + services already give the user value.
      return null
    }
  })()

  const [services, gettingStarted] = await Promise.all([
    Promise.all(servicePromises),
    gettingStartedPromise,
  ])

  const docs: Documentation = {
    overview,
    integrations,
    services,
    ...(gettingStarted ? { gettingStarted } : {}),
    generatedAt: new Date().toISOString(),
  }

  debugDump('parallel-final-docs.json', JSON.stringify(docs, null, 2))
  return docs
}

// ── Per-section schemas (sent to the LLM as the OUTPUT contract) ────────────

const OVERVIEW_INTEGRATIONS_SCHEMA = {
  overview: {
    title: 'string',
    summary: '2-3 sentence plain-language summary',
    analogy: 'A real-world analogy explaining the whole system',
    architecture: 'mermaid diagram source (graph TD)',
    keyConceptsFor: ['concept1', 'concept2'],
  },
  integrations: {
    summary: 'how all services work together',
    diagram: 'mermaid sequence diagram of main flow',
    flows: [{ name: 'Main User Flow', description: 'string', steps: ['step1', 'step2'], diagram: 'mermaid' }],
  },
}

function buildServiceSchema(withApiRef: boolean): unknown {
  const base: any = {
    name: 'string',
    purpose: 'one sentence',
    longDescription: 'full explanation, 3-5 paragraphs',
    analogy: 'real-world analogy for this specific service',
    architecture: 'mermaid diagram source',
    endpoints: [{ method: 'GET', path: '/example', description: 'string', requestExample: 'optional', responseExample: 'optional' }],
    events: [{ name: 'string', type: 'publishes|subscribes', description: 'string' }],
    envVars: [{ name: 'string', description: 'string', required: true, example: 'string' }],
    gettingStarted: 'step by step to run locally',
    examples: [{ title: 'string', description: 'string', code: 'string', language: 'string' }],
  }
  if (withApiRef) {
    base.apiReference = {
      intro: '1-2 sentences describing the public API surface',
      sections: [{
        title: 'Functions',
        description: 'optional section description',
        symbols: [{
          name: 'symbolName',
          kind: 'function|class|interface|type|variable|method',
          signature: 'full signature string',
          description: '2-4 sentences: what it does, why, when to use',
          params: [{ name: 'paramName', type: 'TypeName', description: 'string', required: true, default: null }],
          returns: 'what is returned',
          sourceFile: 'relative/path/to/file.ts',
          example: 'short usage snippet',
        }],
      }],
    }
  }
  return base
}

const GETTING_STARTED_SCHEMA = {
  quickStart: {
    title: 'string — short tutorial title',
    summary: '1-2 sentence intro',
    steps: [{ heading: '1. Step title', description: '1-2 paragraphs of prose', code: { language: 'bash', source: 'code', caption: 'optional' }, note: 'optional', noteKind: 'tip|warning|info' }],
  },
  installation: {
    title: 'Installation',
    summary: '1-2 sentences',
    steps: ['same TutorialStep shape'],
  },
  firstProject: {
    title: 'Your first project',
    summary: '1-2 sentences',
    steps: ['same TutorialStep shape, 4-7 steps'],
  },
  troubleshooting: {
    title: 'Troubleshooting',
    summary: '1-2 sentences',
    items: [{ problem: 'error message', cause: 'optional', solution: 'prose with the fix', code: { language: 'bash', source: 'optional' } }],
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSection<T>(raw: string, label: string): T {
  const stripped = stripJsonFences(raw.trim())
  try {
    return JSON.parse(stripped) as T
  } catch (err) {
    throw new Error(`Failed to parse ${label} JSON. First 400 chars:\n${stripped.slice(0, 400)}`)
  }
}

function stripJsonFences(text: string): string {
  const m = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return m ? m[1] : text
}

// Build a smaller CodeGraph containing only the data relevant to one service.
// This is what gets sent in the per-service call's user prompt, dramatically
// shrinking the input vs the full multi-repo graph.
function sliceGraphForRepo(graph: CodeGraph, repoName: string): CodeGraph {
  const repo = graph.repos.find((r) => r.name === repoName)
  const repos: RepoSummary[] = repo ? [repo] : []

  // Include HTTP relations that touch this repo from either side, so the LLM
  // sees who the service talks to and who calls it.
  const httpRelations: HttpRelation[] = graph.httpRelations.filter(
    (r) => r.from === repoName || r.to === repoName
  )

  // Filter graphify nodes/edges to this repo only.
  const graphify: GraphifyGraph = {
    nodes: (graph.graphify.nodes ?? []).filter((n) => !n.repo || n.repo === repoName),
    edges: (graph.graphify.edges ?? []).filter((e) => {
      const src = (graph.graphify.nodes ?? []).find((n) => n.id === e.source)
      const tgt = (graph.graphify.nodes ?? []).find((n) => n.id === e.target)
      return (src?.repo === repoName) || (tgt?.repo === repoName)
    }),
    hyperedges: graph.graphify.hyperedges,
    graph: graph.graphify.graph,
  }

  return {
    repos,
    graphify,
    httpRelations,
    workspace: graph.workspace,
    generatedAt: graph.generatedAt,
  }
}
