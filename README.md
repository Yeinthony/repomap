# repomap

[![npm version](https://img.shields.io/npm/v/@repomap/cli.svg)](https://www.npmjs.com/package/@repomap/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js >=18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-ready-blue?logo=githubactions&logoColor=white)](./action.yml)

**Generador de documentación impulsado por IA para proyectos multi-repo.**

Apunta repomap a tus repos, espera 2–5 minutos, y obtienes un sitio HTML de calidad framework: overview, página por servicio, integraciones, grafo interactivo y diagramas con pan/zoom.

> El código nunca se envía completo al LLM: solo el grafo estructural (~5% del tamaño real).

---

## Tabla de contenido

- [Qué hace](#qué-hace)
- [Quickstart](#quickstart)
- [Prerequisitos](#prerequisitos)
- [Instalación](#instalación)
- [Uso paso a paso](#uso-paso-a-paso)
- [Comandos](#comandos)
- [Configuración (`repomap.config.yml`)](#configuración-repomapconfigyml)
- [Presets — rendimiento vs calidad](#presets--rendimiento-vs-calidad)
- [Iterar sin volver a llamar al LLM](#iterar-sin-volver-a-llamar-al-llm)
- [Auto-actualización (watch + hooks)](#auto-actualización-watch--hooks)
- [Salida](#salida)
- [Detectores](#detectores-qué-identifica-repomap)
- [Coste y rendimiento](#coste-y-rendimiento)
- [GitHub Action](#github-action)
- [Cómo funciona internamente](#cómo-funciona-internamente-resumen-técnico)
- [Arquitectura del repo](#arquitectura-del-repo)
- [Troubleshooting](#troubleshooting)
- [Soporte Java / Spring Boot](#soporte-java--spring-boot)
- [Roadmap](#roadmap)
- [Performance bottlenecks pendientes](#performance-bottlenecks-pendientes-referencia-para-contribuir)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

---

## Qué hace

Te incorporas a un proyecto nuevo. 5 servicios, 3 equipos, cero documentación. Te pasas semanas haciendo ingeniería inversa de cómo se conecta todo.

**repomap lo resuelve.** Analiza tus repos localmente con AST (vía [graphify](https://github.com/Yeinthony/graphify-y)), detecta llamadas HTTP entre servicios (`fetch`, `axios`, env vars `*_SERVICE_URL`, `docker-compose.yml`), construye un grafo cross-repo y le pasa solo el esqueleto a un LLM (Claude o Ollama) para que escriba la prosa, los ejemplos y las analogías.

---

## Quickstart

```bash
# 1. Instala el CLI
npm install -g @repomap/cli

# 2. Instala el motor de análisis estructural
pipx install graphifyy    # o: uv tool install graphifyy

# 3. Ve a la carpeta que contiene tus repos
cd ~/workspaces/mi-plataforma

# 4. Inicializa interactivamente (detecta tus repos automáticamente)
repomap init

# 5. Genera la documentación
repomap generate

# 6. Ábrela en el navegador
repomap serve
```

¿Algo falla? Corre `repomap doctor` para un diagnóstico completo.

---

## Prerequisitos

Necesitas tres cosas en tu máquina antes de empezar:

1. **Node.js ≥ 18** (recomendado vía [nvm](https://github.com/nvm-sh/nvm)).
2. **graphify CLI** — motor de análisis estructural:
   ```bash
   pipx install graphifyy
   # o:  uv tool install graphifyy
   ```
   Verifica con `which graphify` (debería responder un path).
3. **Un LLM**, una de estas tres opciones:
   - **Claude Code instalado y autenticado** (recomendado — usa tu suscripción Pro/Max, no requiere API key)
     - Descarga: <https://claude.com/code>
     - Verifica con `claude --version`
   - **API key de Anthropic** (recomendado para CI/CD — habilita generación paralela con prompt caching)
     - Obtén la key en <https://console.anthropic.com/settings/keys>
     - Exporta: `export ANTHROPIC_API_KEY="sk-ant-..."`
   - **Ollama local** (privado, sin API key, $0 de coste — para código sensible o entornos air-gapped)
     - Instala: `brew install ollama` o desde <https://ollama.com/download>
     - Pull de un modelo: `ollama pull qwen2.5-coder:7b`
     - Calidad de prosa por debajo de Sonnet/Opus pero suficiente para overviews y referencia

---

## Instalación

```bash
npm install -g @repomap/cli
```

Verifica con `repomap --version` (debería responder `0.1.0` o superior).

> Si usas nvm y `repomap` no aparece en otra terminal, asegúrate de tener `nvm use <versión>` en tu `~/.zshrc`.

### Desde fuente (para hackear el código)

```bash
git clone https://github.com/Yeinthony/repomap.git
cd repomap
npm install
npm run build
npm link -w @repomap/cli   # registra `repomap` globalmente apuntando al checkout
```

---

## Uso paso a paso

### 1. Posiciónate en una carpeta padre

repomap funciona mejor cuando lo corres desde una carpeta que contiene (o es vecina de) los repos que vas a documentar. Por ejemplo:

```
~/workspaces/mi-plataforma/
├── auth-service/        ← repo
├── payments-service/    ← repo
├── api-gateway/         ← repo
└── frontend/            ← repo
```

```bash
cd ~/workspaces/mi-plataforma
```

### 2. Crea el archivo de configuración

```bash
repomap init
```

Por defecto el flujo es **interactivo**:

- Detecta automáticamente los repos en `cwd` (busca `.git/`, `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc. 1–2 niveles deep)
- Te deja seleccionar cuáles incluir y añadir paths manuales
- Sniff del provider AI: probe real de `claude` en PATH → `claude-code`; probe de `ANTHROPIC_API_KEY` → `claude`; probe de Ollama local → `ollama`
- Selector de modelo provider-aware (lista los modelos realmente disponibles, sin defaults inventados)
- Por cada repo: pide `name` (sugiere basename) y `description` opcional
- **Selector de secciones a generar** (checkbox): Overview, Integraciones, Páginas por servicio, API Reference, Getting Started. Cada sección desmarcada elimina un LLM call entero del run.
- **Selector de modo lean** (recomendado): activa `ai.lean: true` en el yml para ~70% menos input tokens por call.
- Muestra preview del YAML y confirma antes de escribir

¿Prefieres el template estático con placeholders? `repomap init --yes`.

### 3. Revisa `repomap.config.yml`

```yaml
repos:
  - path: ./auth-service
    name: auth
    description: Autenticación, sesiones, JWT
  - path: ./payments-service
    name: payments
    description: Pasarela de pagos y facturación
  - path: ./api-gateway
    name: api-gateway
    description: Punto de entrada HTTP unificado
  - path: ./frontend
    name: frontend
    description: SPA del cliente

output:
  path: ./repomap-docs    # dónde se escribirá el sitio
  format: html            # html | markdown | json

ai:
  provider: claude-code   # claude-code | claude | ollama
  model: sonnet           # 'sonnet' (rápido) | 'opus' (mejor calidad)
  maxBudgetUsd: 1.00      # tope de gasto por llamada (solo claude-code)

language: es              # 'es' | 'en'
watch: false              # cambia a true para auto-update en cambios de código
```

### 4. Genera la documentación

```bash
repomap generate
```

Tarda **1–5 minutos** dependiendo del tamaño de los repos y del provider/strategy. Verás progreso en tiempo real con un header que estima input/output tokens, número de calls y ETA wall-clock:

```
✔ Grafo construido: 307 nodos · 431 edges · 4 HTTP relations
  → ~16.3K in + ~8.3K out tokens · 1 call · sonnet · single · apiReference: off · ETA 2m 22s
⠋ Esperando respuesta del modelo… 1m 04s / ETA 2m 22s
```

En modo `parallel`:

```
✔ Grafo construido: 307 nodos · 431 edges · 4 HTTP relations
  → ~65.2K in + ~8.3K out tokens · 8 calls · sonnet · parallel · apiReference: off · ETA 56s
⠋ overview          ▶ corriendo  · sonnet
✔ getting-started   ✔ 18s        · haiku
✔ integrations      ✔ 22s        · haiku
✔ service: auth     ✔ 14s        · haiku
✔ service: payments ✔ 17s        · haiku
✔ Documentación recibida en 2m 47s · $0.18
  Output: /Users/yo/workspaces/mi-plataforma/repomap-docs
```

El ETA se calcula como `output_tokens / throughput_modelo` (haiku ≈ 120 tok/s, sonnet ≈ 60 tok/s, opus ≈ 35 tok/s) más overhead por call. Si el elapsed pasa de **1.5× ETA**, aparece un hint "tardando más de lo normal — revisa tu cuota"; a **3× ETA** sugiere `Ctrl+C`.

**Qué ocurre internamente:**

1. Para cada repo: `graphify pipeline.py` extrae AST (sin LLM, segundos)
2. `graphify merge-graphs` fusiona los grafos en uno cross-repo
3. Detectores estáticos buscan llamadas HTTP entre servicios (`fetch('http://payments/...')`, `PAYMENTS_SERVICE_URL`, `docker-compose.yml`, etc.)
4. Solo el esqueleto resultante (~5% de tu código real) se envía al LLM
5. Según el adapter, una sola llamada (`single`) o varias en paralelo con prompt caching (`parallel`, ver [Coste y rendimiento](#coste-y-rendimiento))
6. Se escribe el sitio HTML/Markdown/JSON

### 5. Abre la documentación

```bash
repomap serve
```

Arranca un server local en <http://localhost:4040> con live-reload y abre el browser automáticamente. Ctrl+C para parar.

Banderas útiles:
- `--port 9090` — otro puerto
- `--host 0.0.0.0` — exponer a la LAN (avisa con warning explícito)
- `--no-open` — no abre el browser
- `--no-reload` — desactiva live-reload

---

## Comandos

| Comando | Qué hace | Llama al LLM |
|---------|----------|:-:|
| `repomap init` | Init interactivo (detección de repos + sniff de provider). `--yes` para template estático | ❌ |
| `repomap generate` | Pipeline completo: analizar + LLM + escribir output | ✅ |
| `repomap render` | Solo regenera HTML desde el cache (`./repomap-docs/data/knowledge.json`). Útil para iterar diseño sin gastar tokens | ❌ |
| `repomap watch` | Vigila cambios de archivos y actualiza solo lo afectado | ✅ parcial |
| `repomap serve` | Server HTTP local + live-reload + abre browser | ❌ |
| `repomap doctor` | Diagnóstico completo: Node, graphify, config, repos, AI provider, output dir | ❌ |
| `repomap clean` | Borra caches generados (`data/`, `graphify/`, `.repomap-debug/`). `--all` para el sitio completo | ❌ |
| `repomap status` | Resumen del workspace: config, repos, last generate, tamaño del cache, debug dumps | ❌ |
| `repomap hooks install` | Instala `post-merge` git hook en cada repo del config para auto-regenerar | ❌ |
| `repomap hooks uninstall` | Quita los hooks instalados por repomap | ❌ |
| `repomap hooks status` | Muestra qué repos tienen el hook instalado | ❌ |

### Banderas globales útiles

- `-c, --config <ruta>` — usar un yml en otra ruta
- `-r, --repos <p1> <p2>` — saltarse el yml y pasar repos por flag
- `--lang es|en` — sobrescribir idioma
- `-v, --verbose` — info extra (adapter, model, paths)
- `--debug` — dumpea grafo, prompts y respuesta cruda a `<output>/.repomap-debug/<timestamp>/`
- `--strategy parallel|single` — fuerza la estrategia del adapter
- `--with-api-ref` / `--no-api-ref` — incluye/omite la sección "API reference" por servicio (~4–5K output tokens/servicio)
- `--model-fast <modelo>` — modelo usado para sub-secciones paralelas (default: `haiku` con Claude)

---

## Configuración (`repomap.config.yml`)

Esquema completo, todos los campos opcionales salvo `repos`, `output` y `ai`:

```yaml
repos:
  - path: ./service-a       # ruta al repo (relativa o absoluta)
    name: service-a         # nombre corto, aparece en la sidebar
    description: ...        # opcional, hint extra para el LLM

output:
  path: ./repomap-docs      # directorio destino
  format: html              # html | markdown | json

ai:
  provider: claude-code     # claude-code | claude | ollama
  model: sonnet             # alias 'sonnet'/'opus'/'haiku' o ID completo
  modelFast: haiku          # modelo barato para sub-secciones paralelas (default per provider)
  apiKey: <opcional>        # solo para provider 'claude' (alternativa a ANTHROPIC_API_KEY)
  baseUrl: <opcional>       # solo para provider 'ollama' (default: http://localhost:11434)
  binary: claude            # solo claude-code: ruta al binario si no está en PATH
  maxBudgetUsd: 1.00        # solo claude-code: tope de gasto por llamada
  apiReference: false       # legacy — preferí ai.sections.apiReference (default: false)
  strategy: parallel        # parallel | single (default per adapter)

  # ── Optimización del prompt (opt-in, default = comportamiento legacy) ─────
  lean: true                # skill destilado + schema compacto + budget reducido (~70% menos input tokens)
  budget: 8000              # tope aproximado de tokens para compactForLLM (default: 20000 / 8000 con lean)
  skillSections: auto       # auto (subset por tipo de call) | full (legacy) | [lista explícita]

  # ── Qué páginas generar (omitir reduce 1 LLM call cada una) ──────────────
  sections:
    overview: true          # página principal
    integrations: true      # diagrama y flujos cross-service
    services: true          # una página por repo
    apiReference: false     # símbolos exportados con firmas (~30% más output tokens)
    gettingStarted: auto    # auto (omite si >8 servicios) | true | false

language: es                # idioma de la doc generada: en | es
watch: false                # si true, `generate` queda en modo watch al terminar
```

Las flags de la CLI tienen precedencia sobre los valores del yml.

### Modo lean (recomendado)

Activar `ai.lean: true` aplica tres optimizaciones combinadas:

1. **Skill destilado por sección**: en lugar del playbook completo (~20K tokens), cada call (overview / per-service / getting-started) carga solo las referencias que necesita desde `references/_compact/*.md` — versiones condensadas a ~30% del tamaño original sin perder reglas mecánicas.
2. **Schema TypeScript-like**: el contrato de output se emite como `type X = { … }` inline (~2K chars) en vez de JSON pretty-printed con ejemplos (~5K chars).
3. **Budget adaptativo**: `compactForLLM` cae de 20K → 8K tokens objetivo, con caps más estrictos (12 archivos vs 25, 5 símbolos vs 8, etc.) y ranking que prioriza archivos que respaldan endpoints o tienen tag de framework (`@RestController`, etc.).

**Impacto medido** en un workspace de 6 paquetes: input cae de ~26K → ~16K tokens en single mode, ~30% más rápido. En modo parallel + lean + skip gettingStarted: ~55K → 7 calls vs 65K → 8 calls. Para proyectos grandes (15+ repos) el ahorro compone aún más.

---

## Presets — rendimiento vs calidad

repomap por defecto deja casi todo desactivado para ser conservador. Si te cuesta tokens o tarda demasiado, no es bug — es que falta opt-in. Estos tres presets cubren el 95% de los casos. Pégalos tal cual en tu `repomap.config.yml`.

> **El default más importante:** `provider: claude-code` cae a `strategy: single` (una sola call gigante). Para multi-repo medianos+, **siempre** querés `strategy: parallel`. Lo confirma el código: `packages/adapters/claude-code/src/index.ts:187`.

### ⭐ Recomendado si usás Claude Code (Pro/Max)

Si ya estás autenticado en Claude Code, este es **el** preset: maximiza calidad donde se nota (overview con Sonnet, skill completa de referencia para integrations) y exprime rendimiento donde no se nota (services en Haiku, lean por defecto, sin api-ref). Coste: $0 — todo va contra tu suscripción.

```yaml
ai:
  provider: claude-code
  model: sonnet             # overview + integrations con Sonnet
  modelFast: haiku          # 1 call por servicio + getting-started con Haiku
  strategy: parallel        # opt-in obligatorio — claude-code default es 'single'
  lean: true                # skill destilada (~30% del tamaño) + schema TS-like + budget 8K
  apiReference: false       # off salvo que documentés una librería/SDK público
  sections:
    overview: true
    integrations: true
    services: true
    apiReference: false
    gettingStarted: auto    # se incluye si tenés ≤8 repos
```

Equivalente por CLI si no querés tocar el yml (los flags ganan sobre el config):

```bash
repomap generate --strategy parallel --model-fast haiku --no-api-ref
```

**Por qué estos valores específicamente para `claude-code`:**

- **`strategy: parallel`** — Sin esto cae a `single`, que es una sola llamada con todo el grafo + skill entera a Sonnet. Es exactamente lo que te estaba quemando tokens y tiempo.
- **`modelFast: haiku`** — Las páginas per-service son ~70% del trabajo total; mandarlas a Haiku baja la latencia ~3× sin que se note en la prosa (overview e integrations, lo "narrativo", queda en Sonnet).
- **`lean: true`** — `claude -p` no expone prompt caching por flag (ver comentario en `packages/adapters/claude-code/src/index.ts:183-186`), así que cada sub-call paga el system prompt entero. Lean compensa eso recortando ~60% del input por call.
- **`apiReference: false`** — Añade ~4–5K output tokens por servicio. Solo vale la pena si tu repo es una librería pública con símbolos exportados que el consumidor va a importar.
- **`gettingStarted: auto`** — Para workspaces de ≤8 repos se genera (mejor onboarding); arriba de eso se omite porque el contenido se vuelve repetitivo.

**Resultado esperado en un workspace típico (6 repos, ~800 nodos):** ~8–12 min wall-clock, ~50K input + ~7K output tokens distribuidos entre 7–8 sub-calls. Con `strategy: single` (el default que tenés ahora) la misma generación toma 20+ min y consume ~3× más tokens en una sola call gigante.

### 🏎️ Máximo rendimiento (más rápido + más barato)

Úsalo cuando: vas a iterar varias veces, el workspace tiene 4+ repos, o estás en CI con presupuesto.

```yaml
ai:
  provider: claude-code     # o 'claude' si tenés API key (~3× más rápido por caching real)
  model: sonnet             # overview con Sonnet — single source of truth narrativa
  modelFast: haiku          # services + getting-started con Haiku (~10× más barato)
  strategy: parallel        # 1 call secuencial + N en paralelo
  lean: true                # skill destilada + schema compacto + budget 8K
  apiReference: false       # ya es default, lo dejamos explícito
  sections:
    gettingStarted: false   # opcional: ahorra 1 call si tu README ya cubre onboarding
```

Equivalente por flags (sin tocar el yml):

```bash
repomap generate --strategy parallel --model-fast haiku --no-api-ref
# (lean y sections.* solo se pueden setear desde el yml)
```

Resultado típico (6 paquetes, ~800 nodos): **~1 min con `claude` API**, **~10 min con `claude-code` CLI** (paga prefix sin caching), ~60–70% menos tokens que el default.

### 💎 Máxima calidad (prosa más rica, todo el detalle)

Úsalo cuando: es la doc "oficial" del equipo, repo de librería/SDK pública, o vas a publicarla en GitHub Pages.

```yaml
ai:
  provider: claude          # API directa — habilita prompt caching real
  model: sonnet             # o 'opus' si tu cuota lo permite
  modelFast: sonnet         # también Sonnet en sub-secciones (sin downgrade a Haiku)
  strategy: parallel
  lean: false               # playbook completo del skill (~20K tokens de guía)
  apiReference: true        # tabla de símbolos exportados por servicio
  sections:
    overview: true
    integrations: true
    services: true
    apiReference: true
    gettingStarted: true    # forzar (no 'auto') aunque tengas muchos repos
```

Equivalente por flags:

```bash
repomap generate --strategy parallel --model-fast sonnet --with-api-ref
```

Trade-off: ~3–4× más caro y ~2× más tokens que el preset rápido. La diferencia se nota en analogías más afinadas, ejemplos con más contexto, y la API reference con firmas.

### ⚖️ Balance recomendado (default sugerido)

El sweet spot. Calidad alta donde importa (overview + integrations en Sonnet) y barato donde no se nota (per-service en Haiku, sin api-ref).

```yaml
ai:
  provider: claude-code
  model: sonnet
  modelFast: haiku
  strategy: parallel
  lean: true
  apiReference: false
  # sections.gettingStarted queda en 'auto': se incluye si tenés ≤8 repos
```

Este es el preset que la sección "Quickstart" asume implícitamente. Si tu config es solo `provider: claude-code` + `model: sonnet`, te falta `strategy: parallel` + `lean: true` + `modelFast: haiku` — y eso es justo lo que dispara el gasto.

### Tabla comparativa

| Eje | 🏎️ Rendimiento | ⚖️ Balance | 💎 Calidad |
|---|---|---|---|
| `strategy` | `parallel` | `parallel` | `parallel` |
| `model` (overview) | `sonnet` | `sonnet` | `sonnet` u `opus` |
| `modelFast` (services) | `haiku` | `haiku` | `sonnet` |
| `lean` | `true` | `true` | `false` |
| `apiReference` | `false` | `false` | `true` |
| `gettingStarted` | `false` | `auto` | `true` |
| Input tokens (6 repos) | ~50K | ~55K | ~95K |
| Output tokens | ~7K | ~8K | ~14K |
| Tiempo con `claude` API | ~50 s | ~1 min | ~2 min |
| Coste con `claude` API | ~$0.18 | ~$0.22 | ~$0.45 |
| Coste con `claude-code` Pro/Max | $0 | $0 | $0 |

> **Si usás `provider: ollama`:** la única perilla que mueve la aguja es `lean: true` + `sections.gettingStarted: false` + `sections.apiReference: false`. `strategy: parallel` no aporta mucho porque Ollama no tiene prompt caching y serializa internamente.

### ¿Cuál elijo si tengo dudas?

- **Es tu primer `generate`** → preset **Balance**, vé el resultado, ajustá después.
- **Vas a publicarla a usuarios externos** → preset **Calidad**.
- **CI corre cada PR o tenés 10+ repos** → preset **Rendimiento**.
- **`generate` te está quemando tokens AHORA** → cambiá a preset **Rendimiento** y volvé a correr.

---

## Iterar sin volver a llamar al LLM

Después del primer `generate`, queda cacheado todo en `./repomap-docs/data/knowledge.json`. Si solo cambia el **diseño** (CSS, plantillas HTML, traducciones), no hace falta pagar otro LLM call:

```bash
repomap render
```

Regenera todas las páginas HTML desde el cache en <1 segundo. Recarga el browser (Cmd+Shift+R) y listo.

Solo necesitas `generate` cuando cambia el **código** de los repos analizados.

---

## Auto-actualización (watch + hooks)

### Watch mode

```bash
repomap watch
```

Detecta el archivo modificado, vuelve a correr graphify en modo incremental (solo AST, gratis), pide al LLM que actualice **solo la sección afectada** (no toda la doc) y reescribe el HTML.

Flags útiles:
- `--debounce 1500` — ms de espera tras el último cambio antes de regenerar
- `--ignore "pattern" ...` — patrones extra para ignorar (chokidar globs). Se añaden a los defaults: `node_modules`, `.git`, `dist`, `build`, `graphify-out`

### Git hooks (post-merge)

Para regenerar la doc automáticamente cuando hagas `git pull`/`merge` en cualquiera de los repos vigilados:

```bash
repomap hooks install      # instala post-merge en cada repo del config
repomap hooks status       # muestra qué repos tienen el hook
repomap hooks uninstall    # los quita
```

`hooks install --force` sobrescribe hooks no instalados por repomap (pide confirmación).

---

## Salida

```
repomap-docs/
├── index.html                       overview, arquitectura, analogía
├── getting-started/index.html       tutorial + troubleshooting
├── integrations/index.html          conexiones HTTP detectadas, flujos, grafo
├── <service-a>/index.html           página por servicio
├── <service-b>/index.html
├── graphify/
│   ├── index.html                   dashboard de grafos
│   ├── cross-repo-graph.json        grafo merged completo
│   └── <service-a>/graph.html       grafo interactivo por servicio (vis.js)
└── data/knowledge.json              cache para `render` y `watch`
```

Cada página tiene:
- **Sidebar izquierdo** con servicios
- **Contenido** con secciones h2/h3
- **TOC derecho** "En esta página" con anchors y scroll-spy (solo ≥1280px)
- **Diagramas Mermaid** con botón "Expandir" → modal fullscreen con pan/zoom
- **Bloques de código** con syntax highlighting y botón "Copiar"
- **Tree de archivos** del servicio

> **Tus repos quedan intactos.** repomap no escribe nada dentro de los repos analizados — todo el cache, grafos y outputs viven bajo `output.path`. Solo añade `repomap-docs/` (o el path que hayas elegido) al `.gitignore` del directorio donde corres repomap.

### Formato Markdown

Con `output.format: markdown`, repomap escribe README + integrations + página por servicio + getting-started en `.md` plano, compatible con Notion, Obsidian, GitBook y MkDocs.

---

## Detectores: qué identifica repomap

| Qué detecta | Cómo |
|------------|------|
| Endpoints HTTP por servicio | regex sobre Express/Fastify/NestJS/Flask/FastAPI **+ Spring `@(Get\|Post\|Put\|Patch\|Delete)Mapping` y `@RequestMapping` con base path de clase** |
| Eventos publicados / consumidos | `.emit/.publish/.send('event-name', ...)` **+ Google Pub/Sub `Publisher.newBuilder(topicVar)`, Kafka `@KafkaListener` + `kafkaTemplate.send`, RabbitMQ `@RabbitListener` + `rabbitTemplate.convertAndSend`, JMS `@JmsListener` + `jmsTemplate.convertAndSend`, Spring `applicationContext.publishEvent(new X(...))` + `@EventListener(X.class)`** |
| Variables de entorno con URLs | parsing de `.env*` **+ Spring `application*.{yml,properties}` y `bootstrap*` (cualquier key `url`/`host`/`endpoint`/`uri` con valor `${ENV_VAR}` o `${ENV_VAR:default}`)** |
| Mapeos servicio↔host | `docker-compose.yml` (services + environment) |
| Llamadas HTTP entre servicios | `fetch`, `axios`, `got`, `ky`, `requests`, `httpx` con URL literal o `${SERVICE_URL}` **+ Java: `RestTemplate.{exchange,getForObject,postForObject,…}`, `WebClient.create/builder().baseUrl`, `@FeignClient(url=…)`, `new Request.Builder().url(…)` (OkHttp), `new HttpGet/HttpPost(…)` (Apache HttpClient). Sigue el chain `@Value("${prop}") → field assign → local concat` para resolver el primer arg.** |
| Estructura de carpetas | filesystem walk filtrado (excluye `node_modules`, `dist`, `build`, `target`, `src/test`, `.git`, `coverage`) |
| Símbolos (clases, funciones, imports, calls) | AST nativo de graphify (~12 lenguajes) |
| Metadata del proyecto | `package.json`, `pyproject.toml`, `go.mod`, **`build.gradle`/`build.gradle.kts` + `settings.gradle`, `pom.xml`** |
| Comunidades / clusters | algoritmo de graphify sobre el grafo merged |

Para que las conexiones HTTP se detecten bien, conviene que:

- Los servicios se llamen entre sí con URLs que contengan el nombre del servicio (`http://payments/...`), **o**
- Las URLs vengan de env vars con convención `<NOMBRE>_SERVICE_URL` / `<NOMBRE>_URL` / `<NOMBRE>_API_URL`
- Si usas `docker-compose.yml`, el `name` del repo en `repomap.config.yml` idealmente coincide con el nombre del servicio en compose

---

## Coste y rendimiento

**Por qué es barato en tokens:** la extracción AST + la detección estática son 100% Python/Node sin LLM. El LLM solo recibe un resumen estructural compacto (~5–15K tokens de input) y devuelve la documentación (~5–10K tokens de output).

### Estrategias de generación

| Strategy | Cuándo se usa | Comportamiento |
|----------|---------------|----------------|
| `parallel` | Default en `claude` (API). Aprovecha prompt caching | Lanza la sección "overview" con el modelo principal y dispara servicios + getting-started + integrations en paralelo con un modelo barato (`modelFast`, default `haiku`) |
| `single` | Default en `claude-code` y `ollama` | Una sola llamada que devuelve toda la doc JSON |

Por defecto la API reference por servicio está **off** (`apiReference: false`) — ahorra ~4–5K output tokens/servicio. Actívala con `--with-api-ref` para repos que son librerías/SDK públicos.

### Coste típico

Medido sobre un workspace de 6 paquetes (~800 nodos graphify, ~15K chars de compact graph). El input incluye system+user prompts sumados a través de todos los calls; el output es la Documentation JSON producida.

| Setup | Input tok | Output tok | Calls | Tiempo | Coste |
|-------|----------:|-----------:|------:|-------:|------:|
| `claude-code` + Pro/Max, single, **lean** | ~16K | ~8K | 1 | ~3 min | $0 (subscripción) |
| `claude-code` + Pro/Max, single, lean + apiRef | ~16K | ~14K | 1 | ~5 min | $0 (subscripción) |
| `claude-code` + Pro/Max, single, legacy | ~26K | ~8K | 1 | ~3 min | $0 (subscripción) |
| `claude` API, parallel + **lean** | ~65K | ~8K | 8 | ~1 min | ~$0.22 (con cache) |
| `claude` API, parallel + lean + apiRef | ~67K | ~14K | 8 | ~1.5 min | ~$0.30 (con cache) |
| `claude` API, parallel, legacy | ~95K | ~8K | 8 | ~1 min | ~$0.25 (con cache) |
| `ollama` (local) | varía | varía | 1 | 5–15 min | $0 |

**Para repos grandes (15+ servicios)** el modo lean ahorra mucho más en proporción — el skill cacheado deja de duplicarse innecesariamente entre calls. Para repos chicos (1–2 paquetes) la diferencia es marginal.

> Tu shell tip: `repomap status` muestra el último coste, tokens y tamaño del cache.

---

## GitHub Action

Para correr repomap en CI y mantener la doc al día sin trabajo manual:

```yaml
- uses: Yeinthony/repomap@v1
  with:
    config-path: repomap.config.yml
    output-path: ./repomap-docs
    ai-provider: claude
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

La action instala Node, Python, graphify y `@repomap/cli`, corre `repomap doctor` como verificación y luego `repomap generate` con los flags que pases.

Ejemplo completo en [`examples/github-actions/repomap.yml`](./examples/github-actions/repomap.yml) — incluye tres opciones para qué hacer con el output: commit-back al mismo branch, abrir PR para review, o publicar en GitHub Pages.

---

## Cómo funciona internamente (resumen técnico)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ repo A       │    │ repo B       │    │ repo C       │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │ graphify pipeline.py (AST, sin LLM)   │
       ▼                  ▼                    ▼
   graph.json         graph.json           graph.json
       │                  │                    │
       └─────────┬────────┴────────────────────┘
                 ▼
        graphify merge-graphs
                 │
                 ▼
       cross-repo-graph.json
                 +
    detectores HTTP/env/docker
                 │
                 ▼
        compactForLLM (resumen tokens-eficiente)
                 │
                 ▼
   adapter (claude-code | claude | ollama)
   ├─ strategy: single  → 1 llamada
   └─ strategy: parallel → overview (sonnet) + N sub-llamadas (haiku) con prompt caching
                 │
                 ▼
        Documentation JSON
                 │
                 ▼
        HTML / Markdown / JSON
```

---

## Arquitectura del repo

Monorepo con [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces):

```
packages/
├── core/                       # @repomap/core — orquestador, graphify, detectores, render
├── cli/                        # @repomap/cli  — comandos, prompts interactivos
└── adapters/
    ├── claude/                 # @repomap/adapter-claude       — Anthropic SDK + ANTHROPIC_API_KEY
    ├── claude-code/            # @repomap/adapter-claude-code  — usa el binario local `claude`
    └── ollama/                 # @repomap/adapter-ollama        — server local Ollama, $0
```

### Stack

- **TypeScript** (ESM, NodeNext)
- **CLI**: `commander`, `@inquirer/prompts`, `listr2`, `chalk`, `ora`
- **Pipeline graphify** invocado vía `python -m` (interpreter discovery automático)
- **HTML generado** con templates inline, sin framework; Mermaid + highlight.js + vis.js desde CDN
- **Sin runtime extra**: el sitio generado es HTML estático, servible desde cualquier hosting

### Scripts del workspace

```bash
npm run build         # build de todos los packages en orden
npm run dev           # tsx watch sobre packages/cli
npm test              # jest
npm run pack:dry      # npm pack --dry-run para verificar el publish
npm run publish:all   # publica los 5 paquetes (requiere npm login)
```

---

## Troubleshooting

**`'graphify' CLI not found on PATH`**
→ No instalaste graphify, o tu shell no lo encuentra. `pipx install graphifyy` y verifica con `which graphify`.

**`'claude' (Claude Code CLI) not found on PATH`** (al usar `provider: claude-code`)
→ Instala Claude Code desde <https://claude.com/code> y autentícate con `claude auth`.

**`You've hit your limit · resets HH:MMpm`** durante `generate`
→ Tu cuota de Claude Code se agotó. Espera al reset o cambia temporalmente a `provider: claude` con `ANTHROPIC_API_KEY`.

**El HTML no cambia después de editar templates**
→ Cache del browser. Cmd+Shift+R (hard reload) en macOS.

**El TOC derecho ("En esta página") no aparece**
→ Solo se muestra en ventanas ≥1280px. Pantallas más chicas usan layout 2 columnas.

**Las conexiones HTTP detectadas son 0**
→ Tus servicios no se llaman por URL/env-var con convenciones reconocidas. Considera:
- Añadir `docker-compose.yml` con `services:` definidas
- O usar env vars `<NOMBRE_SERVICIO>_SERVICE_URL`
- Las llamadas con strings construidos dinámicamente no se detectan — repomap solo capta literales

**Los archivos compilados (`.js`, `.d.ts`) aparecen en el tree de un servicio TS**
→ Hay artefactos de build sueltos en `src/`. Limpia con:
```bash
find <repo>/src -name '*.d.ts' -o -name '*.js' -o -name '*.js.map' | xargs rm
```

**Para diagnóstico completo:** `repomap doctor` valida Node, graphify, config, repos, AI provider, output dir y reporta cada problema con su fix.

---

## Soporte Java / Spring Boot

repomap soporta proyectos Java/Spring Boot de primera clase. Los detectores reconocen los patrones idiomáticos de Spring (anotaciones, `@Value` chains, `application.yml`, Gradle/Maven) y generan los mismos artefactos cross-repo que para JS/Python: HttpRelations entre servicios, endpoints REST, eventos publicados/consumidos y metadata de proyecto.

### Frameworks y clientes soportados

| Categoría | Lo que se detecta |
|----------|------------------|
| **Web** | Spring MVC / Spring Boot: `@RestController`, `@(Get\|Post\|Put\|Patch\|Delete)Mapping`, `@RequestMapping` (incluyendo `method = RequestMethod.X`, `method = {GET, POST}`, y combinación con base path a nivel de clase) |
| **HTTP clients** | `RestTemplate` (`exchange`, `getForObject`, `postForObject`, `getForEntity`, `postForEntity`, `put`, `delete`, `patchForObject`), `WebClient.create()` / `WebClient.builder().baseUrl()`, `@FeignClient(url = …)`, OkHttp `new Request.Builder().url(…)`, Apache HttpClient `new HttpGet/HttpPost(…)` |
| **Messaging — publishers** | Google Cloud Pub/Sub `Publisher.newBuilder(topicVar)`, Kafka `kafkaTemplate.send`, RabbitMQ `rabbitTemplate.convertAndSend/send`, JMS `jmsTemplate.send/convertAndSend`, Spring application events `(publisher\|context).publishEvent(new X(…))` |
| **Messaging — subscribers** | `@KafkaListener(topics = …)`, `@RabbitListener(queues = …)`, `@JmsListener(destination = …)`, Spring Cloud GCP `@PubSubListener(subscription = …)`, Spring `@EventListener(X.class)` |
| **Config** | `application*.{yml,yaml,properties}` y `bootstrap*` — cualquier propiedad cuya key termine en `url`/`host`/`endpoint`/`uri` con valor `${ENV_VAR}` / `${ENV_VAR:default}` se vuelve un mapping resolvible |
| **Build / metadata** | Gradle (`build.gradle`, `build.gradle.kts`, `settings.gradle`) — `group`, `version`, `rootProject.name`, plugin Spring Boot version, dependencies de producción (`implementation`, `api`, `compileOnly`, `runtimeOnly`, `developmentOnly`; excluye `test*` y `annotationProcessor`). Maven (`pom.xml`) — `<groupId>`, `<artifactId>`, `<version>`, `<description>`, parent Spring Boot, dependencies (excluye `<scope>test</scope>`) |

### Cómo se resuelven los URLs entre servicios

El patrón más común en Spring inyecta el host base vía `@Value("${some.prop.url}")` y luego concatena con un sufijo dentro del método:

```java
@Value("${core-catalog.base-url}") String externalServiceBaseUrl  // ← prop name
baseUrl = externalServiceBaseUrl;                                  // ← field assign
String url = baseUrl + uri;                                        // ← local concat
restTemplate.exchange(url, method, ...);                           // ← actual call
```

repomap traza ese chain de 4 saltos:

1. **`application.yml`** → `core-catalog.base-url: ${CATALOG_CORE_SERVICE_URL}` → mapping `core-catalog.base-url → CATALOG_CORE_SERVICE_URL`
2. **`@Value` annotation** → variable `externalServiceBaseUrl → CATALOG_CORE_SERVICE_URL`
3. **Field assignment** (incluyendo formas `ClassName.field = paramName`) → propagación transitiva
4. **Local concatenation** `String url = baseUrl + …` → `url → CATALOG_CORE_SERVICE_URL`
5. **HTTP call**: el primer arg `url` se resuelve a `${CATALOG_CORE_SERVICE_URL}` con `envVarHint`

El env var resultante se cruza luego con los nombres de tus repos (`guessRepoFromEnvVar` busca `*_URL`, `*_SERVICE_URL`, `*_API_URL`, etc.) para dibujar la HttpRelation cross-repo.

### Patrones que conviene conocer

**Para que las HttpRelations crucen entre repos**, tu workspace necesita los servicios target como repos en `repomap.config.yml`. Por ejemplo, si tu app talks a `${CATALOG_CORE_SERVICE_URL}`, debe haber un repo con nombre `catalog-core-service` (o similar — el matcher acepta `CATALOG`, `CATALOG_CORE`, `CATALOG_SERVICE`, etc.). Si solo apuntas a un repo aislado, las llamadas se detectan pero no se grafican como edges entre nodos.

**Control flow dinámico** (`if (x) url = otherBase + uri`) no se puede seguir con regex. Cuando un archivo Java declara N bases `@Value`-bound y al menos una llamada HTTP, repomap emite un fallback por base para garantizar que TODAS las dependencias del archivo queden representadas — aunque el `if/else` use solo una de ellas en runtime.

**HTTP method inference**: para `restTemplate.{getForObject,postForObject,…}` el método viene en el nombre. Para `restTemplate.exchange()` se busca `HttpMethod.X` literal en el 2º arg. Si el método viene como variable (`HttpMethod method = HttpMethod.POST; ... exchange(url, method, …)`), la inferencia falla y la relación se emite sin método — el LLM puede leer el código para deducirlo.

**`src/test/**` y `target/**` se excluyen** de todos los scans (Spring/Gradle/Maven convention). Los tests no son parte del runtime documentado.

### Limitaciones conocidas

- Solo `application*.yml/.yaml/.properties` y `bootstrap*` — no parsea archivos custom de config.
- WebClient: no se sigue el builder chain para combinar `baseUrl + .uri(path)` cuando se setean en pasos separados.
- `@EventListener` sin arg explícito (con el tipo del parámetro): no se detecta. Usa `@EventListener(SomeEvent.class)` para ser explícito.
- Lombok-generated constructors: el detector reconoce `@Value` en parámetros independientemente de quién genere el constructor, así que esto funciona en la práctica.

---

## Roadmap

- [x] Parser principal (TS/JS, Python, Go, Java, Ruby vía graphify AST)
- [x] Adaptador para Claude Code (sin API key)
- [x] Adaptador para Claude API
- [x] Adaptador para Ollama (local, privado, sin API key)
- [x] HTML output con Mermaid pan/zoom, TOC, syntax highlighting, file tree
- [x] Markdown output (Notion/Obsidian/GitBook/MkDocs compatible)
- [x] Comando `render` para iterar diseño sin gastar tokens
- [x] `repomap doctor`, `clean`, `status`, `hooks install`
- [x] Live-reload en `serve`
- [x] GitHub Action
- [x] `repomap init` interactivo con detección de repos y sniff de provider
- [x] Generación paralela con prompt caching y sub-modelo barato (Haiku)
- [x] Flag `--with-api-ref` para repos tipo librería/SDK
- [x] Detectores Spring/Java — endpoints, RestTemplate/WebClient/Feign/OkHttp/Apache HttpClient, eventos Pub/Sub/Kafka/Rabbit/JMS/Spring, `application.yml`, metadata Gradle/Maven (ver [Soporte Java / Spring Boot](#soporte-java--spring-boot))
- [x] **Modo lean** — `ai.lean: true` aplica skill destilado + schema compacto + budget reducido (~70% menos input tokens). Wizard `init` ofrece activarlo (default recomendado)
- [x] **Selector de secciones** — `ai.sections.{overview,integrations,services,apiReference,gettingStarted}` permite omitir páginas. Cada sección desmarcada elimina un LLM call. Wizard `init` lo pregunta vía checkbox
- [x] **ETA y telemetría real** — header `~X in + ~Y out · N calls · ETA Zm` y línea de espera `elapsed / ETA Zm` con thresholds adaptativos
- [x] **`max_tokens` dinámico en el adapter `claude` API** — escala con `repos × apiRef` hasta 32K para evitar truncación silenciosa
- [ ] Adaptador para Gemini (usa la integración nativa de graphify)
- [ ] Adaptador para OpenAI
- [ ] Sistema de temas
- [ ] Chat embebido "Pregúntale a los docs"

---

## Performance bottlenecks pendientes (referencia para contribuir)

Auditoría del pipeline de junio 2026. Los 3 quick wins ya están aplicados (max_tokens dinámico, glob con filtro de extensiones, `Promise.all` en `buildCodeGraph`). Los pendientes están priorizados por impacto. Cada uno linkea al archivo y línea donde hay que tocar.

### 🟡 #2 — Workspace dedup (1h, alto impacto en repos chicos)

**Problema**: cuando el config incluye el repo root (`path: .`) junto con sub-paquetes (`path: ./packages/core`, etc.), cada archivo de sub-paquete se escanea **2 veces** — una al procesar el root, otra al procesar el sub-paquete. En el config de prueba (6 entries), ~40% del trabajo de graph-build se desperdicia.

**Dónde**: `packages/core/src/detectors/repo-summary.ts` — antes de cada `fg(...)`, detectar qué paths del config son superset de otros listados y excluirlos del glob de los repos parent. Otra opción: documentar que "no se debería incluir el root junto con sus paquetes" y warn en `repomap doctor`.

### 🟡 #4 — Async IO real (~2h, paraleliza graph-build de verdad)

**Problema**: 71 ocurrencias de `readFileSync` / `writeFileSync` / `existsSync` y **0** de `fs.promises`. El `Promise.all` del `buildCodeGraph` parece paralelo pero todas las funciones internas son sync → en realidad se serializan en el event loop.

**Dónde**: 
- `packages/core/src/detectors/*.ts` — convertir todos los `readFileSync` a `await fs.promises.readFile`
- `packages/core/src/render/html.ts` — convertir los `writeFileSync` a `Promise.all([fs.promises.writeFile(...)])` (escribe 20+ páginas, gran ganancia)
- `packages/core/src/orchestrator.ts:332-339` — `saveKnowledge` escribe ~600KB sync, bloquea la UI al final
- `packages/core/src/render/docs-skill-loader.ts` — `fs.readFileSync` para SKILL.md + refs

Trade-off: refactor grande. Cada función afectada cambia firma, los callers también. Idealmente hacerlo en una sola pasada.

### 🟡 #5 — Walk compartido del filesystem (~2h, monorepo speedup)

**Problema**: cada repo hace 5 walks independientes del filesystem (`detectEndpoints`, `scanRepoForHttp`, `detectLanguages`, `scanRepoExports`, `scanRepoJava`). Para un workspace de 6 repos son 30 walks. Cada walk re-stat-ea los mismos archivos.

**Dónde**: introducir un `FileIndex` en `packages/core/src/detectors/` que se cree una sola vez por repo:

```ts
interface FileIndex {
  byExt: Map<string, string[]>   // '.ts' → ['src/x.ts', ...]
  ymlConfig: string[]
  envFiles: string[]
  packageMeta: PackageMeta | null
}
async function buildFileIndex(repoPath: string): Promise<FileIndex>
```

Cada detector recibe `FileIndex` en vez de hacer su propio glob. Ahorra ~80% del IO de stat. Beneficio máximo en monorepos con muchos repos chicos.

### 🟢 #7 — Cache de `loadDocsSkill` cross-process (~30min)

**Problema**: la cache es in-memory. Cada invocación de `repomap` (CLI fresh start, watch mode, hooks) re-lee y re-parsea el skill (~30KB cuando lean, ~80KB cuando full).

**Dónde**: `packages/core/src/render/docs-skill-loader.ts` — opcionalmente escribir el blob concatenado a `<output>/data/skill-cache-<hash>.txt` cuando se carga, leer si existe y la mtime de los fuentes no cambió. Ganancia es chica (~50ms) pero rápido de implementar.

### 🟢 #8 — `isGraphifyAvailable` se ejecuta por cada `generate` (~10min)

**Problema**: `packages/core/src/graphify/runner.ts:39-45` spawnea `graphify --help` cada vez que se llama `Orchestrator.generate()`. Para watch mode esto es un spawn extra por cambio detectado.

**Dónde**: cachear el resultado en un module-scope `let cached: boolean | null = null` con TTL opcional o limpiable.

### 🟢 #9 — `mergeGraphifyGraphs` siempre spawnea el CLI (~30min)

**Problema**: `packages/core/src/graphify/runner.ts:96-111` spawnea `graphify merge-graphs` aunque las entradas no hayan cambiado.

**Dónde**: chequear `mtime` de cada `graph.json` de input vs el `cross-repo-graph.json` cacheado. Si nada cambió, saltar el spawn (ahorro ~100ms por `generate`).

### 🟢 #10 — HTML render sync (~30min, post-LLM, no critical path)

**Problema**: `packages/core/src/render/html.ts:22-80` escribe páginas con `writeFileSync` secuencial. Para 6 servicios con apiRef son 30+ archivos.

**Dónde**: cambiar el bloque del `for` a `await Promise.all(pages.map(p => fs.promises.writeFile(...)))`. Combinable con #4.

### 🔴 #11 — `claude-code` adapter sin streaming (UX, no perf real)

**Problema**: `packages/adapters/claude-code/src/index.ts:336-362` spawnea `claude -p --output-format json` y espera el envelope completo. Si el modelo tarda 8 min, no hay señal de vida.

**Dónde**: usar `--output-format stream-json --include-partial-messages` (ambos visibles en `claude --help`). El adapter ya parsea el envelope final — habría que añadir un parser de stream que emita progreso al `onProgress` listener. Reduciría hangs aparentes y permitiría timeouts realistas.

### 🟢 #12 — Validar el `lean` apiRef en `claude-code` también

**Problema**: el fix #1 (max_tokens dinámico) solo aplica al adapter `claude` API. Para `claude-code` el cap viene del backend Anthropic (Sonnet 4 = 64K), pero conviene documentar el comportamiento para evitar confusión.

**Dónde**: añadir nota en este README — y eventualmente exponer en el adapter un mecanismo para pasar `--max-budget-usd` calculado dinámicamente como guard rail.

### Calibración del estimador de ETA

Los runs reales mostraron que **claude-code sonnet streamea a ~25-30 tok/s** (no los 60 que asumí). Los estimados están consistentemente bajos por ~2×.

**Dónde**: `packages/core/src/orchestrator.ts` — la función `throughputTokPerSec` necesita ajustar el valor de Sonnet de 60 → 30 cuando el provider es `claude-code` específicamente (la API directa sí da ~60). Mejor aún: hacer la calibración por-provider o aprender empíricamente del último run guardado en `data/knowledge.json`.

---

## Contribuir

PRs bienvenidos. Para cambios mayores, abre primero un issue para discutir el approach.

```bash
git clone https://github.com/Yeinthony/repomap.git
cd repomap
npm install
npm run build
npm test
```

Issues y feedback: <https://github.com/Yeinthony/repomap/issues>

---

## Licencia

[MIT](./LICENSE) © Yeinthony Vargas
