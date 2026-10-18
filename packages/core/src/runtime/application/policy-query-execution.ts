import { isPlainRecord } from '@ultimabase/shared'

import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { PointerValue } from '../../schema/relations/pointer.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { evaluateRuntimePolicyQuery } from '../enforcement/policy-query-binding.js'
import {
	isNativePolicyQueryKey,
	type PolicyQueryRequest,
} from '../enforcement/policy-query.js'
import type { CompiledCommand } from '../../plugins/command-graph.js'
import { readSchemaCommandCatalog } from '../../plugins/command-catalog.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import { readRequestEngineInternals } from '../engine/request-engine.js'
import { readPipelineTransactionAdapter } from '../transactions/pipeline-transaction.js'
import { readClosedSchemaCommand } from '../../schema/schema/command-closures.js'
import { isClosedForCaller } from '../pipeline/closed-commands.js'

/**
 * Operation keys `can()` accepts (ADR-0347): the operations `find`, `count`,
 * `exists`, `create`, `update`, `upsert`, `delete` and plugin operations such
 * as `softDelete`, and the read methods `findOne` and `findMany`.
 */
export type CanOperation =
	| 'count'
	| 'create'
	| 'delete'
	| 'exists'
	| 'find'
	| 'findMany'
	| 'findOne'
	| 'update'
	| 'upsert'
	| (string & {})

/** Asks whether an operation would be permitted, without executing it. */
export interface CanOptions<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	/**
	 * The identity asked about. Omitted, it is the principal of the current
	 * request; `undefined` asks about an anonymous caller.
	 * @example `principal: TodoUser.pointer(userId)`
	 */
	readonly principal?: PointerValue | undefined
	/**
	 * The operation key: an operation (`find`, `count`, `exists`, `create`,
	 * `update`, `upsert`, `delete` or a plugin operation such as `softDelete`)
	 * or a read method (`findOne`, `findMany`). An operation is permitted when
	 * every method it covers is: `find` asks about `findOne` and `findMany`,
	 * `softDelete` about `softDeleteOne` and `softDeleteMany`.
	 * @example `operation: 'update'`
	 */
	readonly operation: CanOperation
	/** The schema the operation targets. @example `schema: Todo` */
	readonly schema: TSchema
	/**
	 * Candidate data for `create`; for any other operation, `{ id }` names a
	 * persisted row, and a missing or hidden row answers `false`.
	 * @example `item: { id: todo.id }`
	 */
	readonly item?: Readonly<Record<string, unknown>>
}

const canOptionKeys = new Set(['item', 'operation', 'principal', 'schema'])

/** Validates `can()` options before any policy runs. */
export const assertCanOptions: (
	options: unknown,
) => asserts options is CanOptions = (options) => {
	assertExactEnumerablePlainObject(
		options,
		canOptionKeys,
		'can() options must be a plain object',
		'Unknown can() option: ',
	)
	if (typeof options.operation !== 'string' || options.operation.length === 0) {
		throw new TypeError('can() operation must be a non-empty string')
	}
	if (!Schema.is(options.schema)) {
		throw new TypeError('can() schema must be a schema definition')
	}
	if (options.item !== undefined && !isPlainRecord(options.item)) {
		throw new TypeError('can() item must be a plain object')
	}
}

/**
 * Evaluates every installed policy as at execution time for the engine's
 * principal (ADR-0305). Business hooks, input resolution, validation, writes
 * and events never run; a persisted row is read in a read-only transaction.
 */
export const executePolicyQuery = async (
	engine: RequestEngine,
	options: CanOptions,
): Promise<boolean> => {
	const { application, pipeline } = readRequestEngineInternals(engine)
	const { context } = engine
	const { className } = options.schema
	if (!application.ownsSchema(options.schema)) {
		throw new TypeError(
			`can() schema does not belong to this application: ${className}`,
		)
	}
	// A closed command is permitted to no caller, Master included (ADR-0341).
	if (
		(options.operation === 'create' || options.operation === 'upsert') &&
		isClosedForCaller(
			readClosedSchemaCommand(options.schema.definition, 'create'),
		)
	) {
		return false
	}
	const methods = readQueriedMethods(application, className, options.operation)
	// Master bypasses authorization: every operation is permitted.
	if (context.access.mode === 'master') return true
	// A Master-only plugin mutation is never permitted to another caller.
	if (
		methods.some(
			({ command }) =>
				command?.kind === 'mutation' &&
				command.definition.authority === 'master',
		)
	) {
		return false
	}
	// Reading a row happens in a transaction that is always rolled back.
	const evaluate = async (request: PolicyQueryRequest): Promise<boolean> => {
		if (
			options.item === undefined ||
			request.operation === 'create' ||
			readPipelineTransactionAdapter(pipeline) !== undefined
		) {
			return evaluateRuntimePolicyQuery(pipeline, request)
		}
		const scope = await pipeline.beginTransaction()
		try {
			return await evaluateRuntimePolicyQuery(scope.pipeline, request)
		} finally {
			await scope.rollback()
		}
	}
	return runWithRequestEngine(engine, async () => {
		// Every method of the operation must be permitted, in catalog order.
		for (const { command, operation } of methods) {
			const request = {
				command,
				context,
				item: options.item,
				operation,
				schema: options.schema,
			}
			if (!(await evaluate(request))) return false
		}
		return true
	})
}

interface QueriedMethod {
	readonly command: CompiledCommand | undefined
	/** The native key or the plugin method the policy query builds. */
	readonly operation: string
}

/**
 * Lists the methods one `can()` key covers: a native key itself, `find` its
 * two read methods, a plugin operation its One and Many commands. Throws on
 * any other key, Master included, so a typo never answers `true`.
 */
const readQueriedMethods = (
	application: object,
	className: string,
	key: string,
): readonly QueriedMethod[] => {
	if (key === 'find') {
		return [
			{ command: undefined, operation: 'findOne' },
			{ command: undefined, operation: 'findMany' },
		]
	}
	if (isNativePolicyQueryKey(key))
		return [{ command: undefined, operation: key }]
	const { commands } = readApplicationKernelState(application)
	const methods = readSchemaCommandCatalog(commands, className).flatMap(
		(entry) =>
			entry.kind === 'plugin' && entry.operation === key ? [entry.method] : [],
	)
	if (methods.length === 0) {
		throw new TypeError(
			`can() received an unknown operation for ${className}: ${key}`,
		)
	}
	return methods.map((method) => ({
		command: commands.commands.find(
			(candidate) =>
				candidate.kind === 'mutation' &&
				candidate.surfaces.some(
					(surface) =>
						surface.className === className && surface.name === method,
				),
		),
		operation: method,
	}))
}
