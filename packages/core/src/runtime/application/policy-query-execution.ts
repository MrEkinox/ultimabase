import { isPlainRecord } from '@ultimabase/shared'

import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { PolicyOperation } from '../../access/subject/principal.js'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { PointerValue } from '../../schema/relations/pointer.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { evaluateRuntimePolicyQuery } from '../enforcement/policy-query-binding.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import { readRequestEngineInternals } from '../engine/request-engine.js'
import { readPipelineTransactionAdapter } from '../transactions/pipeline-transaction.js'

/** Operation keys `can()` accepts: `read` asks about a single-row read (`one`). */
export type CanOperation = 'read' | PolicyOperation

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
	 * The operation key: `read`, `one`, `many`, `count`, `exists`, `create`,
	 * `update`, `upsert`, `delete` or a plugin mutation key.
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
export const executePolicyQuery = (
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
	// Master bypasses authorization: every operation is permitted.
	if (context.access.mode === 'master') return Promise.resolve(true)
	const command = readApplicationKernelState(
		application,
	).commands.commands.find(
		(candidate) =>
			candidate.kind === 'mutation' &&
			candidate.surfaces.some(
				(surface) =>
					surface.className === className && surface.name === options.operation,
			),
	)
	// A Master-only plugin mutation is never permitted to another caller.
	if (
		command?.kind === 'mutation' &&
		command.definition.authority === 'master'
	) {
		return Promise.resolve(false)
	}
	const request = {
		command,
		context,
		item: options.item,
		operation: options.operation,
		schema: options.schema,
	}
	return runWithRequestEngine(engine, async () => {
		if (
			options.item === undefined ||
			options.operation === 'create' ||
			readPipelineTransactionAdapter(pipeline) !== undefined
		) {
			return evaluateRuntimePolicyQuery(pipeline, request)
		}
		// Reading the row happens in a transaction that is always rolled back.
		const scope = await pipeline.beginTransaction()
		try {
			return await evaluateRuntimePolicyQuery(scope.pipeline, request)
		} finally {
			await scope.rollback()
		}
	})
}
