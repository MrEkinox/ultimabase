import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { SchemaDefinition } from './definition.js'
import type { PluginSchemaContributionOwner } from './provenance.js'

/**
 * A generic command a plugin may close on a schema it contributes to
 * (ADR-0341). `create` covers every method that may create a row:
 * `createOne`, `createMany`, `upsertOne` and `upsertMany`.
 */
export type SchemaClosableCommand = 'create'

/** Why and by whom one generic command of a schema is closed (ADR-0341). */
export interface SchemaCommandClosure {
	/** The plugin that closed the command; its own calls still run it. */
	readonly owner: PluginSchemaContributionOwner
	/** Why the command is closed, given to every refused caller. */
	readonly reason: string
}

/** @internal The compiled definition key holding a schema's closures. */
export const closedCommandsKey = 'closedCommands'

// Only Core creates closures, so a stored value is trusted by identity.
const closures = new WeakSet<object>()

const isClosure = (value: unknown): value is SchemaCommandClosure =>
	typeof value === 'object' && value !== null && closures.has(value)

/** @internal Creates one closure the readers below accept. */
export const createSchemaCommandClosure = (
	owner: PluginSchemaContributionOwner,
	reason: string,
): SchemaCommandClosure => {
	const closure = immutableRecord({ owner: immutableRecord(owner), reason })
	closures.add(closure)
	return closure
}

// The generic methods each closable command covers: an upsert may create.
const closableMethods: ReadonlyMap<string, SchemaClosableCommand> = new Map([
	['createOne', 'create'],
	['createMany', 'create'],
	['upsertOne', 'create'],
	['upsertMany', 'create'],
])

/** @internal Reads one command's closure from a compiled definition record. */
export const readClosedSchemaCommand = (
	definition: object,
	command: SchemaClosableCommand,
): SchemaCommandClosure | undefined => {
	const stored: unknown = Object.hasOwn(definition, closedCommandsKey)
		? Reflect.get(definition, closedCommandsKey)
		: undefined
	const closure =
		isPlainRecord(stored) && Object.hasOwn(stored, command)
			? stored[command]
			: undefined
	return isClosure(closure) ? closure : undefined
}

/**
 * Tells whether a plugin closed a generic method of the schema, and why
 * (ADR-0341). Transports publish no route or field for a closed method, and
 * every call fails with its reason, Master included.
 *
 * @example `readSchemaCommandClosure(User, 'createOne')?.reason`
 */
export const readSchemaCommandClosure = (
	schema: SchemaDefinition,
	method: string,
): SchemaCommandClosure | undefined => {
	const command = closableMethods.get(method)
	return command === undefined
		? undefined
		: readClosedSchemaCommand(schema.definition, command)
}
