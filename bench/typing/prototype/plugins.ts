// Stand-ins for the plugins the measured models use: each adds its own key
// (D-42) to `defineModel` or to a model's `.with`.
import type { Queries, UniqueWhere } from './query.ts'
import type { RecordOf, ScalarKeys } from './record.ts'
import type { AnyRule } from './rules.ts'

/** The commands soft delete adds (D-15, D-17). */
export interface SoftDeleteCommands<F> {
	readonly trash: Queries<F>
	restore(args: { readonly where: UniqueWhere<F> }): Promise<RecordOf<F>>
}

declare module './register.ts' {
	interface ModelOptionKeys {
		readonly softDelete?: boolean
	}
	interface ModelCommands<F, O> {
		readonly softDelete: O extends { readonly softDelete: true }
			? SoftDeleteCommands<F>
			: unknown
	}
	interface ModelWithKeys<F> {
		readonly acl?: {
			readonly default?: { readonly read?: AnyRule; readonly write?: AnyRule }
			readonly ownerField?: ScalarKeys<F>
		}
		readonly postgres?: { readonly table?: string }
	}
}
