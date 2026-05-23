// ─────────────────────────────────────────────────────────────────────────────
// REPOMAP CORE TYPES
// ─────────────────────────────────────────────────────────────────────────────

// ── Config ────────────────────────────────────────────────────────────────────

export interface RepomapConfig {
  repos: RepoConfig[]
  output: OutputConfig
  ai: AIConfig
  watch?: boolean
  language?: 'en' | 'es'
}

export interface RepoConfig {
  path: string
  name: string
  description?: string
}

export interface OutputConfig {
  path: string
  format: 'html' | 'markdown' | 'json'
}

export interface AIConfig {
  provider: 'claude' | 'claude-code' | 'openai' | 'ollama' | 'gemini'
  model?: string
  apiKey?: string
  baseUrl?: string
  binary?: string         // path override for claude-code provider
  maxBudgetUsd?: number   // safety cap for claude-code provider
}

// ── Graphify graph (raw output from `graphify` CLI) ──────────────────────────

export interface GraphifyNode {
  id: string
  label: string
  file_type: 'code' | 'document' | 'paper' | 'image' | 'rationale' | 'concept'
  source_file?: string
  source_location?: string | null
  source_url?: string | null
  captured_at?: string | null
  author?: string | null
  contributor?: string | null
  repo?: string         // present after merge-graphs
  [key: string]: unknown
}

export interface GraphifyEdge {
  source: string
  target: string
  relation: string      // calls | implements | references | ...
  confidence?: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'
  confidence_score?: number
  source_file?: string
  weight?: number
  [key: string]: unknown
}

export interface GraphifyGraph {
  nodes: GraphifyNode[]
  edges: GraphifyEdge[]
  hyperedges?: unknown[]
  graph?: Record<string, unknown>
}

// ── Per-repo lightweight summary (cheap, no LLM) ─────────────────────────────

export interface RepoSummary {
  name: string
  path: string
  languages: string[]
  endpoints: APIEndpoint[]
  serviceUrls: ServiceUrlMapping[]   // env vars naming other services
  envVars: string[]                  // process.env.X observed
  dependencies: string[]
  dockerService?: string             // service name in docker-compose if any
  /** First ~2500 chars of the repo's README (ground truth from the authors). */
  readme?: string
  /** Selected fields from package.json / pyproject.toml — what the package
   *  declares about itself: description, scripts, main/bin entry points. */
  packageMeta?: PackageMeta
}

export interface PackageMeta {
  name?: string
  description?: string
  main?: string
  bin?: string | Record<string, string>
  scripts?: Record<string, string>
  keywords?: string[]
}

export interface APIEndpoint {
  method?: string
  path?: string
  eventName?: string
  type: 'http' | 'grpc' | 'event' | 'graphql' | 'unknown'
  sourceFile?: string
}

export interface ServiceUrlMapping {
  envVar: string            // e.g. PAYMENTS_SERVICE_URL
  url: string               // e.g. http://payments:3000
  hostHint: string          // host portion, used to match other repos
  sourceFile: string        // where it was declared (.env / docker-compose.yml)
}

// ── Cross-repo HTTP relations (detected by us, not graphify) ─────────────────

export interface HttpRelation {
  from: string              // repo name
  to: string                // repo name (or 'unknown' if URL didn't resolve)
  url: string               // literal URL or templated string
  method?: string
  sourceFile: string
  evidence: 'literal-url' | 'env-var-match' | 'docker-service-match'
}

// ── Combined graph passed to the LLM ─────────────────────────────────────────

export interface CodeGraph {
  repos: RepoSummary[]
  graphify: GraphifyGraph
  httpRelations: HttpRelation[]
  workspace?: WorkspaceContext
  generatedAt: string
}

export interface WorkspaceContext {
  /** README of the parent directory (where repomap.config.yml lives). */
  readme?: string
  /** package.json of the workspace root, if any. */
  rootPackageMeta?: PackageMeta
}

// ── Documentation (what the AI produces) ─────────────────────────────────────

export interface Documentation {
  overview: OverviewDoc
  services: ServiceDoc[]
  integrations: IntegrationDoc
  changelog?: ChangelogEntry[]
  generatedAt: string
}

export interface OverviewDoc {
  title: string
  summary: string
  analogy?: string
  architecture: string
  keyConceptsFor: string[]
}

export interface ServiceDoc {
  name: string
  purpose: string
  longDescription: string
  analogy?: string
  architecture: string
  endpoints: EndpointDoc[]
  events: EventDoc[]
  envVars: EnvVarDoc[]
  gettingStarted: string
  examples: CodeExample[]
  apiReference?: ApiReferenceDoc
}

export interface EndpointDoc {
  method: string
  path: string
  description: string
  requestExample?: string
  responseExample?: string
}

export interface EventDoc {
  name: string
  type: 'publishes' | 'subscribes'
  description: string
  payloadExample?: string
}

export interface EnvVarDoc {
  name: string
  description: string
  required: boolean
  example?: string
}

export interface CodeExample {
  title: string
  description: string
  code: string
  language: string
}

// ── API Reference (symbol-level docs, Track 2) ────────────────────────────────

export interface ParamDoc {
  name: string
  type?: string
  description: string
  required: boolean
  default?: string
}

export interface SymbolDoc {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'method'
  signature?: string
  description: string
  params?: ParamDoc[]
  returns?: string
  sourceFile?: string
  example?: string
}

export interface ApiReferenceSection {
  title: string
  description?: string
  symbols: SymbolDoc[]
}

export interface ApiReferenceDoc {
  intro?: string
  sections: ApiReferenceSection[]
}

export interface IntegrationDoc {
  summary: string
  diagram: string
  flows: FlowDoc[]
}

export interface FlowDoc {
  name: string
  description: string
  steps: string[]
  diagram: string
}

export interface ChangelogEntry {
  date: string
  repo: string
  commit: string
  summary: string
  affectedDocs: string[]
}

// ── AI Adapter interface ─────────────────────────────────────────────────────

export interface AIAdapter {
  generateDocs(graph: CodeGraph, config: RepomapConfig): Promise<Documentation>
  updateDocs(
    existing: Documentation,
    diff: GitDiff,
    config: RepomapConfig
  ): Promise<Documentation>
}

export interface GitDiff {
  repo: string
  commit: string
  changedFiles: ChangedFile[]
}

export interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'deleted'
  diff: string
}
