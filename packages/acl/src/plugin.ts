// `aclPlugin()` and `acl({ default })` (D-124): an `acl` field on each model
// that uses it, which only Master writes, and a beforeFind keeping the rows
// the caller may read, or write too for the rows a write targets.
import type {
	Caller,
	Field,
	FieldType,
	ModelUse,
	PluginOf,
	PluginTypes,
} from 'ultimabase'
import { defineFieldType, definePlugin, Refused } from 'ultimabase'
import manifest from '../package.json' with { type: 'json' }
import type { AclJson } from './acl.ts'
import { ACL, parsed, subjectsOf } from './acl.ts'

/** What an `acl` field takes: an `ACL`, or its JSON. */
export type AclInput = ACL | AclJson

/** The ACL of a row created without one, from the caller (D-124). */
export type AclDefault = (facts: { readonly caller: Caller }) => ACL

export type AclOptions = { readonly default: AclDefault }

type Stored = Field<readonly string[], { readonly list: true }>

/** The `acl` field a model that uses the plugin gets. */
export type AclField = Field<
	ACL,
	{ readonly list: true; readonly default: AclDefault },
	'acl',
	never,
	AclInput,
	true,
	Stored
>

/** The ACL plugin's types (D-57). */
export interface Acl extends PluginTypes {
	readonly name: 'acl'
	readonly options: AclOptions
	readonly addedFields: { readonly acl: AclField }
}

type Result =
	| { readonly value: ACL }
	| { readonly issues: readonly { readonly message: string }[] }

/** A Standard Schema taking an `ACL` or `{ read, write }`. */
const schema: {
	readonly '~standard': {
		readonly version: 1
		readonly vendor: string
		readonly validate: (value: unknown) => Result
		readonly types?: { readonly input: AclInput; readonly output: ACL }
	}
} = {
	'~standard': {
		version: 1,
		vendor: 'ultimabase-acl',
		validate: (value) => {
			const given = parsed(value)
			return typeof given === 'string'
				? { issues: [{ message: given }] }
				: { value: given }
		},
	},
}

const aclType: FieldType<'acl', Stored, ACL, AclInput> = defineFieldType({
	plugin: 'acl',
	stored: (f) => f.string({ list: true }),
	decode: (stored) => ACL.fromEntries(stored),
	encode: (rights) => rights.entries(),
	schema,
	toJSON: (rights) => rights.toJSON(),
})

/** The keys the caller's subjects give for a permission. */
const keys = (caller: Caller, permission: 'read' | 'write') =>
	subjectsOf(caller).map((subject) => `${permission}:${subject}`)

const definition = definePlugin<Acl>({
	name: 'acl',
	manifest,
	addedFields: (_f, options) => {
		const fallback: unknown = Reflect.get(Object(options), 'default')
		if (typeof fallback !== 'function') {
			throw new Refused(
				'acl() takes default: the ACL of a row created without one.',
			)
		}
		// Only Master writes an ACL: sharing is a function's (D-124).
		return {
			acl: aclType({ default: options.default }).with({
				access: { create: () => false, update: () => false },
			}),
		}
	},
	addedIndexes: [{ fields: ['acl'] }],
	hooks: {
		beforeFind: ({ caller, operation, where }) => {
			if (caller.kind === 'master') return undefined
			const read = { acl: { hasSome: keys(caller, 'read') } }
			if (operation === 'read') return where(read)
			// A caller writes the rows it reads.
			return where({ AND: [read, { acl: { hasSome: keys(caller, 'write') } }] })
		},
	},
})

/** The ACL plugin, which `plugins` lists. */
export const aclPlugin: PluginOf<Acl> = definition.plugin

/**
 * A model's per-row rights: an `acl` field, `default` giving the ACL of a
 * row created without one (D-124).
 */
export function acl(
	options: AclOptions,
): ModelUse<'acl', Acl & { readonly options: AclOptions }> {
	return definition.use(options)
}
