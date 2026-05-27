#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import yaml from 'yaml'
import { Orchestrator, isGraphifyAvailable } from '@repomap/core'
import type { RepomapConfig } from '@repomap/core'

// ─────────────────────────────────────────────────────────────────────────────
// REPOMAP CLI
// ─────────────────────────────────────────────────────────────────────────────

const PKG_VERSION: string = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf-8'))
    return String(pkg.version ?? '0.0.0')
  } catch { return '0.0.0' }
})()

type CliLang = 'en' | 'es'

// CLI-facing strings. Keys grouped by command. Resolved from --lang flag or
// from the loaded config (resolveLang). Doc-page i18n lives in @repomap/core.
const cliDict = {
  en: {
    starting: 'Starting…',
    analyzingRepos: (n: number) => `Analyzing ${n} repos with graphify…`,
    repoDone: (repo: string, nodes: number, edges: number) => `  ${repo}  → ${nodes} nodes, ${edges} edges`,
    graphBuilt: (n: number, e: number, h: number) => `Graph built: ${n} nodes · ${e} edges · ${h} HTTP relations`,
    askingModel: 'Generating documentation with the model… (this can take 1-3 min)',
    waitingModel: (elapsed: string) => `Waiting for the model… ${elapsed}`,
    docsReceived: (elapsed: string) => `Documentation received in ${elapsed}`,
    writingHtml: 'Writing HTML…',
    writingPages: 'Writing pages…',
    done: 'Done',
    output: 'Output: ',
    nextStep: 'Next step: ',
    generationFailed: 'Generation failed',
    rerenderHtml: 'Regenerating HTML…',
    htmlRegenerated: 'HTML regenerated',
    renderFailed: 'Render failed',
    watchStart: '👀 Watching for changes…',
    watchPaths: 'Watching: ',
    watchReady: 'Watch ready · Ctrl+C to stop',
    watchChange: (repo: string, file: string) => `${repo} · ${file} changed → updating…`,
    serveRunning: (url: string) => `✓ Docs server running at ${url}`,
    serveDirMissing: (dir: string) => `Docs directory not found: ${dir}`,
    serveRunGenerate: 'first.',
    serveRunGeneratePrefix: 'Run',
    serveLiveReloadOn: 'live-reload on (--no-reload to disable)',
    serveLiveReloadOff: 'live-reload off',
    serveAllInterfaces: '⚠ bound to 0.0.0.0 — anyone on this network can reach the docs',
    initExists: 'repomap.config.yml already exists',
    initCreated: '✓ Created repomap.config.yml',
    initEditPrompt: '  Edit it to point to your repos, then run:',
    initHeader: 'Set up a new repomap.config.yml',
    initNoTty: 'No TTY detected — falling back to static template. Pass --yes to suppress this warning.',
    initOverwrite: 'repomap.config.yml already exists. Overwrite?',
    initAbortedExisting: 'Kept the existing repomap.config.yml.',
    initAskLang: 'Documentation language',
    initLangEn: 'English',
    initLangEs: 'Español',
    initScanning: (dir: string) => `Scanning ${dir} for repos…`,
    initFoundN: (n: number) => `Found ${n} candidate repos.`,
    initFoundNone: 'No repo-shaped directories found here. You can add paths manually.',
    initSelectRepos: 'Select repos to document (space to toggle, enter to confirm)',
    initSelectAtLeastOne: 'Select at least one repo (or quit and add manually).',
    initAddManual: 'Add another repo by typing its path?',
    initAddManualPath: 'Repo path (relative or absolute, blank to finish)',
    initManualInvalid: (p: string) => `Path "${p}" doesn't exist — skipping.`,
    initRepoName: (suggested: string) => `Name for "${suggested}" (used in sidebar)`,
    initRepoDescription: 'One-line description (optional, helps the LLM)',
    initAskProvider: 'AI provider',
    initProviderClaudeCode: 'claude-code — uses your local Claude Code subscription (no API key)',
    initProviderClaude: 'claude — Anthropic API (needs ANTHROPIC_API_KEY)',
    initProviderOllama: 'ollama — local server, fully private',
    initProviderDetected: (prov: string) => `(detected: ${prov} is set up)`,
    initAskModel: 'Model (blank = default)',
    initAskOllamaUrl: 'Ollama server URL',
    initAskOutputDir: 'Output directory',
    initAskFormat: 'Output format',
    initFormatHtml: 'html — full site with mermaid, syntax highlighting, file tree',
    initFormatMarkdown: 'markdown — flat .md files, Notion/Obsidian/GitBook friendly',
    initFormatJson: 'json — raw docs.json for programmatic use',
    initPreviewHeader: 'Preview of repomap.config.yml',
    initConfirmWrite: 'Write this config?',
    initAborted: 'Aborted — no file written.',
    initDoneNext: 'Next steps:',
    initDoctorHint: '  repomap doctor   — verify your setup',
    initGenerateHint: '  repomap generate — create the docs (2-5 min)',
    graphifyMissing: '✗ graphify CLI not found on PATH.',
    graphifyInstallHint: '  Install with one of:',
    debugDirCreated: (p: string) => `debug dumps → ${p}`,
    verboseAdapter: (provider: string, model: string) => `adapter: ${provider} · model: ${model}`,
    verboseConfigSource: (p: string) => `config: ${p}`,
    verboseOutputDir: (p: string) => `output: ${p}`,
    verboseRepoList: (n: number, names: string) => `repos (${n}): ${names}`,
    cleanHeader: (p: string) => `Cleaning under ${p}`,
    cleanNothingDir: (p: string) => `Nothing to clean — ${p} doesn't exist.`,
    cleanNothing: 'Nothing to clean — caches are already empty.',
    cleanTotal: (files: number, size: string) => `Total: ${files} files, ${size}`,
    cleanDryRun: 'Dry-run: no files were deleted. Re-run without --dry-run to delete.',
    cleanDone: '✓ Cleaned.',
    cleanUnsafe: (p: string) => `Refusing to clean ${p} — looks unsafe (root, home dir, or cwd).`,
    cleanAllHint: 'Tip: pass --all to also remove the HTML pages.',
    statusHeader: 'Status — workspace summary',
    statusConfigLabel: 'Config',
    statusOutputLabel: 'Output',
    statusReposLabel: (n: number) => `Repos (${n})`,
    statusRepoNotFound: 'path not found',
    statusConfigMissing: 'no repomap.config.yml found (using default ./repomap-docs)',
    statusLastGen: 'Last generated',
    statusKnowledgeSize: (size: string) => `knowledge.json: ${size}`,
    statusNeverGenerated: 'Never generated — no cache yet',
    statusRunGenerate: 'Run `repomap generate` to create the cache',
    statusOutputBreakdown: 'Output dir',
    statusHtmlPages: 'HTML pages',
    statusGraphifyOutputs: (n: number) => `graphify outputs: ${n} repos`,
    statusDebugDumps: (n: number, size: string) => `debug dumps: ${n} dirs (${size})`,
    statusDebugHint: '→ repomap clean to remove',
    statusTotalSize: 'total size',
    statusNoOutput: 'no output dir yet',
    statusNextLabel: 'Next',
    ageJustNow: 'just now',
    ageMinutes: (m: number) => `${m}m ago`,
    ageHours: (h: number) => `${h}h ago`,
    ageDays: (d: number) => `${d}d ago`,
    ageMonths: (mo: number) => `~${mo}mo ago`,
    hooksInstallHeader: 'Installing post-merge hooks',
    hooksUninstallHeader: 'Uninstalling post-merge hooks',
    hooksStatusHeader: 'Hook status',
    hooksInstalled: (name: string) => `${name}: installed`,
    hooksUpdated: (name: string) => `${name}: updated`,
    hooksRemoved: (name: string) => `${name}: removed`,
    hooksAlreadyOurs: (name: string) => `${name}: already installed`,
    hooksConflict: (name: string) => `${name}: existing hook is not ours — pass --force to overwrite`,
    hooksNoneToRemove: (name: string) => `${name}: nothing to remove`,
    hooksForeign: (name: string) => `${name}: foreign hook present (not installed by repomap)`,
    hooksMissing: (name: string) => `${name}: not installed`,
    hooksOurs: (name: string) => `${name}: installed (repomap hook)`,
    hooksNotGit: (name: string, p: string) => `${name}: ${p} is not a git repo, skipping`,
    hooksRepoMissing: (name: string, p: string) => `${name}: path ${p} doesn't exist`,
    hooksSummary: (installed: number, skipped: number) => `${installed} installed, ${skipped} skipped`,
    hooksRemoveSummary: (removed: number, skipped: number) => `${removed} removed, ${skipped} skipped`,
    hooksTipCost: 'Note: each git pull/merge will trigger `repomap generate` (LLM call) in background.',
    hooksTipLog: 'Hook logs go to /tmp/repomap-hook.log',
    doctorHeader: 'Doctor — checking your setup',
    doctorAllGood: 'All checks passed. You can run `repomap generate`.',
    doctorHasIssues: 'Some checks failed. Fix the items above and run `repomap doctor` again.',
    doctorHasWarnings: 'Setup works, but some checks need attention.',
    doctorNodeOk: (v: string) => `Node ${v} (≥ 18)`,
    doctorNodeOld: (v: string) => `Node ${v} is too old — need ≥ 18`,
    doctorNodeFix: 'Install Node ≥ 18 (e.g. `nvm install 20 && nvm use 20`)',
    doctorGraphifyOk: 'graphify CLI on PATH',
    doctorGraphifyMissing: 'graphify CLI not found on PATH',
    doctorGraphifyFix: 'pipx install graphifyy   (or)   uv tool install graphifyy',
    doctorConfigOk: (rel: string) => `Config: ${rel}`,
    doctorConfigMissing: 'No repomap.config.yml found',
    doctorConfigInvalid: (msg: string) => `Config file is invalid YAML: ${msg}`,
    doctorConfigFix: 'Run `repomap init` to create a starter config',
    doctorReposOk: (n: number, names: string) => `Repos (${n}): ${names}`,
    doctorRepoMissing: (name: string, p: string) => `Repo "${name}" path not found: ${p}`,
    doctorRepoFix: 'Edit repomap.config.yml → repos[].path',
    doctorAiOkClaudeCode: (bin: string) => `AI provider: claude-code — ${bin} ready`,
    doctorAiMissingClaude: (bin: string) => `AI provider: claude-code — \`${bin}\` not runnable`,
    doctorAiClaudeFix: 'Install Claude Code from https://claude.com/code and run `claude auth`',
    doctorAiOkClaude: (source: string) => `AI provider: claude — API key (${source})`,
    doctorAiMissingKey: 'AI provider: claude — no ANTHROPIC_API_KEY and no apiKey in config',
    doctorAiKeyFix: 'export ANTHROPIC_API_KEY="sk-ant-…" or set ai.apiKey in the config',
    doctorAiOkOllama: (url: string, model: string) => `AI provider: ollama — ${url} reachable, model ${model} pulled`,
    doctorAiOllamaNoModel: (url: string, model: string) => `AI provider: ollama — ${url} reachable but model ${model} not pulled`,
    doctorAiOllamaUnreachable: (url: string, why: string) => `AI provider: ollama — ${url} not reachable (${why})`,
    doctorAiOllamaPullFix: (model: string) => `Run: ollama pull ${model}`,
    doctorAiOllamaServeFix: 'Run: ollama serve (or open the Ollama desktop app)',
    doctorAiNotImpl: (prov: string) => `AI provider: ${prov} — adapter not implemented yet`,
    doctorAiNotImplFix: 'Use `claude-code`, `claude`, or `ollama` for now',
    doctorOutputOk: (p: string) => `Output dir writable: ${p}`,
    doctorOutputFail: (p: string) => `Output dir not writable: ${p}`,
    doctorOutputFix: 'Pick a different output.path in the config, or fix permissions',
  },
  es: {
    starting: 'Iniciando…',
    analyzingRepos: (n: number) => `Analizando ${n} repos con graphify…`,
    repoDone: (repo: string, nodes: number, edges: number) => `  ${repo}  → ${nodes} nodos, ${edges} edges`,
    graphBuilt: (n: number, e: number, h: number) => `Grafo construido: ${n} nodos · ${e} edges · ${h} HTTP relations`,
    askingModel: 'Generando documentación con el modelo… (puede tardar 1-3 min)',
    waitingModel: (elapsed: string) => `Esperando respuesta del modelo… ${elapsed}`,
    docsReceived: (elapsed: string) => `Documentación recibida en ${elapsed}`,
    writingHtml: 'Escribiendo HTML…',
    writingPages: 'Escribiendo páginas…',
    done: 'Listo',
    output: 'Output: ',
    nextStep: 'Próximo paso: ',
    generationFailed: 'Generación fallida',
    rerenderHtml: 'Regenerando HTML…',
    htmlRegenerated: 'HTML regenerado',
    renderFailed: 'Render fallido',
    watchStart: '👀 Vigilando cambios…',
    watchPaths: 'Vigilando: ',
    watchReady: 'Listo · Ctrl+C para detener',
    watchChange: (repo: string, file: string) => `${repo} · ${file} cambió → actualizando…`,
    serveRunning: (url: string) => `✓ Doc sirviendo en ${url}`,
    serveDirMissing: (dir: string) => `No se encontró el directorio de docs: ${dir}`,
    serveRunGenerate: 'primero.',
    serveRunGeneratePrefix: 'Ejecuta',
    serveLiveReloadOn: 'live-reload activo (--no-reload para desactivar)',
    serveLiveReloadOff: 'live-reload desactivado',
    serveAllInterfaces: '⚠ escuchando en 0.0.0.0 — cualquiera en esta red puede acceder',
    initExists: 'repomap.config.yml ya existe',
    initCreated: '✓ Creado repomap.config.yml',
    initEditPrompt: '  Edítalo apuntando a tus repos y luego corre:',
    initHeader: 'Configurar un nuevo repomap.config.yml',
    initNoTty: 'No hay TTY — uso template estático. Pasa --yes para suprimir este warning.',
    initOverwrite: 'repomap.config.yml ya existe. ¿Sobreescribir?',
    initAbortedExisting: 'Mantengo el repomap.config.yml existente.',
    initAskLang: 'Idioma de la documentación',
    initLangEn: 'English',
    initLangEs: 'Español',
    initScanning: (dir: string) => `Buscando repos en ${dir}…`,
    initFoundN: (n: number) => `Encontré ${n} candidatos.`,
    initFoundNone: 'No encontré repos por aquí. Puedes añadir paths a mano.',
    initSelectRepos: 'Elige los repos a documentar (espacio para marcar, enter para confirmar)',
    initSelectAtLeastOne: 'Marca al menos uno (o sal y añade a mano).',
    initAddManual: '¿Añadir otro repo escribiendo el path?',
    initAddManualPath: 'Path del repo (relativo o absoluto, vacío para terminar)',
    initManualInvalid: (p: string) => `El path "${p}" no existe — lo salto.`,
    initRepoName: (suggested: string) => `Nombre para "${suggested}" (aparece en la sidebar)`,
    initRepoDescription: 'Descripción en una línea (opcional, ayuda al LLM)',
    initAskProvider: 'Proveedor de IA',
    initProviderClaudeCode: 'claude-code — usa tu Claude Code local (sin API key)',
    initProviderClaude: 'claude — API de Anthropic (necesita ANTHROPIC_API_KEY)',
    initProviderOllama: 'ollama — server local, totalmente privado',
    initProviderDetected: (prov: string) => `(detectado: ${prov} está listo)`,
    initAskModel: 'Modelo (vacío = default)',
    initAskOllamaUrl: 'URL del server Ollama',
    initAskOutputDir: 'Carpeta de salida',
    initAskFormat: 'Formato de salida',
    initFormatHtml: 'html — sitio completo con mermaid, syntax highlighting, file tree',
    initFormatMarkdown: 'markdown — archivos .md planos, compatible con Notion/Obsidian/GitBook',
    initFormatJson: 'json — docs.json crudo para uso programático',
    initPreviewHeader: 'Preview del repomap.config.yml',
    initConfirmWrite: '¿Escribir esta config?',
    initAborted: 'Cancelado — no se escribió nada.',
    initDoneNext: 'Próximos pasos:',
    initDoctorHint: '  repomap doctor   — verifica tu setup',
    initGenerateHint: '  repomap generate — genera la doc (2-5 min)',
    graphifyMissing: '✗ graphify CLI no encontrado en PATH.',
    graphifyInstallHint: '  Instálalo con una de estas opciones:',
    debugDirCreated: (p: string) => `volcados de debug → ${p}`,
    verboseAdapter: (provider: string, model: string) => `adapter: ${provider} · modelo: ${model}`,
    verboseConfigSource: (p: string) => `config: ${p}`,
    verboseOutputDir: (p: string) => `output: ${p}`,
    verboseRepoList: (n: number, names: string) => `repos (${n}): ${names}`,
    cleanHeader: (p: string) => `Limpiando bajo ${p}`,
    cleanNothingDir: (p: string) => `Nada que limpiar — ${p} no existe.`,
    cleanNothing: 'Nada que limpiar — los caches ya están vacíos.',
    cleanTotal: (files: number, size: string) => `Total: ${files} archivos, ${size}`,
    cleanDryRun: 'Dry-run: no se borró nada. Re-ejecuta sin --dry-run para borrar.',
    cleanDone: '✓ Limpio.',
    cleanUnsafe: (p: string) => `No se borrará ${p} — parece riesgoso (root, home o cwd).`,
    cleanAllHint: 'Tip: pasa --all para también borrar las páginas HTML.',
    statusHeader: 'Estado — resumen del workspace',
    statusConfigLabel: 'Config',
    statusOutputLabel: 'Salida',
    statusReposLabel: (n: number) => `Repos (${n})`,
    statusRepoNotFound: 'path no existe',
    statusConfigMissing: 'no se encontró repomap.config.yml (usando default ./repomap-docs)',
    statusLastGen: 'Última generación',
    statusKnowledgeSize: (size: string) => `knowledge.json: ${size}`,
    statusNeverGenerated: 'Nunca generado — todavía no hay cache',
    statusRunGenerate: 'Corre `repomap generate` para crear el cache',
    statusOutputBreakdown: 'Carpeta de salida',
    statusHtmlPages: 'Páginas HTML',
    statusGraphifyOutputs: (n: number) => `outputs de graphify: ${n} repos`,
    statusDebugDumps: (n: number, size: string) => `volcados de debug: ${n} dirs (${size})`,
    statusDebugHint: '→ repomap clean para borrar',
    statusTotalSize: 'tamaño total',
    statusNoOutput: 'aún no hay carpeta de salida',
    statusNextLabel: 'Próximo',
    ageJustNow: 'hace segundos',
    ageMinutes: (m: number) => `hace ${m} min`,
    ageHours: (h: number) => `hace ${h}h`,
    ageDays: (d: number) => `hace ${d} ${d === 1 ? 'día' : 'días'}`,
    ageMonths: (mo: number) => `hace ~${mo} ${mo === 1 ? 'mes' : 'meses'}`,
    hooksInstallHeader: 'Instalando hooks post-merge',
    hooksUninstallHeader: 'Desinstalando hooks post-merge',
    hooksStatusHeader: 'Estado de los hooks',
    hooksInstalled: (name: string) => `${name}: instalado`,
    hooksUpdated: (name: string) => `${name}: actualizado`,
    hooksRemoved: (name: string) => `${name}: removido`,
    hooksAlreadyOurs: (name: string) => `${name}: ya está instalado`,
    hooksConflict: (name: string) => `${name}: ya existe un hook ajeno — pasa --force para sobreescribir`,
    hooksNoneToRemove: (name: string) => `${name}: nada que remover`,
    hooksForeign: (name: string) => `${name}: hook ajeno presente (no instalado por repomap)`,
    hooksMissing: (name: string) => `${name}: no instalado`,
    hooksOurs: (name: string) => `${name}: instalado (hook de repomap)`,
    hooksNotGit: (name: string, p: string) => `${name}: ${p} no es un repo git, saltando`,
    hooksRepoMissing: (name: string, p: string) => `${name}: el path ${p} no existe`,
    hooksSummary: (installed: number, skipped: number) => `${installed} instalados, ${skipped} saltados`,
    hooksRemoveSummary: (removed: number, skipped: number) => `${removed} removidos, ${skipped} saltados`,
    hooksTipCost: 'Nota: cada git pull/merge disparará `repomap generate` (llamada LLM) en background.',
    hooksTipLog: 'Logs del hook en /tmp/repomap-hook.log',
    doctorHeader: 'Doctor — revisando tu setup',
    doctorAllGood: 'Todo en orden. Puedes correr `repomap generate`.',
    doctorHasIssues: 'Hay chequeos que fallaron. Corrige lo de arriba y vuelve a correr `repomap doctor`.',
    doctorHasWarnings: 'El setup funciona, pero hay puntos que conviene revisar.',
    doctorNodeOk: (v: string) => `Node ${v} (≥ 18)`,
    doctorNodeOld: (v: string) => `Node ${v} es muy viejo — necesitas ≥ 18`,
    doctorNodeFix: 'Instala Node ≥ 18 (ej. `nvm install 20 && nvm use 20`)',
    doctorGraphifyOk: 'graphify CLI en PATH',
    doctorGraphifyMissing: 'graphify CLI no encontrado en PATH',
    doctorGraphifyFix: 'pipx install graphifyy   (o)   uv tool install graphifyy',
    doctorConfigOk: (rel: string) => `Config: ${rel}`,
    doctorConfigMissing: 'No se encontró repomap.config.yml',
    doctorConfigInvalid: (msg: string) => `El archivo de config tiene YAML inválido: ${msg}`,
    doctorConfigFix: 'Corre `repomap init` para crear una config inicial',
    doctorReposOk: (n: number, names: string) => `Repos (${n}): ${names}`,
    doctorRepoMissing: (name: string, p: string) => `El path del repo "${name}" no existe: ${p}`,
    doctorRepoFix: 'Edita repomap.config.yml → repos[].path',
    doctorAiOkClaudeCode: (bin: string) => `Proveedor IA: claude-code — ${bin} listo`,
    doctorAiMissingClaude: (bin: string) => `Proveedor IA: claude-code — \`${bin}\` no es ejecutable`,
    doctorAiClaudeFix: 'Instala Claude Code desde https://claude.com/code y corre `claude auth`',
    doctorAiOkClaude: (source: string) => `Proveedor IA: claude — API key (${source})`,
    doctorAiMissingKey: 'Proveedor IA: claude — no hay ANTHROPIC_API_KEY ni apiKey en config',
    doctorAiKeyFix: 'export ANTHROPIC_API_KEY="sk-ant-…" o define ai.apiKey en la config',
    doctorAiOkOllama: (url: string, model: string) => `Proveedor IA: ollama — ${url} alcanzable, modelo ${model} listo`,
    doctorAiOllamaNoModel: (url: string, model: string) => `Proveedor IA: ollama — ${url} alcanzable pero modelo ${model} no está pulleado`,
    doctorAiOllamaUnreachable: (url: string, why: string) => `Proveedor IA: ollama — ${url} no alcanzable (${why})`,
    doctorAiOllamaPullFix: (model: string) => `Corre: ollama pull ${model}`,
    doctorAiOllamaServeFix: 'Corre: ollama serve (o abre la app de Ollama)',
    doctorAiNotImpl: (prov: string) => `Proveedor IA: ${prov} — adapter aún no implementado`,
    doctorAiNotImplFix: 'Por ahora usa `claude-code`, `claude` u `ollama`',
    doctorOutputOk: (p: string) => `Carpeta de salida con permisos de escritura: ${p}`,
    doctorOutputFail: (p: string) => `No se puede escribir en la carpeta de salida: ${p}`,
    doctorOutputFix: 'Cambia output.path en la config o ajusta los permisos',
  },
} as const

function tCli(lang: CliLang, key: keyof typeof cliDict.en): any {
  return cliDict[lang][key]
}

// Lang resolution: explicit --lang flag wins; otherwise read from config
// file if present; otherwise default to 'en'.
function resolveLang(options: any): CliLang {
  if (options?.lang === 'es' || options?.lang === 'en') return options.lang
  try {
    const configPath = path.resolve(options?.config ?? 'repomap.config.yml')
    if (fs.existsSync(configPath)) {
      const cfg = yaml.parse(fs.readFileSync(configPath, 'utf-8'))
      if (cfg?.language === 'es' || cfg?.language === 'en') return cfg.language
    }
  } catch { /* ignore */ }
  return 'en'
}

const program = new Command()

program
  .name('repomap')
  .description('AI-powered documentation generator for multi-repo projects')
  .version(PKG_VERSION)

// ── generate command ──────────────────────────────────────────────────────────

program
  .command('generate')
  .alias('gen')
  .description('Generate documentation from your repos')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('-r, --repos <paths...>', 'Repo paths (overrides config.repos)')
  .option('-o, --output <path>', 'Output directory (overrides config.output.path)')
  .option('--ai <provider>', 'AI provider: claude-code | claude (overrides config.ai.provider)')
  .option('--model <model>', 'Model alias or id (overrides config.ai.model)')
  .option('--lang <language>', 'Documentation language: en | es (overrides config.language)')
  .option('-v, --verbose', 'Print extra info (adapter, model, paths, repo counts)')
  .option('--debug', 'Dump graph, prompts, raw response to <output>/.repomap-debug/<timestamp>/')
  .action(async (options) => {
    const lang = resolveLang(options)
    printBanner()

    if (!(await isGraphifyAvailable())) {
      console.error(chalk.red(tCli(lang, 'graphifyMissing')))
      console.log(chalk.dim(tCli(lang, 'graphifyInstallHint')))
      console.log(chalk.cyan('    pipx install graphifyy'))
      console.log(chalk.cyan('    uv tool install graphifyy'))
      process.exit(1)
    }

    const config = loadConfig(options)
    const adapter = await loadAdapter(config)

    if (options.debug) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const dbgDir = path.resolve(config.output?.path ?? './repomap-docs', '.repomap-debug', stamp)
      fs.mkdirSync(dbgDir, { recursive: true })
      process.env.REPOMAP_DEBUG_DIR = dbgDir
      console.log(chalk.dim('  ' + tCli(lang, 'debugDirCreated')(dbgDir)))
    }

    if (options.verbose) {
      const configPath = path.resolve(options.config ?? 'repomap.config.yml')
      const configShown = fs.existsSync(configPath) ? path.relative(process.cwd(), configPath) || configPath : '(none, using flags)'
      console.log(chalk.dim('  ' + tCli(lang, 'verboseConfigSource')(configShown)))
      console.log(chalk.dim('  ' + tCli(lang, 'verboseAdapter')(config.ai.provider, config.ai.model ?? 'sonnet')))
      console.log(chalk.dim('  ' + tCli(lang, 'verboseOutputDir')(path.resolve(config.output?.path ?? './repomap-docs'))))
      console.log(chalk.dim('  ' + tCli(lang, 'verboseRepoList')(config.repos.length, config.repos.map((r) => r.name).join(', '))))
      console.log('')
    }

    const spinner = ora({ text: tCli(lang, 'starting'), spinner: 'dots' }).start()

    try {
      const orchestrator = new Orchestrator(config, adapter).onPhase((phase) => {
        switch (phase.kind) {
          case 'graphify-start':
            spinner.text = chalk.dim(tCli(lang, 'analyzingRepos')(phase.repos))
            break
          case 'graphify-repo-done':
            spinner.text = chalk.dim(tCli(lang, 'repoDone')(chalk.cyan(phase.repo), phase.nodes, phase.edges))
            break
          case 'graphify-merged':
            spinner.succeed(chalk.green(
              tCli(lang, 'graphBuilt')(chalk.bold(phase.nodes), chalk.bold(phase.edges), chalk.bold(phase.httpRelations))
            ))
            spinner.start(chalk.dim(tCli(lang, 'askingModel')))
            break
          case 'llm-progress':
            spinner.text = chalk.dim(tCli(lang, 'waitingModel')(chalk.cyan(formatElapsed(phase.elapsedSec))))
            break
          case 'llm-done':
            spinner.succeed(chalk.green(tCli(lang, 'docsReceived')(formatElapsed(phase.elapsedSec))))
            spinner.start(chalk.dim(tCli(lang, 'writingHtml')))
            break
          case 'write-start':
            spinner.text = chalk.dim(tCli(lang, 'writingPages'))
            break
          case 'done':
            spinner.succeed(chalk.green(tCli(lang, 'done')))
            console.log('')
            console.log(chalk.dim('  ' + tCli(lang, 'output')) + chalk.cyan(phase.outputPath))
            console.log('')
            console.log(chalk.dim('  ' + tCli(lang, 'nextStep')) + chalk.cyan('repomap serve'))
            break
        }
      })

      await orchestrator.generate()
    } catch (err: any) {
      spinner.fail(chalk.red(tCli(lang, 'generationFailed')))
      console.error(chalk.red(err.message))
      if (process.env.REPOMAP_DEBUG_DIR) {
        console.log(chalk.dim('  ' + tCli(lang, 'debugDirCreated')(process.env.REPOMAP_DEBUG_DIR)))
      }
      process.exit(1)
    }
  })

// ── render command (regenerate HTML from cached knowledge.json, no LLM) ─────

program
  .command('render')
  .description('Regenerate HTML from cached knowledge.json (no LLM call)')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('--lang <language>', 'Override language: en | es')
  .action(async (options) => {
    const lang = resolveLang(options)
    printBanner()
    const config = loadConfig(options)
    const adapter = await loadAdapter(config)
    const spinner = ora({ text: tCli(lang, 'rerenderHtml'), spinner: 'dots' }).start()
    try {
      const orchestrator = new Orchestrator(config, adapter).onPhase((phase) => {
        if (phase.kind === 'done') {
          spinner.succeed(chalk.green(tCli(lang, 'htmlRegenerated')))
          console.log(chalk.dim('  ' + tCli(lang, 'output')) + chalk.cyan(phase.outputPath))
        }
      })
      await orchestrator.render()
    } catch (err: any) {
      spinner.fail(chalk.red(tCli(lang, 'renderFailed')))
      console.error(chalk.red(err.message))
      process.exit(1)
    }
  })

// ── watch command ─────────────────────────────────────────────────────────────

program
  .command('watch')
  .description('Watch for changes and auto-update docs')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('--lang <language>', 'Override language: en | es')
  .option('--ignore <pattern...>', 'Extra ignore patterns (chokidar globs). Appended to defaults: node_modules, .git, dist, build, graphify-out')
  .option('--debounce <ms>', 'Wait this many ms after last change before regenerating (default 1500)')
  .action(async (options) => {
    const lang = resolveLang(options)
    printBanner()
    const config = loadConfig(options)
    const adapter = await loadAdapter(config)

    const debounceMs = options.debounce ? Number(options.debounce) : undefined
    if (debounceMs != null && (!Number.isFinite(debounceMs) || debounceMs < 0)) {
      console.error(chalk.red(`Invalid --debounce value: ${options.debounce} (must be a non-negative number of ms)`))
      process.exit(1)
    }
    const extraIgnore: string[] | undefined = Array.isArray(options.ignore) && options.ignore.length > 0 ? options.ignore : undefined

    console.log(chalk.cyan(tCli(lang, 'watchStart')))
    console.log(chalk.dim('  ' + tCli(lang, 'watchPaths')) + config.repos.map((r) => r.path).join(', '))
    if (extraIgnore) console.log(chalk.dim('  ignore: ') + chalk.cyan(extraIgnore.join(', ')))
    if (debounceMs != null) console.log(chalk.dim('  debounce: ') + chalk.cyan(`${debounceMs}ms`))
    console.log('')

    let spinner = ora({ text: tCli(lang, 'starting'), spinner: 'dots' }).start()
    const orchestrator = new Orchestrator(config, adapter).onPhase((phase) => {
      switch (phase.kind) {
        case 'graphify-start':
          spinner.text = chalk.dim(tCli(lang, 'analyzingRepos')(phase.repos))
          break
        case 'graphify-merged':
          spinner.succeed(chalk.green(tCli(lang, 'graphBuilt')(chalk.bold(phase.nodes), chalk.bold(phase.edges), chalk.bold(phase.httpRelations))))
          spinner = ora({ text: chalk.dim(tCli(lang, 'askingModel')), spinner: 'dots' }).start()
          break
        case 'llm-progress':
          spinner.text = chalk.dim(tCli(lang, 'waitingModel')(chalk.cyan(formatElapsed(phase.elapsedSec))))
          break
        case 'llm-done':
          spinner.succeed(chalk.green(tCli(lang, 'docsReceived')(formatElapsed(phase.elapsedSec))))
          break
        case 'write-start':
          spinner = ora({ text: chalk.dim(tCli(lang, 'writingPages')), spinner: 'dots' }).start()
          break
        case 'done':
          if (spinner.isSpinning) spinner.succeed(chalk.green(tCli(lang, 'done')))
          console.log(chalk.dim('  ' + tCli(lang, 'output')) + chalk.cyan(phase.outputPath))
          console.log(chalk.cyan('  ' + tCli(lang, 'watchReady')))
          console.log('')
          break
        case 'watch-change':
          console.log(chalk.dim('  ↻ ') + chalk.cyan(tCli(lang, 'watchChange')(phase.repo, phase.path)))
          spinner = ora({ text: chalk.dim(tCli(lang, 'askingModel')), spinner: 'dots' }).start()
          break
      }
    })

    process.on('SIGINT', () => {
      console.log('')
      console.log(chalk.dim('  bye'))
      process.exit(0)
    })

    await orchestrator.watch({ ignore: extraIgnore, debounceMs })
  })

// ── serve command ─────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Open the generated docs in your browser (with live-reload)')
  .option('-p, --port <port>', 'Port number', '4040')
  .option('--host <host>', 'Host/interface to bind (use 0.0.0.0 to expose to LAN)', 'localhost')
  .option('-d, --dir <path>', 'Docs directory', './repomap-docs')
  .option('--lang <language>', 'Override language: en | es')
  .option('--no-open', "Don't open the browser automatically")
  .option('--no-reload', 'Disable live-reload (don\'t watch the docs dir)')
  .action(async (options) => {
    const lang = resolveLang(options)
    const { createServer } = await import('http')
    const { readFileSync, existsSync, statSync } = await import('fs')
    const open = (await import('open')).default
    const chokidar = (await import('chokidar')).default

    const docsDir = path.resolve(options.dir)
    if (!existsSync(docsDir)) {
      console.error(chalk.red(tCli(lang, 'serveDirMissing')(docsDir)))
      console.log(chalk.dim(tCli(lang, 'serveRunGeneratePrefix')), chalk.cyan('repomap generate'), chalk.dim(tCli(lang, 'serveRunGenerate')))
      process.exit(1)
    }

    const reloadEnabled = options.reload !== false

    const MIME: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.mjs':  'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.map':  'application/json; charset=utf-8',
      '.svg':  'image/svg+xml',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.webp': 'image/webp',
      '.avif': 'image/avif',
      '.ico':  'image/x-icon',
      '.woff':  'font/woff',
      '.woff2': 'font/woff2',
      '.ttf':   'font/ttf',
      '.otf':   'font/otf',
      '.eot':   'application/vnd.ms-fontobject',
      '.xml':  'application/xml; charset=utf-8',
      '.txt':  'text/plain; charset=utf-8',
      '.md':   'text/markdown; charset=utf-8',
      '.pdf':  'application/pdf',
    }

    // Connected SSE clients. Broadcasted to on every (debounced) file change.
    const sseClients = new Set<any>()

    // Injected just before </body> on HTML responses when reload is enabled.
    // EventSource auto-reconnects, so a server restart still recovers cleanly.
    const RELOAD_SNIPPET = `<script>(function(){try{var es=new EventSource('/__repomap/reload');es.onmessage=function(m){if(m.data==='reload')location.reload();};}catch(e){}})();</script>`

    const server = createServer((req: any, res: any) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0])

        // SSE endpoint for live-reload
        if (reloadEnabled && urlPath === '/__repomap/reload') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          })
          res.write(': connected\n\n')
          sseClients.add(res)
          const drop = () => { sseClients.delete(res); try { res.end() } catch {} }
          req.on('close', drop)
          req.on('error', drop)
          return
        }

        let filePath = path.join(docsDir, urlPath === '/' ? 'index.html' : urlPath)
        // Block path traversal: resolved path must stay inside docsDir.
        const resolved = path.resolve(filePath)
        if (!resolved.startsWith(docsDir + path.sep) && resolved !== docsDir) {
          res.writeHead(403); res.end('Forbidden'); return
        }
        // Directory → index.html
        if (existsSync(resolved) && statSync(resolved).isDirectory()) {
          filePath = path.join(resolved, 'index.html')
        } else if (!path.extname(resolved)) {
          filePath = path.join(resolved, 'index.html')
        } else {
          filePath = resolved
        }
        if (existsSync(filePath) && statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase()
          const contentType = MIME[ext] ?? 'application/octet-stream'

          // Inject reload snippet into HTML so each page becomes self-reloading.
          if (reloadEnabled && contentType.startsWith('text/html')) {
            let html = readFileSync(filePath, 'utf-8')
            html = html.includes('</body>')
              ? html.replace('</body>', RELOAD_SNIPPET + '</body>')
              : html + RELOAD_SNIPPET
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' })
            res.end(html)
            return
          }

          res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' })
          res.end(readFileSync(filePath))
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not found')
        }
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Internal error: ' + (err?.message ?? 'unknown'))
      }
    })

    // Watch docsDir and broadcast to SSE clients on change (debounced 100ms).
    let watcher: any = null
    if (reloadEnabled) {
      watcher = chokidar.watch(docsDir, {
        ignoreInitial: true,
        ignored: /(^|[\\/])\.[^\\/]/,   // skip dotfiles
      })
      let timer: NodeJS.Timeout | null = null
      const broadcast = () => {
        for (const client of sseClients) {
          try { client.write('data: reload\n\n') } catch { sseClients.delete(client) }
        }
      }
      watcher.on('all', () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(broadcast, 100)
      })
    }

    const port = Number(options.port)
    const host = String(options.host ?? 'localhost')
    const isAllInterfaces = host === '0.0.0.0' || host === '::'
    // URL the user will click — always loopback-friendly. Browsers can't open 0.0.0.0.
    const browserUrl = `http://${isAllInterfaces || host === 'localhost' ? 'localhost' : host}:${port}`

    server.listen(port, host, () => {
      console.log('')
      console.log(chalk.green('  ' + tCli(lang, 'serveRunning')(chalk.cyan(browserUrl))))
      console.log(chalk.dim('  ' + (reloadEnabled ? tCli(lang, 'serveLiveReloadOn') : tCli(lang, 'serveLiveReloadOff'))))
      if (isAllInterfaces) {
        console.log(chalk.yellow('  ' + tCli(lang, 'serveAllInterfaces')))
      }
      console.log('')
      if (options.open !== false) open(browserUrl)
    })

    const shutdown = () => {
      console.log('')
      console.log(chalk.dim('  bye'))
      if (watcher) watcher.close().catch(() => {})
      for (const client of sseClients) { try { client.end() } catch {} }
      server.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 500).unref()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })

// ── doctor command ────────────────────────────────────────────────────────────

type CheckLevel = 'ok' | 'warn' | 'fail'
interface DoctorCheck { level: CheckLevel; label: string; fix?: string }

program
  .command('doctor')
  .description('Diagnose your repomap setup (Node, graphify, config, repos, AI, output)')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('--lang <language>', 'Override language: en | es')
  .action(async (options) => {
    const lang = resolveLang(options)
    printBanner()
    console.log(chalk.bold('  ' + tCli(lang, 'doctorHeader')))
    console.log('')

    const checks: DoctorCheck[] = []

    // 1. Node version
    const nodeVer = process.versions.node
    const nodeMajor = parseInt(nodeVer.split('.')[0]!, 10)
    if (nodeMajor >= 18) {
      checks.push({ level: 'ok', label: tCli(lang, 'doctorNodeOk')(nodeVer) })
    } else {
      checks.push({ level: 'fail', label: tCli(lang, 'doctorNodeOld')(nodeVer), fix: tCli(lang, 'doctorNodeFix') })
    }

    // 2. graphify on PATH
    if (await isGraphifyAvailable()) {
      checks.push({ level: 'ok', label: tCli(lang, 'doctorGraphifyOk') })
    } else {
      checks.push({ level: 'fail', label: tCli(lang, 'doctorGraphifyMissing'), fix: tCli(lang, 'doctorGraphifyFix') })
    }

    // 3. Config file
    const configPath = path.resolve(options.config ?? 'repomap.config.yml')
    let config: RepomapConfig | null = null
    if (!fs.existsSync(configPath)) {
      checks.push({ level: 'warn', label: tCli(lang, 'doctorConfigMissing'), fix: tCli(lang, 'doctorConfigFix') })
    } else {
      try {
        config = yaml.parse(fs.readFileSync(configPath, 'utf-8')) as RepomapConfig
        checks.push({ level: 'ok', label: tCli(lang, 'doctorConfigOk')(path.relative(process.cwd(), configPath) || configPath) })
      } catch (err: any) {
        checks.push({ level: 'fail', label: tCli(lang, 'doctorConfigInvalid')(err.message ?? String(err)) })
      }
    }

    // 4. Repos
    if (config?.repos?.length) {
      const missing = config.repos.filter((r) => !fs.existsSync(path.resolve(r.path)))
      if (missing.length === 0) {
        checks.push({
          level: 'ok',
          label: tCli(lang, 'doctorReposOk')(config.repos.length, config.repos.map((r) => r.name).join(', ')),
        })
      } else {
        for (const r of missing) {
          checks.push({
            level: 'fail',
            label: tCli(lang, 'doctorRepoMissing')(r.name, r.path),
            fix: tCli(lang, 'doctorRepoFix'),
          })
        }
      }
    }

    // 5. AI provider
    if (config?.ai) {
      const prov = config.ai.provider
      if (prov === 'claude-code') {
        const bin = config.ai.binary ?? 'claude'
        const ok = await isBinaryAvailable(bin, ['--version'])
        checks.push(
          ok
            ? { level: 'ok', label: tCli(lang, 'doctorAiOkClaudeCode')(bin) }
            : { level: 'fail', label: tCli(lang, 'doctorAiMissingClaude')(bin), fix: tCli(lang, 'doctorAiClaudeFix') }
        )
      } else if (prov === 'claude') {
        const hasEnv = !!process.env.ANTHROPIC_API_KEY
        const hasCfg = !!config.ai.apiKey
        if (hasEnv || hasCfg) {
          checks.push({ level: 'ok', label: tCli(lang, 'doctorAiOkClaude')(hasEnv ? 'env' : 'config') })
        } else {
          checks.push({ level: 'fail', label: tCli(lang, 'doctorAiMissingKey'), fix: tCli(lang, 'doctorAiKeyFix') })
        }
      } else if (prov === 'ollama') {
        const { probeOllama } = await import('@repomap/adapter-ollama')
        const baseUrl = config.ai.baseUrl ?? 'http://localhost:11434'
        const model = config.ai.model ?? 'qwen2.5-coder:7b'
        const probe = await probeOllama(baseUrl, model)
        if (!probe.reachable) {
          checks.push({
            level: 'fail',
            label: tCli(lang, 'doctorAiOllamaUnreachable')(baseUrl, probe.error ?? 'unknown'),
            fix: tCli(lang, 'doctorAiOllamaServeFix'),
          })
        } else if (probe.modelAvailable === false) {
          checks.push({
            level: 'fail',
            label: tCli(lang, 'doctorAiOllamaNoModel')(baseUrl, model),
            fix: tCli(lang, 'doctorAiOllamaPullFix')(model),
          })
        } else {
          checks.push({ level: 'ok', label: tCli(lang, 'doctorAiOkOllama')(baseUrl, model) })
        }
      } else {
        checks.push({ level: 'warn', label: tCli(lang, 'doctorAiNotImpl')(prov), fix: tCli(lang, 'doctorAiNotImplFix') })
      }
    }

    // 6. Output dir writable
    if (config?.output?.path) {
      const outputAbs = path.resolve(config.output.path)
      const target = fs.existsSync(outputAbs) ? outputAbs : path.dirname(outputAbs)
      try {
        fs.accessSync(target, fs.constants.W_OK)
        checks.push({ level: 'ok', label: tCli(lang, 'doctorOutputOk')(outputAbs) })
      } catch {
        checks.push({ level: 'fail', label: tCli(lang, 'doctorOutputFail')(outputAbs), fix: tCli(lang, 'doctorOutputFix') })
      }
    }

    for (const c of checks) {
      const sym = c.level === 'ok' ? chalk.green('✓') : c.level === 'warn' ? chalk.yellow('⚠') : chalk.red('✗')
      console.log('  ' + sym + ' ' + c.label)
      if (c.fix) console.log('      ' + chalk.dim('→ ') + chalk.cyan(c.fix))
    }
    console.log('')

    const hasFail = checks.some((c) => c.level === 'fail')
    const hasWarn = checks.some((c) => c.level === 'warn')
    if (hasFail) {
      console.log(chalk.red('  ' + tCli(lang, 'doctorHasIssues')))
      process.exit(1)
    } else if (hasWarn) {
      console.log(chalk.yellow('  ' + tCli(lang, 'doctorHasWarnings')))
    } else {
      console.log(chalk.green('  ' + tCli(lang, 'doctorAllGood')))
    }
  })

// ── clean command ─────────────────────────────────────────────────────────────

program
  .command('clean')
  .description('Remove generated caches under output.path (data/, graphify/, .repomap-debug/)')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('-o, --output <path>', 'Output directory to clean (overrides config.output.path)')
  .option('--all', 'Also remove HTML pages — wipes the entire output directory')
  .option('-n, --dry-run', 'List what would be deleted, do not delete')
  .option('--lang <language>', 'Override language: en | es')
  .action((options) => {
    const lang = resolveLang(options)
    printBanner()

    // Resolve output dir without requiring a full config (clean should be lenient).
    let outDir: string
    if (options.output) {
      outDir = path.resolve(options.output)
    } else {
      const configPath = path.resolve(options.config ?? 'repomap.config.yml')
      if (fs.existsSync(configPath)) {
        try {
          const cfg = yaml.parse(fs.readFileSync(configPath, 'utf-8'))
          outDir = path.resolve(cfg?.output?.path ?? './repomap-docs')
        } catch {
          outDir = path.resolve('./repomap-docs')
        }
      } else {
        outDir = path.resolve('./repomap-docs')
      }
    }

    if (!isSafeToClean(outDir)) {
      console.error(chalk.red('  ' + tCli(lang, 'cleanUnsafe')(outDir)))
      process.exit(1)
    }

    if (!fs.existsSync(outDir)) {
      console.log(chalk.dim('  ' + tCli(lang, 'cleanNothingDir')(outDir)))
      return
    }

    console.log(chalk.bold('  ' + tCli(lang, 'cleanHeader')(outDir)))
    console.log('')

    const cacheTargets = [
      path.join(outDir, 'data'),
      path.join(outDir, 'graphify'),
      path.join(outDir, '.repomap-debug'),
    ].filter((p) => fs.existsSync(p))

    const targets = options.all ? [outDir] : cacheTargets

    if (targets.length === 0) {
      console.log(chalk.dim('  ' + tCli(lang, 'cleanNothing')))
      return
    }

    let totalBytes = 0
    let totalFiles = 0
    for (const t of targets) {
      const s = walkSize(t)
      totalBytes += s.bytes
      totalFiles += s.files
      console.log('  ' + chalk.cyan(t) + chalk.dim(`  (${s.files} files, ${humanBytes(s.bytes)})`))
    }
    console.log('')
    console.log(chalk.dim('  ' + tCli(lang, 'cleanTotal')(totalFiles, humanBytes(totalBytes))))
    console.log('')

    if (options.dryRun) {
      console.log(chalk.yellow('  ' + tCli(lang, 'cleanDryRun')))
      if (!options.all) console.log(chalk.dim('  ' + tCli(lang, 'cleanAllHint')))
      return
    }

    for (const t of targets) {
      fs.rmSync(t, { recursive: true, force: true })
    }
    console.log(chalk.green('  ' + tCli(lang, 'cleanDone')))
    if (!options.all) console.log(chalk.dim('  ' + tCli(lang, 'cleanAllHint')))
  })

// ── hooks command ─────────────────────────────────────────────────────────────

const HOOK_NAME = 'post-merge'
const HOOK_MARKER = '# repomap auto-generated hook — do not edit by hand'

function buildHookScript(workspaceDir: string): string {
  return `#!/bin/sh
${HOOK_MARKER}
# Installed by 'repomap hooks install'. To remove: 'repomap hooks uninstall'.
cd ${shellQuote(workspaceDir)} || exit 0
if command -v repomap >/dev/null 2>&1; then
  (nohup repomap generate > /tmp/repomap-hook.log 2>&1 &) </dev/null
  echo "repomap: regenerating docs in background (log: /tmp/repomap-hook.log)"
else
  echo "repomap: command not found on PATH, skipping doc update" >&2
fi
`
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

type HookState = 'ours' | 'foreign' | 'missing' | 'not-git' | 'no-repo'

function inspectHook(repoPath: string): { state: HookState; hookPath: string | null } {
  if (!fs.existsSync(repoPath)) return { state: 'no-repo', hookPath: null }
  const gitDir = path.join(repoPath, '.git')
  // .git can be a file in worktrees/submodules; treat both as git
  if (!fs.existsSync(gitDir)) return { state: 'not-git', hookPath: null }
  const hooksDir = path.join(gitDir, 'hooks')
  const hookPath = path.join(hooksDir, HOOK_NAME)
  if (!fs.existsSync(hookPath)) return { state: 'missing', hookPath }
  try {
    const content = fs.readFileSync(hookPath, 'utf-8')
    return { state: content.includes(HOOK_MARKER) ? 'ours' : 'foreign', hookPath }
  } catch {
    return { state: 'foreign', hookPath }
  }
}

const hooksCmd = program
  .command('hooks')
  .description('Manage git hooks that auto-regenerate docs on pull/merge')

hooksCmd
  .command('install')
  .description('Install post-merge hook in each repo from the config')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('-r, --repos <paths...>', 'Repo paths (overrides config.repos)')
  .option('--force', 'Overwrite an existing hook that was not installed by repomap')
  .option('--lang <language>', 'Override language: en | es')
  .action((options) => {
    const lang = resolveLang(options)
    const config = loadConfig(options)
    const workspaceDir = path.dirname(path.resolve(options.config ?? 'repomap.config.yml'))
    const script = buildHookScript(workspaceDir)

    printBanner()
    console.log(chalk.bold('  ' + tCli(lang, 'hooksInstallHeader')))
    console.log('')

    let installed = 0
    let skipped = 0
    for (const repo of config.repos) {
      const repoPath = path.resolve(repo.path)
      const { state, hookPath } = inspectHook(repoPath)
      if (state === 'no-repo') {
        console.log('    ' + chalk.red('✗ ') + tCli(lang, 'hooksRepoMissing')(repo.name, repoPath))
        skipped++
        continue
      }
      if (state === 'not-git') {
        console.log('    ' + chalk.yellow('⚠ ') + tCli(lang, 'hooksNotGit')(repo.name, repoPath))
        skipped++
        continue
      }
      if (state === 'foreign' && !options.force) {
        console.log('    ' + chalk.yellow('⚠ ') + tCli(lang, 'hooksConflict')(repo.name))
        skipped++
        continue
      }
      const wasOurs = state === 'ours'
      fs.mkdirSync(path.dirname(hookPath!), { recursive: true })
      fs.writeFileSync(hookPath!, script, { mode: 0o755 })
      fs.chmodSync(hookPath!, 0o755) // explicit chmod for filesystems that ignore mode on write
      console.log('    ' + chalk.green((wasOurs ? '↻ ' : '✓ ')) + (wasOurs ? tCli(lang, 'hooksUpdated')(repo.name) : tCli(lang, 'hooksInstalled')(repo.name)))
      installed++
    }
    console.log('')
    console.log('  ' + chalk.dim(tCli(lang, 'hooksSummary')(installed, skipped)))
    if (installed > 0) {
      console.log('  ' + chalk.dim(tCli(lang, 'hooksTipCost')))
      console.log('  ' + chalk.dim(tCli(lang, 'hooksTipLog')))
    }
  })

hooksCmd
  .command('uninstall')
  .description('Remove post-merge hooks previously installed by repomap')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('-r, --repos <paths...>', 'Repo paths (overrides config.repos)')
  .option('--lang <language>', 'Override language: en | es')
  .action((options) => {
    const lang = resolveLang(options)
    const config = loadConfig(options)
    printBanner()
    console.log(chalk.bold('  ' + tCli(lang, 'hooksUninstallHeader')))
    console.log('')

    let removed = 0
    let skipped = 0
    for (const repo of config.repos) {
      const repoPath = path.resolve(repo.path)
      const { state, hookPath } = inspectHook(repoPath)
      if (state === 'ours' && hookPath) {
        fs.rmSync(hookPath)
        console.log('    ' + chalk.green('✓ ') + tCli(lang, 'hooksRemoved')(repo.name))
        removed++
      } else if (state === 'foreign') {
        console.log('    ' + chalk.yellow('⚠ ') + tCli(lang, 'hooksForeign')(repo.name))
        skipped++
      } else {
        console.log('    ' + chalk.dim('· ') + tCli(lang, 'hooksNoneToRemove')(repo.name))
        skipped++
      }
    }
    console.log('')
    console.log('  ' + chalk.dim(tCli(lang, 'hooksRemoveSummary')(removed, skipped)))
  })

hooksCmd
  .command('status')
  .description('Show which repos have the repomap hook installed')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('-r, --repos <paths...>', 'Repo paths (overrides config.repos)')
  .option('--lang <language>', 'Override language: en | es')
  .action((options) => {
    const lang = resolveLang(options)
    const config = loadConfig(options)
    printBanner()
    console.log(chalk.bold('  ' + tCli(lang, 'hooksStatusHeader')))
    console.log('')
    for (const repo of config.repos) {
      const repoPath = path.resolve(repo.path)
      const { state } = inspectHook(repoPath)
      switch (state) {
        case 'ours':
          console.log('    ' + chalk.green('✓ ') + tCli(lang, 'hooksOurs')(repo.name))
          break
        case 'foreign':
          console.log('    ' + chalk.yellow('⚠ ') + tCli(lang, 'hooksForeign')(repo.name))
          break
        case 'missing':
          console.log('    ' + chalk.dim('· ') + tCli(lang, 'hooksMissing')(repo.name))
          break
        case 'not-git':
          console.log('    ' + chalk.yellow('⚠ ') + tCli(lang, 'hooksNotGit')(repo.name, repoPath))
          break
        case 'no-repo':
          console.log('    ' + chalk.red('✗ ') + tCli(lang, 'hooksRepoMissing')(repo.name, repoPath))
          break
      }
    }
    console.log('')
  })

// ── status command ────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show workspace summary: config, repos, last generate, cache size, debug dumps')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('--lang <language>', 'Override language: en | es')
  .action((options) => {
    const lang = resolveLang(options)
    printBanner()
    console.log(chalk.bold('  ' + tCli(lang, 'statusHeader')))
    console.log('')

    // Resolve config leniently — don't exit when missing.
    const configPath = path.resolve(options.config ?? 'repomap.config.yml')
    const hasConfig = fs.existsSync(configPath)
    let config: RepomapConfig | null = null
    if (hasConfig) {
      try { config = yaml.parse(fs.readFileSync(configPath, 'utf-8')) as RepomapConfig } catch { /* ignore */ }
    }
    const outDir = path.resolve(config?.output?.path ?? './repomap-docs')

    const PAD = 12
    const configDisplay = hasConfig
      ? (path.relative(process.cwd(), configPath) || configPath)
      : chalk.yellow(tCli(lang, 'statusConfigMissing'))
    console.log('  ' + chalk.dim(tCli(lang, 'statusConfigLabel').padEnd(PAD)) + configDisplay)
    console.log('  ' + chalk.dim(tCli(lang, 'statusOutputLabel').padEnd(PAD)) + outDir)

    // Repos
    if (config?.repos?.length) {
      console.log('')
      console.log('  ' + chalk.bold(tCli(lang, 'statusReposLabel')(config.repos.length)))
      const nameWidth = Math.min(20, Math.max(...config.repos.map((r) => r.name.length)) + 2)
      for (const r of config.repos) {
        const exists = fs.existsSync(path.resolve(r.path))
        const mark = exists ? chalk.green('✓') : chalk.red('✗')
        const suffix = exists ? '' : chalk.red(` (${tCli(lang, 'statusRepoNotFound')})`)
        console.log(`    ${mark} ${r.name.padEnd(nameWidth)} ${chalk.dim(r.path)}${suffix}`)
      }
    }

    // Last generate
    const knowledgePath = path.join(outDir, 'data', 'knowledge.json')
    console.log('')
    console.log('  ' + chalk.bold(tCli(lang, 'statusLastGen')))
    if (fs.existsSync(knowledgePath)) {
      let generatedAt: string | null = null
      try {
        const k = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8'))
        generatedAt = k?.docs?.generatedAt ?? null
      } catch { /* ignore */ }
      const stat = fs.statSync(knowledgePath)
      const when = generatedAt ?? stat.mtime.toISOString()
      const ageMs = Date.now() - new Date(when).getTime()
      console.log(`    ${formatDate(when, lang)}  ${chalk.dim('(' + humanAge(ageMs, lang) + ')')}`)
      console.log(`    ${chalk.dim(tCli(lang, 'statusKnowledgeSize')(humanBytes(stat.size)))}`)
    } else {
      console.log(`    ${chalk.yellow(tCli(lang, 'statusNeverGenerated'))}`)
      console.log(`    ${chalk.dim(tCli(lang, 'statusRunGenerate'))}`)
    }

    // Output dir breakdown
    console.log('')
    console.log('  ' + chalk.bold(tCli(lang, 'statusOutputBreakdown')))
    if (!fs.existsSync(outDir)) {
      console.log(`    ${chalk.dim(tCli(lang, 'statusNoOutput'))}`)
    } else {
      const htmlCount = countHtmlPages(outDir)
      const graphifyDir = path.join(outDir, 'graphify')
      const graphifyRepos = fs.existsSync(graphifyDir)
        ? fs.readdirSync(graphifyDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length
        : 0
      const debugDirPath = path.join(outDir, '.repomap-debug')
      let debugRuns = 0
      let debugBytes = 0
      if (fs.existsSync(debugDirPath)) {
        const entries = fs.readdirSync(debugDirPath, { withFileTypes: true }).filter((d) => d.isDirectory())
        debugRuns = entries.length
        for (const e of entries) debugBytes += walkSize(path.join(debugDirPath, e.name)).bytes
      }
      const totalBytes = walkSize(outDir).bytes

      console.log(`    ${tCli(lang, 'statusHtmlPages')}: ${chalk.cyan(String(htmlCount))}`)
      console.log(`    ${tCli(lang, 'statusGraphifyOutputs')(graphifyRepos)}`)
      if (debugRuns > 0) {
        console.log(`    ${tCli(lang, 'statusDebugDumps')(debugRuns, humanBytes(debugBytes))}  ${chalk.dim(tCli(lang, 'statusDebugHint'))}`)
      }
      console.log(`    ${tCli(lang, 'statusTotalSize')}: ${chalk.cyan(humanBytes(totalBytes))}`)
    }
    console.log('')
  })

// ── init command ──────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a repomap.config.yml (interactive by default, --yes for the static template)')
  .option('--lang <language>', 'Documentation language: en | es')
  .option('-y, --yes', 'Skip interactive flow — write the static template with placeholders')
  .action(async (options) => {
    const configPath = 'repomap.config.yml'
    const explicitLang: CliLang | undefined = (options.lang === 'es' || options.lang === 'en') ? options.lang : undefined

    // Non-TTY (CI / piped) → static template, no questions
    if (options.yes || !process.stdin.isTTY) {
      if (!options.yes && !process.stdin.isTTY) {
        console.log(chalk.yellow('  ' + tCli(explicitLang ?? 'en', 'initNoTty')))
      }
      const lang: CliLang = explicitLang ?? 'en'
      if (fs.existsSync(configPath)) {
        console.log(chalk.yellow(tCli(lang, 'initExists')))
        return
      }
      fs.writeFileSync(configPath, initTemplate(lang))
      console.log(chalk.green(tCli(lang, 'initCreated')))
      console.log(chalk.dim(tCli(lang, 'initEditPrompt')))
      console.log(chalk.cyan('  repomap generate'))
      return
    }

    try {
      await runInteractiveInit(configPath, explicitLang)
    } catch (err: any) {
      // @inquirer/prompts throws ExitPromptError on Ctrl+C — swallow it
      // and exit cleanly instead of dumping a stack trace at the user.
      if (err?.name === 'ExitPromptError') {
        console.log('')
        console.log(chalk.dim('  ' + tCli(explicitLang ?? 'en', 'initAborted')))
        process.exit(130)
      }
      throw err
    }
  })

async function runInteractiveInit(configPath: string, explicitLang?: CliLang): Promise<void> {
  const { input, select, checkbox, confirm } = await import('@inquirer/prompts')

  printBanner()
  // Use whatever language we have so far for the header line
  const startingLang: CliLang = explicitLang ?? 'en'
  console.log(chalk.bold('  ' + tCli(startingLang, 'initHeader')))
  console.log('')

  // Existing-file guard with overwrite option
  if (fs.existsSync(configPath)) {
    const overwrite = await confirm({
      message: tCli(startingLang, 'initOverwrite'),
      default: false,
    })
    if (!overwrite) {
      console.log(chalk.dim('  ' + tCli(startingLang, 'initAbortedExisting')))
      return
    }
  }

  // 1. Language
  const lang: CliLang = explicitLang ?? (await select({
    message: tCli(startingLang, 'initAskLang'),
    choices: [
      { value: 'en' as CliLang, name: tCli(startingLang, 'initLangEn') },
      { value: 'es' as CliLang, name: tCli(startingLang, 'initLangEs') },
    ],
    default: 'en' as CliLang,
  }))

  // 2. Detect repo candidates
  console.log('')
  console.log(chalk.dim('  ' + tCli(lang, 'initScanning')(process.cwd())))
  const candidates = detectRepoCandidates(process.cwd())
  console.log(chalk.dim('  ' + (candidates.length > 0
    ? tCli(lang, 'initFoundN')(candidates.length)
    : tCli(lang, 'initFoundNone'))))
  console.log('')

  // 3. Multi-select detected repos
  let selectedPaths: string[] = []
  if (candidates.length > 0) {
    selectedPaths = await checkbox({
      message: tCli(lang, 'initSelectRepos'),
      choices: candidates.map((c) => ({
        value: c.path,
        name: `${c.path}  ${chalk.dim('(' + c.markers.join(', ') + ')')}`,
        checked: true,
      })),
    })
  }

  // 4. Manually add more paths
  while (true) {
    const addMore = await confirm({
      message: tCli(lang, 'initAddManual'),
      default: selectedPaths.length === 0,
    })
    if (!addMore) break
    const p = (await input({ message: tCli(lang, 'initAddManualPath') })).trim()
    if (!p) break
    if (!fs.existsSync(path.resolve(p))) {
      console.log(chalk.yellow('    ' + tCli(lang, 'initManualInvalid')(p)))
      continue
    }
    if (selectedPaths.includes(p)) continue
    selectedPaths.push(p)
  }

  if (selectedPaths.length === 0) {
    console.log(chalk.yellow('  ' + tCli(lang, 'initSelectAtLeastOne')))
    console.log(chalk.dim('  ' + tCli(lang, 'initAborted')))
    return
  }

  // 5. Per-repo name + description
  const repos: Array<{ path: string; name: string; description?: string }> = []
  for (const p of selectedPaths) {
    const suggested = path.basename(path.resolve(p))
    const name = (await input({
      message: tCli(lang, 'initRepoName')(suggested),
      default: suggested,
    })).trim() || suggested
    const description = (await input({
      message: tCli(lang, 'initRepoDescription'),
      default: '',
    })).trim()
    repos.push(description ? { path: p, name, description } : { path: p, name })
  }

  // 6. Provider — detect what's already set up to pick a good default
  console.log('')
  const detected = await detectBestProvider()
  const providerHint = detected ? chalk.dim(' ' + tCli(lang, 'initProviderDetected')(detected)) : ''
  const provider = await select({
    message: tCli(lang, 'initAskProvider') + providerHint,
    choices: [
      { value: 'claude-code' as const, name: tCli(lang, 'initProviderClaudeCode') },
      { value: 'claude' as const, name: tCli(lang, 'initProviderClaude') },
      { value: 'ollama' as const, name: tCli(lang, 'initProviderOllama') },
    ],
    default: detected ?? 'claude-code',
  })

  // 7. Provider-specific extras
  const model = (await input({
    message: tCli(lang, 'initAskModel'),
    default: '',
  })).trim()

  let baseUrl = ''
  if (provider === 'ollama') {
    baseUrl = (await input({
      message: tCli(lang, 'initAskOllamaUrl'),
      default: 'http://localhost:11434',
    })).trim()
  }

  // 8. Output
  const outputPath = (await input({
    message: tCli(lang, 'initAskOutputDir'),
    default: './repomap-docs',
  })).trim() || './repomap-docs'

  const format = await select({
    message: tCli(lang, 'initAskFormat'),
    choices: [
      { value: 'html' as const, name: tCli(lang, 'initFormatHtml') },
      { value: 'markdown' as const, name: tCli(lang, 'initFormatMarkdown') },
      { value: 'json' as const, name: tCli(lang, 'initFormatJson') },
    ],
    default: 'html' as const,
  })

  // 9. Build + preview + confirm
  const yamlText = buildConfigYaml({
    repos, provider, model, baseUrl, outputPath, format, lang,
  })

  console.log('')
  console.log(chalk.bold('  ' + tCli(lang, 'initPreviewHeader')))
  console.log('')
  console.log(yamlText.split('\n').map((l) => '    ' + chalk.dim('│ ') + l).join('\n'))
  console.log('')

  const writeIt = await confirm({
    message: tCli(lang, 'initConfirmWrite'),
    default: true,
  })
  if (!writeIt) {
    console.log(chalk.yellow('  ' + tCli(lang, 'initAborted')))
    return
  }

  fs.writeFileSync(configPath, yamlText)
  console.log(chalk.green('  ' + tCli(lang, 'initCreated')))
  console.log('')
  console.log(chalk.dim('  ' + tCli(lang, 'initDoneNext')))
  console.log(chalk.cyan(tCli(lang, 'initDoctorHint')))
  console.log(chalk.cyan(tCli(lang, 'initGenerateHint')))
}

// ── init helpers ──────────────────────────────────────────────────────────────

interface RepoCandidate { path: string; name: string; markers: string[] }

const REPO_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle', 'Gemfile']
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', '.cache', '.venv', 'venv', '__pycache__', 'repomap-docs'])

function repoMarkersIn(dir: string): string[] {
  const found: string[] = []
  for (const m of REPO_MARKERS) {
    try { if (fs.existsSync(path.join(dir, m))) found.push(m) } catch { /* skip */ }
  }
  return found
}

// Scan cwd + 2 levels deep for directories that look like a code repo.
// Skip hidden dirs and common build/dep outputs to avoid noise.
function detectRepoCandidates(cwd: string): RepoCandidate[] {
  const results: RepoCandidate[] = []

  const cwdMarkers = repoMarkersIn(cwd)
  if (cwdMarkers.length > 0) {
    results.push({ path: '.', name: path.basename(cwd), markers: cwdMarkers })
  }

  let level1: fs.Dirent[]
  try { level1 = fs.readdirSync(cwd, { withFileTypes: true }) } catch { return results }
  for (const entry of level1) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const subPath = path.join(cwd, entry.name)
    const markers = repoMarkersIn(subPath)
    if (markers.length > 0) {
      results.push({ path: `./${entry.name}`, name: entry.name, markers })
      continue
    }
    // 2nd level — useful for monorepo conventions like packages/<name>/
    let level2: fs.Dirent[]
    try { level2 = fs.readdirSync(subPath, { withFileTypes: true }) } catch { continue }
    for (const sub of level2) {
      if (!sub.isDirectory() || sub.name.startsWith('.') || SKIP_DIRS.has(sub.name)) continue
      const deepPath = path.join(subPath, sub.name)
      const deepMarkers = repoMarkersIn(deepPath)
      if (deepMarkers.length > 0) {
        results.push({ path: `./${entry.name}/${sub.name}`, name: sub.name, markers: deepMarkers })
      }
    }
  }
  return results
}

// Pick a provider the user can use without further setup. Order matches the
// likely best UX: subscription > API key > local.
async function detectBestProvider(): Promise<'claude-code' | 'claude' | 'ollama' | null> {
  if (await isBinaryAvailable('claude', ['--version'])) return 'claude-code'
  if (process.env.ANTHROPIC_API_KEY) return 'claude'
  try {
    const { probeOllama } = await import('@repomap/adapter-ollama')
    const probe = await probeOllama()
    if (probe.reachable) return 'ollama'
  } catch { /* ignore */ }
  return null
}

interface BuildConfigInput {
  repos: Array<{ path: string; name: string; description?: string }>
  provider: 'claude-code' | 'claude' | 'ollama'
  model: string
  baseUrl: string
  outputPath: string
  format: 'html' | 'markdown' | 'json'
  lang: CliLang
}

function buildConfigYaml(c: BuildConfigInput): string {
  const lines: string[] = []
  lines.push('# Generated by `repomap init` — edit freely.')
  lines.push('')
  lines.push('repos:')
  for (const r of c.repos) {
    lines.push(`  - path: ${r.path}`)
    lines.push(`    name: ${r.name}`)
    if (r.description) lines.push(`    description: ${yamlString(r.description)}`)
  }
  lines.push('')
  lines.push('output:')
  lines.push(`  path: ${c.outputPath}`)
  lines.push(`  format: ${c.format}`)
  lines.push('')
  lines.push('ai:')
  lines.push(`  provider: ${c.provider}`)
  if (c.model) lines.push(`  model: ${c.model}`)
  if (c.provider === 'ollama' && c.baseUrl) lines.push(`  baseUrl: ${c.baseUrl}`)
  if (c.provider === 'claude-code') lines.push(`  # maxBudgetUsd: 1.00   # safety cap per call`)
  lines.push('')
  lines.push(`language: ${c.lang}`)
  lines.push('watch: false')
  lines.push('')
  return lines.join('\n')
}

// Minimal YAML-safe string escaping: quote if it has special chars or
// leading/trailing whitespace; otherwise emit bare.
function yamlString(s: string): string {
  if (/^[\w .,/()\-]+$/.test(s) && !/^\s|\s$/.test(s)) return s
  return JSON.stringify(s)
}

function initTemplate(lang: CliLang): string {
  if (lang === 'es') {
    return `# Configuración de repomap
# Prerequisitos:
#   - graphify CLI en PATH                  (pipx install graphifyy)
#   - Si provider=claude-code:  Claude Code CLI instalado y autenticado
#   - Si provider=claude:       ANTHROPIC_API_KEY como variable de entorno

repos:
  # Apunta cada path a la raíz de un repo (relativa o absoluta).
  # El 'name' es como aparecerá en la sidebar de la doc generada.
  - path: ./<tu-repo-1>
    name: <nombre-corto>
    description: <una línea opcional>
  - path: ./<tu-repo-2>
    name: <nombre-corto>
    description: <una línea opcional>

output:
  path: ./repomap-docs        # dónde se escribirá el sitio
  format: html                # html | markdown | json

ai:
  provider: claude-code       # claude-code (usa tu suscripción) | claude (usa ANTHROPIC_API_KEY) | ollama (local, sin key)
  # model: sonnet             # claude/claude-code: 'sonnet' | 'opus' | id completo   |   ollama: 'qwen2.5-coder:7b' | 'llama3.1:8b' | …
  # baseUrl: http://localhost:11434   # solo ollama — URL del server
  # maxBudgetUsd: 1.00        # tope de gasto por llamada (solo claude-code)
  # binary: claude            # ruta al binario claude si no está en PATH (solo claude-code)

language: es                  # 'es' | 'en' — idioma de la doc generada
watch: false                  # true → 'generate' queda en modo watch al terminar
`
  }
  return `# repomap configuration
# Prerequisites:
#   - graphify CLI on PATH                  (pipx install graphifyy)
#   - For provider=claude-code: Claude Code CLI installed and authenticated
#   - For provider=claude:      ANTHROPIC_API_KEY environment variable

repos:
  # Point each path at the root of a repo (relative or absolute).
  # The 'name' is how it appears in the generated docs sidebar.
  - path: ./<your-repo-1>
    name: <short-name>
    description: <optional one-liner>
  - path: ./<your-repo-2>
    name: <short-name>
    description: <optional one-liner>

output:
  path: ./repomap-docs        # where the site is written
  format: html                # html | markdown | json

ai:
  provider: claude-code       # claude-code (uses your subscription) | claude (uses ANTHROPIC_API_KEY) | ollama (local, no key)
  # model: sonnet             # claude/claude-code: 'sonnet' | 'opus' | full id   |   ollama: 'qwen2.5-coder:7b' | 'llama3.1:8b' | …
  # baseUrl: http://localhost:11434   # ollama only — server URL
  # maxBudgetUsd: 1.00        # safety cap per call (claude-code only)
  # binary: claude            # path to claude binary if not on PATH (claude-code only)

language: en                  # 'en' | 'es' — language of the generated docs
watch: false                  # true → 'generate' stays in watch mode after finishing
`
}

program.parse()

// ── Helpers ───────────────────────────────────────────────────────────────────

// Precedence: CLI flags > config file > built-in defaults.
// A config file is loaded if present; CLI flags then override the
// corresponding fields. If no config exists and --repos is passed,
// a minimal config is synthesized from flags + defaults.
function loadConfig(options: any): RepomapConfig {
  const configPath = path.resolve(options.config ?? 'repomap.config.yml')
  const fileExists = fs.existsSync(configPath)
  const hasReposFlag = Array.isArray(options.repos) && options.repos.length > 0

  let config: RepomapConfig
  if (fileExists) {
    const raw = fs.readFileSync(configPath, 'utf-8')
    config = yaml.parse(raw) as RepomapConfig
  } else if (hasReposFlag) {
    config = {
      repos: [],
      output: { path: './repomap-docs', format: 'html' },
      ai: { provider: 'claude-code' },
      language: 'en',
    }
  } else {
    console.error(chalk.red(`Config file not found: ${configPath}`))
    console.log(chalk.dim('Run'), chalk.cyan('repomap init'), chalk.dim('to create one.'))
    process.exit(1)
  }

  if (hasReposFlag) {
    config.repos = options.repos.map((p: string) => ({
      path: p,
      name: path.basename(p),
    }))
  }
  if (typeof options.output === 'string' && options.output.length > 0) {
    config.output = { ...(config.output ?? { format: 'html' as const, path: '' }), path: options.output }
  }
  if (typeof options.ai === 'string' && options.ai.length > 0) {
    config.ai = { ...(config.ai ?? { provider: 'claude-code' as const }), provider: options.ai as RepomapConfig['ai']['provider'] }
  }
  if (typeof options.model === 'string' && options.model.length > 0) {
    config.ai = { ...(config.ai ?? { provider: 'claude-code' as const }), model: options.model }
  }
  if (options.lang === 'en' || options.lang === 'es') {
    config.language = options.lang
  }

  return config
}

async function loadAdapter(config: RepomapConfig) {
  const { provider } = config.ai

  if (provider === 'claude-code') {
    const { ClaudeCodeAdapter } = await import('@repomap/adapter-claude-code')
    return new ClaudeCodeAdapter({
      model: config.ai.model,
      binary: config.ai.binary,
      maxBudgetUsd: config.ai.maxBudgetUsd,
    })
  }

  if (provider === 'claude') {
    const { ClaudeAdapter } = await import('@repomap/adapter-claude')
    return new ClaudeAdapter(config.ai.apiKey)
  }

  if (provider === 'ollama') {
    const { OllamaAdapter } = await import('@repomap/adapter-ollama')
    return new OllamaAdapter({
      model: config.ai.model,
      baseUrl: config.ai.baseUrl,
    })
  }

  if (provider === 'openai' || provider === 'gemini') {
    throw new Error(`Adapter for '${provider}' is on the roadmap but not implemented yet. Use 'claude-code', 'claude', or 'ollama'.`)
  }

  throw new Error(`Unknown AI provider: ${provider}. Supported: claude-code, claude, ollama`)
}

function printBanner(): void {
  console.log('')
  console.log(chalk.bold.hex('#e8a04a')('  repomap') + chalk.dim(` v${PKG_VERSION}`))
  console.log(chalk.dim('  AI-powered docs for multi-repo projects'))
  console.log('')
}

function isSafeToClean(p: string): boolean {
  const resolved = path.resolve(p)
  if (resolved === '/' || resolved === path.parse(resolved).root) return false
  if (resolved === os.homedir()) return false
  if (resolved === process.cwd()) return false
  // Refuse to wipe a one-segment dir like /Users or /home
  const segments = resolved.split(path.sep).filter(Boolean)
  if (segments.length < 2) return false
  return true
}

function walkSize(dir: string): { bytes: number; files: number } {
  try {
    const stat = fs.statSync(dir)
    if (stat.isFile()) return { bytes: stat.size, files: 1 }
  } catch { return { bytes: 0, files: 0 } }
  let bytes = 0
  let files = 0
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return { bytes: 0, files: 0 } }
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = walkSize(p)
      bytes += sub.bytes
      files += sub.files
    } else if (entry.isFile()) {
      try {
        bytes += fs.statSync(p).size
        files += 1
      } catch { /* skip */ }
    }
  }
  return { bytes, files }
}

// Walk output dir counting .html files, skipping cache/data/debug subtrees so
// the number reflects user-facing pages, not generated artifacts.
function countHtmlPages(dir: string): number {
  const SKIP = new Set(['data', 'graphify', '.repomap-debug', 'node_modules', '.git'])
  let count = 0
  const walk = (d: string) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue
        walk(path.join(d, e.name))
      } else if (e.isFile() && e.name.endsWith('.html')) {
        count++
      }
    }
  }
  walk(dir)
  return count
}

function formatDate(iso: string, lang: CliLang): string {
  try {
    return new Date(iso).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
  } catch { return iso }
}

function humanAge(ms: number, lang: CliLang): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return tCli(lang, 'ageJustNow')
  const m = Math.floor(s / 60)
  if (m < 60) return tCli(lang, 'ageMinutes')(m)
  const h = Math.floor(m / 60)
  if (h < 24) return tCli(lang, 'ageHours')(h)
  const d = Math.floor(h / 24)
  if (d < 30) return tCli(lang, 'ageDays')(d)
  const mo = Math.floor(d / 30)
  return tCli(lang, 'ageMonths')(mo)
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function isBinaryAvailable(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(bin, args, { stdio: 'ignore' })
      proc.on('error', () => resolve(false))
      proc.on('exit', (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}
