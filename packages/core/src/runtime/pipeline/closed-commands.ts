import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import { readActivePluginOwner } from '../../plugins/callback-execution.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
} from '../../plugins/manifest.js'
import {
	readClosedSchemaCommand,
	type SchemaCommandClosure,
} from '../../schema/schema/command-closures.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'

// The operations `create` closes, by the method a caller used: an upsert may
// create its row.
const creatingMethods: ReadonlyMap<string, string> = new Map([
	['create-one', 'createOne'],
	['create-many', 'createMany'],
	['upsert-one', 'upsertOne'],
	['upsert-many', 'upsertMany'],
])

/**
 * Reports whether the active caller may not run a closed command: every
 * caller, Master included, except the plugin that closed it (ADR-0341).
 */
export const isClosedForCaller = (
	closure: SchemaCommandClosure | undefined,
): closure is SchemaCommandClosure => {
	if (closure === undefined) return false
	const owner = readActivePluginOwner()
	return owner === undefined || !isSamePluginIdentity(owner, closure.owner)
}

/**
 * Refuses, before any stage runs, an operation whose command a plugin closed
 * on its schema: a `VALIDATION_ERROR` whose `command.closed` issue gives the
 * declared reason.
 */
export const assertSchemaCommandOpen = (
	operation: DatabaseOperationAst,
): void => {
	const method = creatingMethods.get(operation.kind)
	if (method === undefined) return
	// A schema is its model class: a function carrying `definition`.
	const schema: unknown = getOperationSchema(operation)
	if (typeof schema !== 'function') return
	const definition: unknown = Reflect.get(schema, 'definition')
	if (typeof definition !== 'object' || definition === null) return
	const closure = readClosedSchemaCommand(definition, 'create')
	if (!isClosedForCaller(closure)) return
	const className: unknown = Reflect.get(definition, 'className')
	const issues = immutableArray([
		immutableRecord({
			code: 'command.closed',
			message: closure.reason,
			path: immutableArray([]),
		}),
	])
	throw new FrameworkError(
		'VALIDATION_ERROR',
		`${String(className)}.${method} is closed by plugin "${formatPluginIdentity(closure.owner)}": ${closure.reason}`,
		{
			publicMessage: 'The operation input is invalid.',
			publicDetails: { issues },
			internalDetails: { issues },
		},
	)
}
