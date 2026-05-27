# @repomap/core

Core engine for [repomap](https://github.com/Yeinthony/repomap) — orchestrator, graphify pipeline runner, HTTP/event/env-var detectors, and HTML/Markdown render.

**You probably don't want to install this directly.** End users install [`@repomap/cli`](https://www.npmjs.com/package/@repomap/cli), which depends on this package.

This package is useful if you're building a custom adapter or embedding repomap's pipeline programmatically:

```ts
import { Orchestrator, isGraphifyAvailable, type RepomapConfig } from '@repomap/core'
import { ClaudeCodeAdapter } from '@repomap/adapter-claude-code'

const config: RepomapConfig = { /* ... */ }
const adapter = new ClaudeCodeAdapter({ model: 'sonnet' })
await new Orchestrator(config, adapter).generate()
```

See the [main README](https://github.com/Yeinthony/repomap#readme) for the full picture.

## License

MIT
