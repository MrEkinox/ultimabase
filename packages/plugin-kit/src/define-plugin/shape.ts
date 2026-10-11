import type { GenericField } from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { CommandDefinition } from './commands.js'

/** Validates one untrusted value and returns it; throws a `TypeError` naming `path`. */
export type Validator<TValue> = (value: unknown, path: string) => TValue

/** Fields a shape method adds, keyed by field name. */
export type ShapeMethodFields = Readonly<Record<string, GenericField>>

/** Commands a shape method adds, keyed by command name. */
export type ShapeMethodCommands = Readonly<Record<string, CommandDefinition>>

/**
 * Declares one shape method chained before `.with(...)` (see {@link shapeMethod}).
 * `TOptions` is `never` when the method takes no argument.
 */
export interface ShapeMethodDefinition<
	TOptions extends object = object,
	TFields extends ShapeMethodFields = ShapeMethodFields,
	TCommands extends ShapeMethodCommands = ShapeMethodCommands,
> {
	/**
	 * Validates the method's optional options object, such as
	 * `.softDelete({ mode: 'command' })`; an omitted object is validated as
	 * `{}`. Without a validator the method takes no argument.
	 */
	readonly options?: Validator<TOptions>
	/** Server-written fields the method adds; create and update inputs reject them. */
	readonly fields?: TFields
	/** Commands the method adds to the schema, made with `command(...)`. */
	readonly commands?: TCommands
}

const shapeMethodKeys = new Set(['commands', 'fields', 'options'])

/** Reads the options object a shape method accepts (`never`: no argument). */
export type ShapeMethodOptionsOf<TDefinition> =
	'options' extends keyof TDefinition
		? Exclude<
				TDefinition['options' & keyof TDefinition],
				undefined
			> extends Validator<infer TOptions extends object>
			? TOptions
			: never
		: never

/** Reads the fields or commands of one shape method (empty when omitted). */
export type ShapeMethodMember<
	TDefinition,
	TKey extends 'commands' | 'fields',
> = TKey extends keyof TDefinition
	? Exclude<TDefinition[TKey], undefined>
	: Readonly<Record<never, never>>

/**
 * Declares one shape method: the fields and commands a schema gains when its
 * declaration calls the method before `.with(...)`.
 *
 * @example
 * ```ts
 * archivable: shapeMethod({
 *   fields: { archivedAt: dateTimeField() },
 *   commands: {
 *     archiveOne: command({ authority: 'request', effect: 'update', data: () => ({ archivedAt: new Date() }) }),
 *   },
 * })
 * ```
 */
export const shapeMethod = <const TDefinition extends ShapeMethodDefinition>(
	definition: TDefinition,
): Readonly<TDefinition> => {
	const untrusted: unknown = definition
	if (!isPlainRecord(untrusted)) {
		throw new TypeError('shape method definition must be a plain object')
	}
	const unknownKey = Object.keys(untrusted).find(
		(key) => !shapeMethodKeys.has(key),
	)
	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown shape method option: ${unknownKey}`)
	}
	if (
		definition.options !== undefined &&
		typeof definition.options !== 'function'
	) {
		throw new TypeError('shape method options must be a validator function')
	}
	for (const key of ['fields', 'commands'] as const) {
		if (definition[key] !== undefined && !isPlainRecord(definition[key])) {
			throw new TypeError(`shape method ${key} must be a plain object`)
		}
	}
	return immutableRecord({ ...definition })
}
