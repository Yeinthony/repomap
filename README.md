# repomap

**Generador de documentación impulsado por IA para proyectos multi-repo.**

Apunta repomap a tus repos, espera 2-3 minutos, obtienes un sitio HTML de calidad framework: overview, página por servicio, integraciones, grafo interactivo y diagramas con pan/zoom.

---

## Qué hace

Te incorporas a un proyecto nuevo. 5 servicios, 3 equipos, cero documentación. Te pasas semanas haciendo ingeniería inversa de cómo se conecta todo.

**repomap lo resuelve.** Analiza tus repos localmente con AST (vía [graphify](https://github.com/anthropics/graphify-y)), detecta llamadas HTTP entre servicios (`fetch`, `axios`, env vars `*_SERVICE_URL`, `docker-compose.yml`), construye un grafo cross-repo y le pasa solo el esqueleto a Claude para que escriba la prosa, los ejemplos y las analogías.

El código nunca se envía completo: solo el grafo estructural (~5% del tamaño real).

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
3. **Un LLM**, una de estas dos opciones:
   - **Claude Code instalado y autenticado** (recomendado — usa tu suscripción Pro/Max, no requiere API key)
     - Descarga: <https://claude.com/code>
     - Verifica con `claude --version`
   - **API key de Anthropic** (alternativa para CI/CD)
     - Obtén la key en <https://console.anthropic.com/settings/keys>
     - Exporta: `export ANTHROPIC_API_KEY="sk-ant-..."`

---

## Instalación

Mientras no haya paquete npm publicado, instalas desde fuente:

```bash
git clone <este-repo> repomap
cd repomap
npm install
npm run build
npm link            # registra el comando `repomap` globalmente
```

Verifica con `repomap --version`.

> Si usas nvm y `repomap` no aparece en otra terminal, asegúrate de tener `nvm use <versión>` en tu `~/.zshrc` o usa el path completo a `node packages/cli/dist/index.js`.

---

## Flujo paso a paso

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

Esto crea `repomap.config.yml` con una plantilla comentada.

### 3. Edita `repomap.config.yml`

Apunta cada `path` a la raíz de un repo. El `name` es como aparecerá en la documentación.

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
  path: ./docs            # dónde se escribirá el sitio
  format: html            # html | markdown | json

ai:
  provider: claude-code   # usa tu Claude Code local. Alt: 'claude' con ANTHROPIC_API_KEY
  model: sonnet           # 'sonnet' (rápido) | 'opus' (mejor calidad, más caro)
  maxBudgetUsd: 1.00      # tope de gasto por llamada (solo claude-code)

language: es              # 'es' | 'en'
watch: false              # cambia a true para auto-update en cambios de código
```

### 4. Genera la documentación

```bash
repomap generate
```

Esto tarda **2-5 minutos** dependiendo del tamaño de los repos. Verás un spinner con feedback en tiempo real:

```
✔ Grafo construido: 307 nodos · 431 edges · 4 HTTP relations
⠋ Esperando respuesta del modelo… 1m 24s
✔ Documentación recibida en 2m 47s
✔ Listo
  Output: /Users/yo/workspaces/mi-plataforma/docs
```

**Qué ocurre internamente:**

1. Para cada repo: `graphify pipeline.py` extrae AST (sin LLM, segundos)
2. `graphify merge-graphs` fusiona los grafos en uno cross-repo
3. Detectores estáticos buscan llamadas HTTP entre servicios (`fetch('http://payments/...')`, `PAYMENTS_SERVICE_URL`, etc.)
4. Solo el esqueleto resultante (~5% de tu código real) se envía al LLM
5. Claude genera overview, página por servicio, integraciones, analogías y diagramas Mermaid
6. Se escribe el sitio HTML

### 5. Abre la documentación

```bash
repomap serve
```

Arranca un server local en <http://localhost:4040> y abre el browser automáticamente. Ctrl+C para parar.

---

## Comandos disponibles

| Comando | Qué hace | Llama al LLM |
|---------|----------|:-:|
| `repomap init` | Crea `repomap.config.yml` con plantilla | ❌ |
| `repomap generate` | Pipeline completo: analizar + LLM + escribir HTML | ✅ |
| `repomap render` | Solo regenera HTML desde el cache (`./docs/data/knowledge.json`). Útil para iterar diseño sin gastar tokens. | ❌ |
| `repomap watch` | Vigila cambios de archivos y actualiza solo lo afectado (incremental, AST puro para code, LLM solo si hay cambios semánticos) | ✅ parcial |
| `repomap serve` | Server HTTP local + abre browser | ❌ |

Banderas globales útiles:
- `--config <ruta>` — usar un yml en otra ruta
- `--repos <p1> <p2>` — saltarse el yml y pasar repos por flag
- `--lang es|en` — sobrescribir idioma

---

## Iterar diseño/textos sin volver a llamar al LLM

Después del primer `generate`, queda cacheado todo en `./docs/data/knowledge.json`. Si solo cambia el **diseño** (CSS, plantillas HTML, traducciones), no hace falta pagar otro LLM call:

```bash
repomap render
```

Esto regenera todas las páginas HTML desde el cache en <1 segundo. Recarga el browser (Cmd+Shift+R en macOS) y listo.

Solo necesitas `generate` cuando cambia el **código** de los repos analizados.

---

## Auto-actualización (watch mode)

Para que la doc se regenere cuando cambies código en cualquiera de los repos vigilados:

```bash
repomap watch
```

Detecta el archivo modificado, vuelve a correr graphify en modo incremental (solo AST, gratis), pide al LLM que actualice **solo la sección afectada** (no toda la doc) y reescribe el HTML.

Para integrar con git hooks:

```bash
# .git/hooks/post-merge
#!/bin/sh
cd /ruta/a/tu/workspace && repomap generate
```

---

## Configuración (`repomap.config.yml`) completa

```yaml
repos:
  - path: ./service-a    # ruta al repo (relativa o absoluta)
    name: service-a      # nombre corto, así aparece en la sidebar
    description: ...     # opcional, hint extra para el LLM

output:
  path: ./docs           # directorio destino
  format: html           # html | markdown | json

ai:
  provider: claude-code  # claude-code | claude
  model: sonnet          # alias 'sonnet'/'opus' o ID completo
  apiKey: <opcional>     # solo para provider 'claude' (alternativa a env var)
  binary: claude         # solo claude-code: ruta al binario si no está en PATH
  maxBudgetUsd: 1.00     # solo claude-code: tope de gasto por llamada

language: es             # idioma de la doc generada
watch: false             # si true, `generate` queda en modo watch al terminar
```

---

## Salida

```
docs/
├── index.html                       overview, arquitectura, analogía
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
- **TOC derecho** "En esta página" con anchors a cada sección y scroll-spy
- **Diagramas Mermaid** con botón "Expandir" → modal fullscreen con pan/zoom
- **Bloques de código** con syntax highlighting y botón "Copiar"
- **Tree de archivos** del servicio

> **Tus repos quedan intactos.** repomap no escribe nada dentro de los repos analizados — todo el cache, grafos y outputs viven bajo `output.path`. Solo añade `repomap-docs/` (o el path que hayas elegido) al `.gitignore` del directorio donde corres repomap.

---

## Detectores: qué identifica repomap

| Qué detecta | Cómo |
|------------|------|
| Endpoints HTTP por servicio | regex sobre Express/Fastify/NestJS/Flask/FastAPI |
| Eventos publicados | `.emit/.publish/.send('event-name', ...)` |
| Variables de entorno con URLs | parsing de `.env*` files |
| Mapeos servicio↔host | `docker-compose.yml` (services + environment) |
| Llamadas HTTP entre servicios | `fetch`, `axios`, `got`, `ky`, `requests`, `httpx` con URL literal o `${SERVICE_URL}` |
| Estructura de carpetas | filesystem walk filtrado |
| Símbolos (clases, funciones, imports, calls) | AST nativo de graphify (~12 lenguajes) |
| Comunidades / clusters | algoritmo de graphify sobre el grafo merged |

Para que las conexiones HTTP se detecten bien, conviene que:
- Los servicios se llamen entre sí con URLs que contengan el nombre del servicio (`http://payments/...`) **o**
- Las URLs vengan de env vars con convención `<NOMBRE>_SERVICE_URL` / `<NOMBRE>_URL` / `<NOMBRE>_API_URL`
- Si usas `docker-compose.yml`, el `name` del repo en `repomap.config.yml` idealmente coincide con el nombre del servicio en compose

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
- O las llamadas son con código generado dinámicamente — repomap solo capta strings literales

**Los archivos compilados (`.js`, `.d.ts`) aparecen en el tree de un servicio TS**
→ Hay artefactos de build sueltos en `src/`. Limpia con:
```bash
find <repo>/src -name '*.d.ts' -o -name '*.js' -o -name '*.js.map' | xargs rm
```

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
        adapter (claude-code | claude)
                 │
                 ▼
        Documentation JSON
                 │
                 ▼
        HTML / Markdown / JSON
```

**Por qué es barato en tokens:** la extracción AST + detección estática es 100% Python/Node sin LLM. El LLM solo recibe un resumen estructural compacto (~5-15K tokens de input) y devuelve la documentación (~5-10K tokens de output). Una corrida típica cuesta $0.05-0.30 con Sonnet.

---

## Stack del propio repomap

- **TypeScript** (ESM, NodeNext)
- **Monorepo** npm workspaces: `@repomap/core`, `@repomap/cli`, `@repomap/adapter-claude`, `@repomap/adapter-claude-code`
- **Pipeline graphify** invocado vía `python -m` (interpreter discovery automático)
- **HTML generado** con templates inline, sin framework; Mermaid + highlight.js desde CDN
- **Sin runtime extra**: el sitio generado es HTML estático, servible desde cualquier lado

---

## Hoja de ruta

- [x] Parser principal (TS/JS, Python, Go, Java, Ruby vía graphify AST)
- [x] Adaptador para Claude Code (sin API key)
- [x] Adaptador para Claude API
- [x] HTML output con Mermaid pan/zoom, TOC, syntax highlighting, file tree
- [x] Comando `render` para iterar diseño sin gastar tokens
- [ ] Adaptador para Gemini (usa la integración nativa de graphify)
- [ ] Adaptador para Ollama (local, privado)
- [ ] Instalador de git hooks (`repomap hooks install`)
- [ ] GitHub Action
- [ ] Sistema de temas
- [ ] Chat embebido "Pregúntale a los docs"

---

## Licencia

MIT
