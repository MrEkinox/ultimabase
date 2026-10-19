import type { ultimabase } from './ultimabase.ts'

// Once per application, for short hovers (`WhereBuilder<"Todo">`); optional.
declare module '../lib/types.ts' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
