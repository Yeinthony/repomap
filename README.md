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

Tarda **2–5 minutos** dependiendo del tamaño de los repos y del provider/strategy. Verás progreso en tiempo real (con `listr2` cuando va paralelo):

```
✔ Grafo construido: 307 nodos · 431 edges · 4 HTTP relations
⠋ overview          ▶ corriendo  · sonnet
✔ getting-started   ✔ 18s        · haiku
✔ integrations      ✔ 22s        · haiku
✔ service: auth     ✔ 14s        · haiku
✔ service: payments ✔ 17s        · haiku
✔ Documentación recibida en 2m 47s · $0.18
  Output: /Users/yo/workspaces/mi-plataforma/repomap-docs
```

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
  apiReference: false       # incluye sección "API reference" en cada servicio (default: false)
  strategy: parallel        # parallel | single (default per adapter)

language: es                # idioma de la doc generada: en | es
watch: false                # si true, `generate` queda en modo watch al terminar
```

Las flags de la CLI tienen precedencia sobre los valores del yml.

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

| Setup | Coste por `generate` | Notas |
|------|---------------------|-------|
| `claude-code` + Pro/Max | $0 (incluido en la suscripción) | Tope `maxBudgetUsd` configurable |
| `claude` API, sonnet single | $0.05–$0.30 | Para repos pequeños/medianos |
| `claude` API, sonnet+haiku parallel | $0.10–$0.50 | Más rápido y con mejor cache hit en re-runs |
| `ollama` (local) | $0 | Sin red, sin API key, calidad por debajo de Sonnet |

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
- [ ] Adaptador para Gemini (usa la integración nativa de graphify)
- [ ] Adaptador para OpenAI
- [ ] Sistema de temas
- [ ] Chat embebido "Pregúntale a los docs"

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
