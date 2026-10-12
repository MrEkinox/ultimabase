import {
	contributeSchemaMutation,
	defineOperationValue,
	defineSchemaMutation,
	defineTypegenReference,
	type PluginContribution,
	type PluginOperationValueContract,
	type PluginSchemaMutationDefinition,
	type PluginSchemaMutationDependencySelection,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

/** Who may run a command: rule plugins such as Access decide, or Master only. */
export type CommandAuthority = 'master' | 'request'

/** What a command writes: replacement values, or a physical delete. */
export type CommandEffect = 'delete' | 'update'

/** Which rows a command targets: one row by `id`, or the rows matching a `where`. */
export type CommandTarget = 'many' | 'one'

/** Declares one schema command added by a shape method (see {@link command}). */
export interface CommandOptions<
	TAuthority extends CommandAuthority = CommandAuthority,
	TEffect extends CommandEffect = CommandEffect,
	TTarget extends CommandTarget = CommandTarget,
> {
	/** `'request'`: rule plugins such as Access decide; `'master'`: server-side only. */
	readonly authority: TAuthority
	/** `'update'` writes {@link CommandOptions.data}; `'delete'` removes the row (Master only). */
	readonly effect: TEffect
	/**
	 * `'one'` (default): `Todo.archiveOne({ id })`; `'many'`:
	 * `Todo.archiveMany({ where })`, each matching row written with the
	 * one-row rules in one transaction.
	 * @default "one"
	 */
	readonly target?: TTarget
	/**
	 * Values an update command writes, computed for each row it writes.
	 * @example `data: () => ({ archivedAt: new Date() })`
	 */
	readonly data?: () => Readonly<Record<string, unknown>>
	/**
	 * Checks the read rules against the row as it was before the command,
	 * for commands that hide their row (ADR-0306).
	 */
	readonly checkReadable?: 'before'
}

declare const commandDefinitionType: unique symbol

/** One command returned by {@link command}. */
export interface CommandDefinition<
	TAuthority extends CommandAuthority = CommandAuthority,
	TEffect extends CommandEffect = CommandEffect,
	TTarget extends CommandTarget = CommandTarget,
> {
	readonly authority: TAuthority
	readonly checkReadable: 'before' | undefined
	readonly data: () => Readonly<Record<string, unknown>>
	readonly effect: TEffect
	readonly target: CommandTarget
	/** Retains the declared target for the command's static type. */
	readonly [commandDefinitionType]?: TTarget
}

const commandKeys = new Set([
	'authority',
	'checkReadable',
	'data',
	'effect',
	'target',
])
const noData = (): Readonly<Record<string, unknown>> => immutableRecord({})

/** Reads the target a command's options select (`'one'` when omitted). */
export type CommandOptionsTarget<TOptions> =
	TOptions extends Readonly<{ target: 'many' }> ? 'many' : 'one'

/**
 * Declares one schema command without input, for a shape method's `commands`.
 *
 * @example
 * ```ts
 * archiveOne: command({ authority: 'request', effect: 'update', data: () => ({ archivedAt: new Date() }) })
 * ```
 */
export const command = <const TOptions extends CommandOptions>(
	options: TOptions,
): CommandDefinition<
	TOptions['authority'],
	TOptions['effect'],
	CommandOptionsTarget<TOptions>
> => {
	const untrusted: unknown = options
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('command options must be a plain object')
	}
	const unknownKey = Object.keys(untrusted).find((key) => !commandKeys.has(key))
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown command option: ${unknownKey}`)
	}
	const { authority, checkReadable, data, effect } = untrusted
	if (authority !== 'request' && authority !== 'master') {
		throw new TypeError('command authority must be request or master')
	}
	if (effect !== 'update' && effect !== 'delete') {
		throw new TypeError('command effect must be update or delete')
	}
	const target = untrusted.target ?? 'one'
	if (target !== 'one' && target !== 'many') {
		throw new TypeError('command target must be one or many')
	}
	if (data !== undefined && typeof data !== 'function') {
		throw new TypeError('command data must be a function')
	}
	if (effect === 'delete' && data !== undefined) {
		throw new TypeError('delete commands write no data')
	}
	if (checkReadable !== undefined && checkReadable !== 'before') {
		throw new TypeError('command checkReadable must be before')
	}
	return immutableRecord({
		authority: options.authority,
		checkReadable: options.checkReadable,
		data: options.data ?? noData,
		effect: options.effect,
		target,
	})
}

/** Reads the schema mutation one command contributes. */
export type CommandMutation<TCommand> =
	TCommand extends CommandDefinition<
		infer TAuthority,
		infer TEffect,
		infer TTarget
	>
		? PluginSchemaMutationDefinition<
				string,
				'1.0.0',
				undefined,
				readonly [],
				TAuthority,
				TEffect,
				TEffect extends 'delete' ? 'before' : 'after',
				PluginSchemaMutationDependencySelection,
				TTarget
			>
		: never

// One no-input contract for every facade command; Typegen renders Core's
// payload-free input for it.
const noInput: PluginOperationValueContract<undefined> = defineOperationValue(
	(value, path): undefined => {
		if (value !== undefined) throw new TypeError(`${path} must be undefined`)
		return undefined
	},
	defineTypegenReference({
		exportName: 'PluginSchemaMutationNoInput',
		module: '@ultimabase/core/plugin',
	}),
)

/** Converts a camelCase key into one segment of a namespaced mutation name. */
const nameSegment = (value: string): string =>
	value.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').toLowerCase()

/** Derives the namespaced mutation prefix from a plugin's npm package name. */
const mutationNamespace = (pluginName: string): string =>
	pluginName.replace(/^@/u, '').replaceAll('/', '.')

/** One generated command: its mutation token and Core contribution. */
export interface GeneratedCommand {
	readonly command: string
	readonly contribution: PluginContribution
	readonly method: string
	readonly mutation: PluginSchemaMutationDefinition
}

/** @internal Creates the schema mutation and contribution of one command. */
export const createCommand = (
	pluginName: string,
	method: string,
	name: string,
	definition: CommandDefinition,
): GeneratedCommand => {
	const mutationName = `${mutationNamespace(pluginName)}.${nameSegment(method)}.${nameSegment(name)}`
	const common = {
		authority: definition.authority,
		input: noInput,
		name: mutationName,
		target: definition.target,
		version: '1.0.0',
	} as const
	if (definition.effect === 'delete') {
		const mutation = defineSchemaMutation({
			...common,
			effect: 'delete',
			returning: 'before',
		})
		return immutableRecord({
			command: name,
			contribution: contributeSchemaMutation({
				mutation,
				resolve: (): undefined => undefined,
			}),
			method,
			mutation,
		})
	}
	const mutation = defineSchemaMutation({
		...common,
		effect: 'update',
		returning: 'after',
		...(definition.checkReadable === undefined
			? {}
			: { checkReadable: definition.checkReadable }),
	})
	return immutableRecord({
		command: name,
		// Transports expose request commands without a binding (ADR-0324,
		// ADR-0325): this module names no protocol.
		contribution: contributeSchemaMutation({
			mutation,
			resolve: () => ({ data: definition.data() }),
		}),
		method,
		mutation,
	})
}
