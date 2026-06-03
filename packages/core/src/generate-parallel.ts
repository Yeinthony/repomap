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
  AdapterProgress,
  ProgressCall,
  SkillSection,
  DocSections,
} from './types.js'
import { compactForLLM, type CompactForLLMOpts } from './serialize.js'
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
// Lean mode (config.ai.lean) shrinks every call in three ways:
//   - per-call skill subset (overview gets diataxis+diagrams+writing, not
//     templates/examples; service gets templates+examples+writing; etc.).
//     Each subset can also be loaded from references/_compact/ when present.
//   - compact JSON schema (TS-like instead of pretty-printed JSON).
//   - compactForLLM budget shrinks to ~8K tokens with stricter caps.
//   - per-service slices drop the workspace block (already in overview).
//
// Section skipping (config.ai.sections) removes whole sub-calls entirely.
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateParallelOpts {
  /** Model used for sub-section calls (services, getting-started).
   *  When falsy, falls back to the same model the adapter would use. */
  modelFast?: string
  /** Include symbol-level API reference in each service. Default false. */
  apiReference?: boolean
  /** Receive per-sub-call progress events so a UI can render the parallel
   *  work (e.g. multi-task spinner). Emits one 'plan' upfront then
   *  start/done/failed events per call. */
  onProgress?: (event: AdapterProgress) => void
}

// Per-call skill section presets (used when config.ai.skillSections === 'auto').
const SECTIONS_FOR_OVERVIEW: SkillSection[] = ['diataxis', 'diagrams', 'writing']
const SECTIONS_FOR_SERVICE: SkillSection[] = ['templates', 'examples', 'writing']
const SECTIONS_FOR_GETTING_STARTED: SkillSection[] = ['templates', 'writing']

function resolveSections(
  cfg: RepomapConfig,
  apiReference: boolean
): Required<DocSections> {
  const fromCfg = cfg.ai.sections ?? {}
  // Legacy flat keys promote up if the new ones are unset.
  const apiRefFinal = fromCfg.apiReference ?? apiReference
  return {
    overview: fromCfg.overview ?? true,
    integrations: fromCfg.integrations ?? true,
    services: fromCfg.services ?? true,
    apiReference: apiRefFinal,
    gettingStarted: fromCfg.gettingStarted ?? 'auto',
  }
}

function shouldGenerateGettingStarted(setting: boolean | 'auto', repoCount: number): boolean {
  if (setting === true) return true
  if (setting === false) return false
  // 'auto': include unless the workspace has more than 8 services.
  return repoCount <= 8
}

function sectionsFor(cfg: RepomapConfig, call: 'overview' | 'service' | 'gettingStarted'): SkillSection[] {
  const setting = cfg.ai.skillSections ?? 'auto'
  if (setting === 'full') {
    return ['templates', 'diataxis', 'writing', 'diagrams', 'examples']
  }
  if (Array.isArray(setting)) {
    return setting
  }
  // 'auto'
  if (call === 'overview') return SECTIONS_FOR_OVERVIEW
  if (call === 'service') return SECTIONS_FOR_SERVICE
  return SECTIONS_FOR_GETTING_STARTED
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
  const lean = !!config.ai.lean
  const compactOpts: CompactForLLMOpts = { lean, budget: config.ai.budget }
  const compactFull = compactForLLM(graph, compactOpts)
  const modelFast = opts.modelFast ?? config.ai.modelFast
  const withApiRef = opts.apiReference ?? config.ai.apiReference ?? false
  const onProgress = opts.onProgress ?? (() => {})
  const defaultModelLabel = config.ai.model ?? 'default'
  const fastModelLabel = modelFast ?? defaultModelLabel

  // Resolve which sections to generate (skip entire calls when disabled).
  const sections = resolveSections(config, withApiRef)
  const wantOverviewCall = sections.overview || sections.integrations
  const wantServiceCalls = sections.services
  const wantGettingStarted = shouldGenerateGettingStarted(sections.gettingStarted, graph.repos.length)

  // Build the full plan upfront so UIs can render the task list before any
  // call fires. Order matters in the rendering: sequential first, then parallel.
  const plan: ProgressCall[] = []
  if (wantOverviewCall) {
    plan.push({ id: 'overview', label: 'overview + integrations', model: defaultModelLabel, group: 'sequential' })
  }
  if (wantServiceCalls) {
    plan.push(...graph.repos.map((repo) => ({ id: `service:${repo.name}`, label: repo.name, model: fastModelLabel, group: 'parallel' as const })))
  }
  if (wantGettingStarted) {
    plan.push({ id: 'getting-started', label: 'getting-started', model: fastModelLabel, group: 'parallel' })
  }
  onProgress({ kind: 'plan', calls: plan })

  // Stable system-prompt prefix — identical across calls so the LLM provider
  // can cache it. Caching adapters (claude) get a 90% discount on subsequent
  // hits within the 5-min TTL.
  const baseSystem = [
    `You are a senior software architect and technical writer.`,
    `Generate world-class documentation for a multi-service system.`,
    `- Write in ${lang}.`,
    `- Output ONLY a single valid JSON object. No markdown fences, no preamble, no commentary.`,
  ].join('\n')

  const skillForCall = (call: 'overview' | 'service' | 'gettingStarted'): string => {
    const skill = loadDocsSkill({ sections: sectionsFor(config, call), lean })
    if (!skill) return ''
    return `=== DOCS WRITER PLAYBOOK ===\n${skill.text}\n=== END PLAYBOOK ===`
  }

  // ── Call 1: overview + integrations (sequential, warms cache) ──────────────
  let overview: OverviewDoc | undefined
  let integrations: IntegrationDoc | undefined

  if (wantOverviewCall) {
    const overviewSchema = lean
      ? compactOverviewIntegrationsSchema(sections)
      : JSON.stringify(buildOverviewIntegrationsSchema(sections), null, 2)
    const skillBlock = skillForCall('overview')
    const stablePrefix = skillBlock ? `${baseSystem}\n\n${skillBlock}` : baseSystem
    const overviewSystem = `${stablePrefix}\n\n=== OUTPUT JSON SCHEMA ===\n${overviewSchema}\n=== END SCHEMA ===`
    const overviewUser = `Here is the structural analysis of the system:\n\n${compactFull}\n\nGenerate the ${overviewUserLabel(sections)} following the JSON schema. Output only the JSON object.`

    debugDump('parallel-1-overview-system.txt', overviewSystem)
    debugDump('parallel-1-overview-user.txt', overviewUser)
    debugDump('parallel-1-overview-meta.json', JSON.stringify({
      lean,
      sectionsLoaded: sectionsFor(config, 'overview'),
      schemaChars: overviewSchema.length,
      systemChars: overviewSystem.length,
      userChars: overviewUser.length,
      compactChars: compactFull.length,
    }, null, 2))

    const result = await runCall('overview', 'overview+integrations', onProgress, async () => {
      const raw = await chat({
        systemPrompt: overviewSystem,
        userPrompt: overviewUser,
      })
      debugDump('parallel-1-overview-response.txt', raw)
      return parseSection<{ overview?: OverviewDoc; integrations?: IntegrationDoc }>(raw, 'overview+integrations')
    })
    overview = result.overview
    integrations = result.integrations
  }

  // ── Calls 2..N (services) + Call N+1 (getting-started), all in parallel ────
  const servicePromises = wantServiceCalls
    ? graph.repos.map((repo) =>
        runCall(`service:${repo.name}`, repo.name, onProgress, async () => {
          const slice = sliceGraphForRepo(graph, repo.name, lean)
          const compactSlice = compactForLLM(slice, compactOpts)
          const serviceSchema = lean
            ? compactServiceSchema(sections.apiReference)
            : JSON.stringify(buildServiceSchema(sections.apiReference), null, 2)
          const skillBlock = skillForCall('service')
          const stablePrefix = skillBlock ? `${baseSystem}\n\n${skillBlock}` : baseSystem
          const sys = `${stablePrefix}\n\n=== OUTPUT JSON SCHEMA (single service) ===\n${serviceSchema}\n=== END SCHEMA ===`
          const usr = `You are documenting the service "${repo.name}". Here is the slice of the system graph relevant to it:\n\n${compactSlice}\n\nProduce a single ServiceDoc JSON object for "${repo.name}", following the schema. Output only the JSON object.`
          debugDump(`parallel-2-service-${repo.name}-user.txt`, usr)
          debugDump(`parallel-2-service-${repo.name}-meta.json`, JSON.stringify({
            lean,
            sectionsLoaded: sectionsFor(config, 'service'),
            schemaChars: serviceSchema.length,
            systemChars: sys.length,
            userChars: usr.length,
            sliceChars: compactSlice.length,
          }, null, 2))
          const raw = await chat({ systemPrompt: sys, userPrompt: usr, model: modelFast })
          debugDump(`parallel-2-service-${repo.name}-response.txt`, raw)
          return parseSection<ServiceDoc>(raw, `service:${repo.name}`)
        })
      )
    : []

  // Getting-started is the most error-prone section because of nested optional
  // fields. If parsing fails, omit it rather than failing the whole pipeline.
  const gettingStartedPromise: Promise<GettingStartedDoc | null> | null = wantGettingStarted
    ? runCall(
        'getting-started',
        'getting-started',
        onProgress,
        async () => {
          const gettingStartedSchema = lean
            ? compactGettingStartedSchema()
            : JSON.stringify(GETTING_STARTED_SCHEMA, null, 2)
          const skillBlock = skillForCall('gettingStarted')
          const stablePrefix = skillBlock ? `${baseSystem}\n\n${skillBlock}` : baseSystem
          const sys = `${stablePrefix}\n\n=== OUTPUT JSON SCHEMA (getting started) ===\n${gettingStartedSchema}\n=== END SCHEMA ===`
          const usr = `Generate the gettingStarted section for this system. Here is the structural analysis:\n\n${compactFull}\n\nProduce the gettingStarted JSON object following the schema (quickStart, installation, firstProject, troubleshooting). Output only the JSON object.`
          debugDump('parallel-3-getting-started-user.txt', usr)
          debugDump('parallel-3-getting-started-meta.json', JSON.stringify({
            lean,
            sectionsLoaded: sectionsFor(config, 'gettingStarted'),
            schemaChars: gettingStartedSchema.length,
            systemChars: sys.length,
            userChars: usr.length,
          }, null, 2))
          const raw = await chat({ systemPrompt: sys, userPrompt: usr, model: modelFast })
          debugDump('parallel-3-getting-started-response.txt', raw)
          try {
            return parseSection<GettingStartedDoc>(raw, 'gettingStarted')
          } catch {
            return null
          }
        }
      )
    : null

  const [services, gettingStarted] = await Promise.all([
    Promise.all(servicePromises),
    gettingStartedPromise ?? Promise.resolve(null),
  ])

  // Fill required fields with sensible defaults when their section was skipped
  // so the Documentation contract is still satisfied for downstream renderers.
  const finalOverview: OverviewDoc = overview ?? {
    title: graph.workspace?.rootPackageMeta?.name ?? 'Documentation',
    summary: '',
    architecture: '',
    keyConceptsFor: [],
  }
  const finalIntegrations: IntegrationDoc = integrations ?? {
    summary: '',
    diagram: '',
    flows: [],
  }

  const docs: Documentation = {
    overview: finalOverview,
    integrations: finalIntegrations,
    services,
    ...(gettingStarted ? { gettingStarted } : {}),
    generatedAt: new Date().toISOString(),
  }

  debugDump('parallel-final-docs.json', JSON.stringify(docs, null, 2))
  return docs
}

function overviewUserLabel(sections: Required<DocSections>): string {
  if (sections.overview && sections.integrations) return 'overview and integrations sections'
  if (sections.overview) return 'overview section'
  return 'integrations section'
}

// ── Per-section schemas (sent to the LLM as the OUTPUT contract) ────────────
// Two flavors: full (pretty-printed JSON, legacy) and compact (TS-like, lean).

function buildOverviewIntegrationsSchema(sections: Required<DocSections>): unknown {
  const out: any = {}
  if (sections.overview) {
    out.overview = {
      title: 'string',
      summary: '2-3 sentence plain-language summary',
      analogy: 'A real-world analogy explaining the whole system',
      architecture: 'mermaid diagram source (graph TD)',
      keyConceptsFor: ['concept1', 'concept2'],
    }
  }
  if (sections.integrations) {
    out.integrations = {
      summary: 'how all services work together',
      diagram: 'mermaid sequence diagram of main flow',
      flows: [{ name: 'Main User Flow', description: 'string', steps: ['step1', 'step2'], diagram: 'mermaid' }],
    }
  }
  return out
}

function compactOverviewIntegrationsSchema(sections: Required<DocSections>): string {
  const parts: string[] = []
  if (sections.overview) {
    parts.push(
      `overview: { title: string; summary: string /* 2-3 sentences */; analogy?: string; architecture: string /* mermaid graph TD */; keyConceptsFor: string[] }`
    )
  }
  if (sections.integrations) {
    parts.push(
      `integrations: { summary: string; diagram: string /* mermaid sequence */; flows: Array<{ name: string; description: string; steps: string[]; diagram: string /* mermaid */ }> }`
    )
  }
  return `{\n  ${parts.join(',\n  ')}\n}`
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

function compactServiceSchema(withApiRef: boolean): string {
  const apiRef = withApiRef
    ? `;\n  apiReference: { intro: string; sections: Array<{ title: string; description?: string; symbols: Array<{ name: string; kind: 'function'|'class'|'interface'|'type'|'variable'|'method'; signature: string; description: string; params?: Array<{ name: string; type?: string; description: string; required: boolean; default?: string }>; returns?: string; sourceFile?: string; example?: string }> }> }`
    : `\n// omit apiReference entirely`
  return `// ServiceDoc — produce a single JSON object matching this shape
{
  name: string;
  purpose: string /* one sentence */;
  longDescription: string /* 3-5 paragraphs */;
  analogy?: string;
  architecture: string /* mermaid */;
  endpoints: Array<{ method: string; path: string; description: string; requestExample?: string; responseExample?: string }>;
  events: Array<{ name: string; type: 'publishes' | 'subscribes'; description: string }>;
  envVars: Array<{ name: string; description: string; required: boolean; example?: string }>;
  gettingStarted: string /* step by step to run locally */;
  examples: Array<{ title: string; description: string; code: string; language: string }>${apiRef}
}`
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

function compactGettingStartedSchema(): string {
  return `// GettingStartedDoc — produce a single JSON object matching this shape
type TutorialStep = {
  heading: string;                        // "1. Title"
  description: string;                    // 1-2 paragraphs of prose; \\n\\n for paragraph breaks
  code?: { language: string; source: string; caption?: string };
  note?: string;
  noteKind?: 'tip' | 'warning' | 'info';
};
{
  quickStart: { title: string; summary: string; steps: TutorialStep[] /* 3-5 steps */ };
  installation: { title: string; summary: string; steps: TutorialStep[] };
  firstProject: { title: string; summary: string; steps: TutorialStep[] /* 4-7 steps */ };
  troubleshooting: {
    title: string; summary: string;
    items: Array<{ problem: string; cause?: string; solution: string; code?: { language: string; source: string } }>; /* 5-10 items */
  };
}`
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Wrap an async call so it emits start/done/failed events around its lifetime.
// Re-throws on failure after emitting 'failed', so Promise.all() rejection
// behavior is preserved.
async function runCall<T>(
  id: string,
  label: string,
  onProgress: (e: AdapterProgress) => void,
  fn: () => Promise<T>
): Promise<T> {
  onProgress({ kind: 'start', id })
  const t0 = Date.now()
  try {
    const result = await fn()
    onProgress({ kind: 'done', id, elapsedSec: Math.round((Date.now() - t0) / 1000) })
    return result
  } catch (err: any) {
    onProgress({ kind: 'failed', id, error: err?.message ?? String(err) })
    throw err
  }
}

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
// shrinking the input vs the full multi-repo graph. When `lean` is true the
// workspace block is dropped entirely (the overview call already used it and
// it's not load-bearing for a per-service page).
function sliceGraphForRepo(graph: CodeGraph, repoName: string, lean: boolean): CodeGraph {
  const repo = graph.repos.find((r) => r.name === repoName)
  const repos: RepoSummary[] = repo ? [repo] : []

  // Include HTTP relations that touch this repo from either side, so the LLM
  // sees who the service talks to and who calls it.
  const httpRelations: HttpRelation[] = graph.httpRelations.filter(
    (r) => r.from === repoName || r.to === repoName
  )

  // Filter graphify nodes/edges to this repo only.
  const repoNodeIds = new Set(
    (graph.graphify.nodes ?? []).filter((n) => n.repo === repoName).map((n) => n.id)
  )
  const graphify: GraphifyGraph = {
    nodes: (graph.graphify.nodes ?? []).filter((n) => !n.repo || n.repo === repoName),
    edges: (graph.graphify.edges ?? []).filter(
      (e) => repoNodeIds.has(e.source) || repoNodeIds.has(e.target)
    ),
    hyperedges: graph.graphify.hyperedges,
    graph: graph.graphify.graph,
  }

  const workspace = lean
    ? graph.workspace?.rootPackageMeta?.name
      ? { rootPackageMeta: { name: graph.workspace.rootPackageMeta.name } }
      : undefined
    : graph.workspace

  return {
    repos,
    graphify,
    httpRelations,
    workspace,
    generatedAt: graph.generatedAt,
  }
}
