// Optional, once per application: short editor hovers (`WhereBuilder<"Todo">`), as in D (section 9).
import type { ultimabase } from './src/ultimabase.ts'

declare module '../lib/types.ts' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
