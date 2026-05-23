#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import { Orchestrator, isGraphifyAvailable } from '@repomap/core'
import type { RepomapConfig } from '@repomap/core'

// ─────────────────────────────────────────────────────────────────────────────
// REPOMAP CLI
// ─────────────────────────────────────────────────────────────────────────────

const program = new Command()

program
  .name('repomap')
  .description('AI-powered documentation generator for multi-repo projects')
  .version('0.1.0')

// ── generate command ──────────────────────────────────────────────────────────

program
  .command('generate')
  .alias('gen')
  .description('Generate documentation from your repos')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .option('-r, --repos <paths...>', 'Repo paths (overrides config)')
  .option('-o, --output <path>', 'Output directory', './repomap-docs')
  .option('--ai <provider>', 'AI provider: claude-code | claude', 'claude-code')
  .option('--lang <language>', 'Documentation language: en | es', 'en')
  .action(async (options) => {
    printBanner()

    if (!(await isGraphifyAvailable())) {
      console.error(chalk.red('✗ graphify CLI not found on PATH.'))
      console.log(chalk.dim('  Install with one of:'))
      console.log(chalk.cyan('    pipx install graphifyy'))
      console.log(chalk.cyan('    uv tool install graphifyy'))
      process.exit(1)
    }

    const config = loadConfig(options)
    const adapter = await loadAdapter(config)
    const spinner = ora({ text: 'Iniciando…', spinner: 'dots' }).start()

    try {
      const orchestrator = new Orchestrator(config, adapter).onPhase((phase) => {
        switch (phase.kind) {
          case 'graphify-start':
            spinner.text = chalk.dim(`Analizando ${phase.repos} repos con graphify…`)
            break
          case 'graphify-repo-done':
            spinner.text = chalk.dim(`  ${chalk.cyan(phase.repo)}  → ${phase.nodes} nodos, ${phase.edges} edges`)
            break
          case 'graphify-merged':
            spinner.succeed(chalk.green(
              `Grafo construido: ${chalk.bold(phase.nodes)} nodos · ${chalk.bold(phase.edges)} edges · ${chalk.bold(phase.httpRelations)} HTTP relations`
            ))
            spinner.start(chalk.dim('Generando documentación con el modelo… (puede tardar 1-3 min)'))
            break
          case 'llm-progress':
            spinner.text = chalk.dim(
              `Esperando respuesta del modelo… ${chalk.cyan(formatElapsed(phase.elapsedSec))}`
            )
            break
          case 'llm-done':
            spinner.succeed(chalk.green(`Documentación recibida en ${formatElapsed(phase.elapsedSec)}`))
            spinner.start(chalk.dim('Escribiendo HTML…'))
            break
          case 'write-start':
            spinner.text = chalk.dim('Escribiendo páginas…')
            break
          case 'done':
            spinner.succeed(chalk.green('Listo'))
            console.log('')
            console.log(chalk.dim('  Output: ') + chalk.cyan(phase.outputPath))
            console.log('')
            console.log(chalk.dim('  Próximo paso: ') + chalk.cyan('repomap serve'))
            break
        }
      })

      await orchestrator.generate()
    } catch (err: any) {
      spinner.fail(chalk.red('Generación fallida'))
      console.error(chalk.red(err.message))
      process.exit(1)
    }
  })

// ── render command (regenerate HTML from cached knowledge.json, no LLM) ─────

program
  .command('render')
  .description('Regenerate HTML from cached knowledge.json (no LLM call)')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .action(async (options) => {
    printBanner()
    const config = loadConfig(options)
    const adapter = await loadAdapter(config)
    const spinner = ora({ text: 'Regenerando HTML…', spinner: 'dots' }).start()
    try {
      const orchestrator = new Orchestrator(config, adapter).onPhase((phase) => {
        if (phase.kind === 'done') {
          spinner.succeed(chalk.green('HTML regenerado'))
          console.log(chalk.dim('  Output: ') + chalk.cyan(phase.outputPath))
        }
      })
      await orchestrator.render()
    } catch (err: any) {
      spinner.fail(chalk.red('Render fallido'))
      console.error(chalk.red(err.message))
      process.exit(1)
    }
  })

// ── watch command ─────────────────────────────────────────────────────────────

program
  .command('watch')
  .description('Watch for changes and auto-update docs')
  .option('-c, --config <path>', 'Path to config file', 'repomap.config.yml')
  .action(async (options) => {
    printBanner()
    const config = loadConfig(options)
    const adapter = await loadAdapter(config)

    console.log(chalk.cyan('👀 Starting in watch mode...'))
    console.log(chalk.dim('  Watching:'), config.repos.map((r) => r.path).join(', '))
    console.log('')

    const orchestrator = new Orchestrator(config, adapter)
    await orchestrator.watch()
  })

// ── serve command ─────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Open the generated docs in your browser')
  .option('-p, --port <port>', 'Port number', '4040')
  .option('-d, --dir <path>', 'Docs directory', './repomap-docs')
  .action(async (options) => {
    const { createServer } = await import('http')
    const { readFileSync, existsSync } = await import('fs')
    const open = (await import('open')).default

    const docsDir = path.resolve(options.dir)
    if (!existsSync(docsDir)) {
      console.error(chalk.red(`Docs directory not found: ${docsDir}`))
      console.log(chalk.dim('Run'), chalk.cyan('repomap generate'), chalk.dim('first.'))
      process.exit(1)
    }

    const server = createServer((req, res) => {
      let filePath = path.join(docsDir, req.url === '/' ? 'index.html' : req.url!)
      if (!filePath.includes('.')) filePath = path.join(filePath, 'index.html')

      if (existsSync(filePath)) {
        const ext = path.extname(filePath)
        const contentType = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'text/plain'
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(readFileSync(filePath))
      } else {
        res.writeHead(404)
        res.end('Not found')
      }
    })

    server.listen(Number(options.port), () => {
      const url = `http://localhost:${options.port}`
      console.log('')
      console.log(chalk.green(`  ✓ Docs server running at ${chalk.cyan(url)}`))
      console.log('')
      open(url)
    })
  })

// ── init command ──────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a repomap.config.yml in the current directory')
  .action(() => {
    const configPath = 'repomap.config.yml'
    if (fs.existsSync(configPath)) {
      console.log(chalk.yellow('repomap.config.yml already exists'))
      return
    }

    const template = `# repomap configuration
# Requires:
#   - graphify CLI on PATH    (pipx install graphifyy)
#   - For provider=claude-code: Claude Code CLI installed and authenticated
#   - For provider=claude:      ANTHROPIC_API_KEY env var
repos:
  - path: ./services/auth
    name: Auth Service
    description: Handles authentication and authorization
  - path: ./services/api
    name: API Gateway
    description: Main entry point for external requests

output:
  path: ./repomap-docs
  format: html   # html | markdown | json

ai:
  provider: claude-code   # claude-code (uses your Claude Code subscription) | claude (uses ANTHROPIC_API_KEY)
  # model: sonnet         # 'sonnet' | 'opus' | full model id
  # maxBudgetUsd: 1.00    # safety cap per call (claude-code only)

watch: false        # set to true to auto-update on file changes
language: en        # en | es
`
    fs.writeFileSync(configPath, template)
    console.log(chalk.green('✓ Created repomap.config.yml'))
    console.log(chalk.dim('  Edit it to point to your repos, then run:'))
    console.log(chalk.cyan('  repomap generate'))
  })

program.parse()

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadConfig(options: any): RepomapConfig {
  // If repos passed directly via CLI flags, build minimal config
  if (options.repos) {
    return {
      repos: options.repos.map((p: string) => ({
        path: p,
        name: path.basename(p),
      })),
      output: { path: options.output ?? './repomap-docs', format: 'html' },
      ai: { provider: (options.ai ?? 'claude-code') as RepomapConfig['ai']['provider'] },
      language: options.lang ?? 'en',
    }
  }

  // Load from config file
  const configPath = path.resolve(options.config ?? 'repomap.config.yml')
  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(`Config file not found: ${configPath}`))
    console.log(chalk.dim('Run'), chalk.cyan('repomap init'), chalk.dim('to create one.'))
    process.exit(1)
  }

  const raw = fs.readFileSync(configPath, 'utf-8')
  return yaml.parse(raw) as RepomapConfig
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
  console.log(chalk.bold.hex('#e8a04a')('  repomap') + chalk.dim(' v0.1.0'))
  console.log(chalk.dim('  AI-powered docs for multi-repo projects'))
  console.log('')
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}
