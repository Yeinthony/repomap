#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fs from 'fs'
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
    initExists: 'repomap.config.yml already exists',
    initCreated: '✓ Created repomap.config.yml',
    initEditPrompt: '  Edit it to point to your repos, then run:',
    graphifyMissing: '✗ graphify CLI not found on PATH.',
    graphifyInstallHint: '  Install with one of:',
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
    doctorAiNotImpl: (prov: string) => `AI provider: ${prov} — adapter not implemented yet`,
    doctorAiNotImplFix: 'Use `claude-code` or `claude` for now',
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
    initExists: 'repomap.config.yml ya existe',
    initCreated: '✓ Creado repomap.config.yml',
    initEditPrompt: '  Edítalo apuntando a tus repos y luego corre:',
    graphifyMissing: '✗ graphify CLI no encontrado en PATH.',
    graphifyInstallHint: '  Instálalo con una de estas opciones:',
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
    doctorAiNotImpl: (prov: string) => `Proveedor IA: ${prov} — adapter aún no implementado`,
    doctorAiNotImplFix: 'Por ahora usa `claude-code` o `claude`',
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
  .action(async (options) => {
    const lang = resolveLang(options)
    printBanner()
    const config = loadConfig(options)
    const adapter = await loadAdapter(config)

    console.log(chalk.cyan(tCli(lang, 'watchStart')))
    console.log(chalk.dim('  ' + tCli(lang, 'watchPaths')) + config.repos.map((r) => r.path).join(', '))
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

    await orchestrator.watch()
  })

// ── serve command ─────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Open the generated docs in your browser')
  .option('-p, --port <port>', 'Port number', '4040')
  .option('-d, --dir <path>', 'Docs directory', './repomap-docs')
  .option('--lang <language>', 'Override language: en | es')
  .option('--no-open', "Don't open the browser automatically")
  .action(async (options) => {
    const lang = resolveLang(options)
    const { createServer } = await import('http')
    const { readFileSync, existsSync, statSync } = await import('fs')
    const open = (await import('open')).default

    const docsDir = path.resolve(options.dir)
    if (!existsSync(docsDir)) {
      console.error(chalk.red(tCli(lang, 'serveDirMissing')(docsDir)))
      console.log(chalk.dim(tCli(lang, 'serveRunGeneratePrefix')), chalk.cyan('repomap generate'), chalk.dim(tCli(lang, 'serveRunGenerate')))
      process.exit(1)
    }

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

    const server = createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
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

    const port = Number(options.port)
    server.listen(port, () => {
      const url = `http://localhost:${port}`
      console.log('')
      console.log(chalk.green('  ' + tCli(lang, 'serveRunning')(chalk.cyan(url))))
      console.log('')
      if (options.open !== false) open(url)
    })

    process.on('SIGINT', () => {
      console.log('')
      console.log(chalk.dim('  bye'))
      server.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 500).unref()
    })
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

// ── init command ──────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a repomap.config.yml in the current directory')
  .option('--lang <language>', 'Template language: en | es', 'en')
  .action((options) => {
    const lang: CliLang = options.lang === 'es' ? 'es' : 'en'
    const configPath = 'repomap.config.yml'
    if (fs.existsSync(configPath)) {
      console.log(chalk.yellow(tCli(lang, 'initExists')))
      return
    }

    fs.writeFileSync(configPath, initTemplate(lang))
    console.log(chalk.green(tCli(lang, 'initCreated')))
    console.log(chalk.dim(tCli(lang, 'initEditPrompt')))
    console.log(chalk.cyan('  repomap generate'))
  })

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
  provider: claude-code       # claude-code (usa tu suscripción) | claude (usa ANTHROPIC_API_KEY)
  # model: sonnet             # 'sonnet' (rápido) | 'opus' (mejor calidad) | id completo del modelo
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
  provider: claude-code       # claude-code (uses your subscription) | claude (uses ANTHROPIC_API_KEY)
  # model: sonnet             # 'sonnet' (fast) | 'opus' (best quality) | full model id
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

  if (provider === 'openai' || provider === 'ollama' || provider === 'gemini') {
    throw new Error(`Adapter for '${provider}' is on the roadmap but not implemented yet. Use 'claude-code' or 'claude'.`)
  }

  throw new Error(`Unknown AI provider: ${provider}. Supported: claude-code, claude`)
}

function printBanner(): void {
  console.log('')
  console.log(chalk.bold.hex('#e8a04a')('  repomap') + chalk.dim(` v${PKG_VERSION}`))
  console.log(chalk.dim('  AI-powered docs for multi-repo projects'))
  console.log('')
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
