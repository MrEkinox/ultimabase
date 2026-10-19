// Type-only probe of completions at the application rules entry point (never executed).
import { App } from './app.ts'
import { Tag } from './tag.ts'
import { Todo } from './todo.ts'

export const probeApp = (): unknown => new App({ schemas: [Todo, Tag], rules: { Tag: {} } })
