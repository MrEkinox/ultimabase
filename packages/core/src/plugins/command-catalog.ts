import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { OperationKind } from '../query/operations/contracts.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type { CompiledSchemaMutationCommand } from './application-surface-contracts.js'
import type { CompiledCommandGraph } from './command-graph.js'
import type {
	PluginSchemaMutationAuthority,
	PluginSchemaMutationEffect,
	PluginSchemaMutationTarget,
} from './plugin-schema-mutations.js'

/** Splits commands into reads (`find`, `count`, `exists`) and every write. */
export type CommandGroup = 'read' | 'write'

/** One row, several rows, or an aggregate answer (`count`, `exists`). */
export type CommandCardinality = 'aggregate' | 'many' | 'one'

/** The native operations; each groups the methods that share its meaning. */
export type NativeCommandOperation =
	'count' | 'create' | 'delete' | 'exists' | 'find' | 'update' | 'upsert'

/** The twelve native schema methods a transport can serve. */
export type NativeCommandMethod =
	| 'count'
	| 'createMany'
	| 'createOne'
	| 'deleteMany'
	| 'deleteOne'
	| 'exists'
	| 'findMany'
	| 'findOne'
	| 'updateMany'
	| 'updateOne'
	| 'upsertMany'
	| 'upsertOne'

/** One native method placed in the four-level vocabulary (ADR-0347). */
export interface NativeCommandCatalogEntry {
	readonly kind: 'native'
	readonly method: NativeCommandMethod
	readonly operation: NativeCommandOperation
	readonly group: CommandGroup
	readonly cardinality: CommandCardinality
	/** The query operation this method runs. */
	readonly operationKind: Exclude<OperationKind, 'get'>
	/** Whether a transport serves the method when no rule names it. */
	readonly defaultExposed: boolean
}

/** One plugin command alias of a schema placed in the vocabulary. */
export interface PluginCommandCatalogEntry {
	readonly kind: 'plugin'
	/** The alias, such as `softDeleteOne`. */
	readonly method: string
	/** The alias without its `One` or `Many` suffix, such as `softDelete`. */
	readonly operation: string
	readonly group: 'write'
	readonly cardinality: PluginSchemaMutationTarget
	readonly authority: PluginSchemaMutationAuthority
	readonly effect: PluginSchemaMutationEffect
	readonly owner: PluginSchemaContributionOwner
	/** The compiled alias that runs the command. */
	readonly command: CompiledSchemaMutationCommand
}

/** One method of a schema in the operation vocabulary. */
export type CommandCatalogEntry =
	NativeCommandCatalogEntry | PluginCommandCatalogEntry

const nativeEntry = (
	method: NativeCommandMethod,
	operation: NativeCommandOperation,
	cardinality: CommandCardinality,
	operationKind: Exclude<OperationKind, 'get'>,
	defaultExposed: boolean,
): NativeCommandCatalogEntry =>
	immutableRecord({
		kind: 'native' as const,
		method,
		operation,
		group:
			operation === 'find' || operation === 'count' || operation === 'exists'
				? ('read' as const)
				: ('write' as const),
		cardinality,
		operationKind,
		defaultExposed,
	})

/** The native methods in transport order, with their built-in exposure. */
export const nativeCommandCatalog: readonly NativeCommandCatalogEntry[] =
	immutableArray([
		nativeEntry('findMany', 'find', 'many', 'find-many', true),
		nativeEntry('findOne', 'find', 'one', 'find-one', true),
		nativeEntry('count', 'count', 'aggregate', 'count', false),
		nativeEntry('exists', 'exists', 'aggregate', 'exists', true),
		nativeEntry('createOne', 'create', 'one', 'create-one', true),
		nativeEntry('createMany', 'create', 'many', 'create-many', false),
		nativeEntry('updateOne', 'update', 'one', 'update-one', true),
		nativeEntry('updateMany', 'update', 'many', 'update-many', false),
		nativeEntry('upsertOne', 'upsert', 'one', 'upsert-one', false),
		nativeEntry('upsertMany', 'upsert', 'many', 'upsert-many', false),
		nativeEntry('deleteOne', 'delete', 'one', 'delete-one', true),
		nativeEntry('deleteMany', 'delete', 'many', 'delete-many', false),
	])

/** Keys that are not plugin operations: groups, `all` and every native name. */
const reservedOperations: ReadonlySet<string> = new Set([
	'all',
	'read',
	'write',
	...nativeCommandCatalog.flatMap(({ method, operation }) => [
		method,
		operation,
	]),
])

const targetSuffix = (target: PluginSchemaMutationTarget): 'Many' | 'One' =>
	target === 'one' ? 'One' : 'Many'

/**
 * Reads the operation a plugin command alias forms: `archiveOne` for target
 * `'one'` and `archiveMany` for target `'many'` both form `archive`.
 * Throws when the name does not end in the suffix of its target, or forms
 * an operation Core reserves.
 *
 * @example `readPluginCommandOperation('softDeleteOne', 'one') // 'softDelete'`
 */
export const readPluginCommandOperation = (
	name: string,
	target: PluginSchemaMutationTarget,
): string => {
	const suffix = targetSuffix(target)
	const operation = name.endsWith(suffix) ? name.slice(0, -suffix.length) : ''
	if (operation === '') {
		const stem = name.replace(/(?:One|Many)$/u, '')
		throw new TypeError(
			`Command ${name} must be named <operation>${suffix} because its target is ${target}${stem === '' ? '' : `: ${stem}${suffix}`}`,
		)
	}
	if (reservedOperations.has(operation)) {
		throw new TypeError(
			`Command ${name} names the operation ${operation}, which Core reserves: a plugin operation cannot be a native operation, a native method, read, write or all`,
		)
	}
	return operation
}

/** The fields of an entry that place it in the vocabulary. */
export type CommandKeyEntry = Pick<
	CommandCatalogEntry,
	'group' | 'method' | 'operation'
>

/** Names the key that decides one entry, from the most precise level. */
const decidingKeys = (entry: CommandKeyEntry): readonly string[] =>
	entry.method === entry.operation
		? [entry.method, entry.group, 'all']
		: [entry.method, entry.operation, entry.group, 'all']

/**
 * Reads the decision of the most precise key of `rule` that covers `entry`:
 * method, then operation, then group, then `all`; `undefined` when no key
 * covers it. A rule value may be anything a plugin decides with, such as a
 * policy; an `undefined` value covers nothing.
 *
 * @example `resolveCommandKey({ write: false, create: true }, createMany) // true`
 */
export const resolveCommandKey = <TValue>(
	rule: Readonly<Record<string, TValue | undefined>>,
	entry: CommandKeyEntry,
): TValue | undefined => readCommandKeyDecision(rule, entry)?.value

/**
 * @internal Reads the deciding key and its value, for messages that name it.
 */
export const readCommandKeyDecision = <TValue>(
	rule: Readonly<Record<string, TValue | undefined>>,
	entry: CommandKeyEntry,
): Readonly<{ key: string; value: TValue }> | undefined => {
	for (const key of decidingKeys(entry)) {
		if (Object.hasOwn(rule, key)) {
			const value = rule[key]
			if (value !== undefined) return { key, value }
		}
	}
	return undefined
}

/**
 * @internal Lists the methods of one compiled schema: the native methods in
 * transport order, then its plugin aliases sorted by name.
 */
export const readSchemaCommandCatalog = (
	graph: CompiledCommandGraph,
	className: string,
): readonly CommandCatalogEntry[] => {
	const surface = graph.schemaSurface(className)
	if (surface === undefined)
		throw new TypeError(`Schema ${className} is not compiled`)
	const plugins = [...surface.schemaMutations]
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([method, command]) =>
			immutableRecord({
				kind: 'plugin' as const,
				method,
				operation: readPluginCommandOperation(method, command.mutation.target),
				group: 'write' as const,
				cardinality: command.mutation.target,
				authority: command.mutation.authority,
				effect: command.mutation.effect,
				owner: command.owner,
				command,
			}),
		)
	return immutableArray([...nativeCommandCatalog, ...plugins])
}

/** @internal Every key level a rule may name for native methods. */
export const nativeCommandKeys: readonly string[] = immutableArray([
	'all',
	'read',
	'write',
	...new Set(nativeCommandCatalog.map(({ operation }) => operation)),
	...nativeCommandCatalog
		.map(({ method }) => method)
		.filter((method) => method !== 'count' && method !== 'exists'),
])
