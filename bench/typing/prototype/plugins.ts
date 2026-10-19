// Stand-ins for the plugins the measured models use: each adds its own key
// (D-42) to `defineModel` or to a model's `.with`.
import type { ScalarKeys } from './record.ts'
import type { AnyRule } from './rules.ts'

declare module './register.ts' {
	interface ModelOptionKeys {
		readonly softDelete?: boolean
	}
	interface ModelWithKeys<F> {
		readonly acl?: {
			readonly default?: { readonly read?: AnyRule; readonly write?: AnyRule }
			readonly ownerField?: ScalarKeys<F>
		}
		readonly postgres?: { readonly table?: string }
	}
}
