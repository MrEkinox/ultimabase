// Stand-ins for the plugins the measured models use, as values (D-24,
// option A): each carries its types.
import type { Plugin } from './use.ts'
import type { SoftDeleteCommands } from './plugins.ts'
import type { ScalarKeys } from './record.ts'
import type { AnyRule } from './rules.ts'
import type { FromModel } from './use.ts'

interface SoftDeleteModel extends FromModel {
	readonly out: this['options'] extends true
		? SoftDeleteCommands<this['fields']>
		: unknown
}

type AclKey<F> = {
	readonly default?: { readonly read?: AnyRule; readonly write?: AnyRule }
	readonly ownerField?: ScalarKeys<F>
}

interface AclWith extends FromModel {
	readonly out: AclKey<this['fields']>
}

interface PostgresWith extends FromModel {
	readonly out: { readonly table?: string }
}

export declare function softDelete(): Plugin<{
	readonly name: 'softDelete'
	readonly option: boolean
	readonly commands: SoftDeleteModel
}>
export declare function acl(): Plugin<{
	readonly name: 'acl'
	readonly with: AclWith
}>
export declare function postgres(options: {
	readonly url: string
}): Plugin<{ readonly name: 'postgres'; readonly with: PostgresWith }>
