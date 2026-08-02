import {
	FrameworkError,
	type FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import {
	Query,
	type BoundQuery,
	type ExecutableOperationAst,
	type InferOperationResult,
	type QueryOperationExecutor,
} from '../../query/index.js'
import {
	jsonField,
	snapshotScalarFieldValue,
	type HookContext,
	type HookContextIdentity,
	type JsonDocument,
	type SchemaDefinition,
} from '../../schema/index.js'
import { createTrustedHookContext } from '../../schema/hooks/hook-context.js'
import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import { getActiveFrameworkContext } from '../context/active-framework-storage.js'
import type { RequestContext } from '../context/request-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import { TrackedExecutionLifetime } from '../engine/tracked-execution-lifetime.js'

/** Creates the stable failure shared by contexts and queries used after a hook. */
const createClosedHookContextError =
	(): FrameworkError<'HOOK_CONTEXT_CLOSED'> =>
		new FrameworkError(
			'HOOK_CONTEXT_CLOSED',
			'Hook context cannot be used after its callback has completed.',
			{
				publicMessage: 'The hook context is no longer active.',
				internalDetails: { reason: 'hook-context-closed' },
			},
		)

const hookEventPayloadField = jsonField()

/** Keeps one emitted payload detached from developer-owned mutable state. */
const snapshotHookEventPayload = (payload: JsonDocument): JsonDocument =>
	snapshotScalarFieldValue(hookEventPayloadField, payload, 'hook event payload')

/** Hides RequestEngine authority behind the only method BoundQuery requires. */
class HookQueryExecutor<
	TSchema extends SchemaDefinition,
> implements QueryOperationExecutor<TSchema> {
	readonly #engine: QueryOperationExecutor<TSchema>
	readonly #lifetime: TrackedExecutionLifetime

	constructor(
		engine: QueryOperationExecutor<TSchema>,
		lifetime: TrackedExecutionLifetime,
	) {
		this.#engine = engine
		this.#lifetime = lifetime
		Object.freeze(this)
	}

	/** Checks the hook lease on every terminal, including captured queries. */
	execute<const TOperation extends ExecutableOperationAst<TSchema>>(
		operation: TOperation,
	): Promise<InferOperationResult<TOperation>> {
		return this.#lifetime.run(() => this.#engine.execute(operation))
	}
}

export interface HookContextEmission {
	readonly hook: HookContextIdentity
	readonly name: string
	readonly payload: JsonDocument
	readonly request: RequestContext
}

interface CreateRuntimeHookContextOptions {
	readonly application:
		| FrameworkApplication<
				readonly SchemaDefinition[],
				readonly PluginDefinition[]
		  >
		| undefined
	readonly emit: (emission: HookContextEmission) => void
	readonly hook: HookContextIdentity
	readonly queryable: boolean
	readonly request: RequestContext
	readonly transactionId: string | undefined
}

export interface RuntimeHookContextScope {
	readonly context: HookContext
	readonly lifetime: TrackedExecutionLifetime
}

/** Captures the exact active engine once so escaped contexts cannot switch requests. */
const readMatchingRequestEngine = (
	application:
		| FrameworkApplication<
				readonly SchemaDefinition[],
				readonly PluginDefinition[]
		  >
		| undefined,
	request: RequestContext,
): RequestEngine | undefined => {
	const active = getActiveFrameworkContext()

	return application !== undefined &&
		active?.application === application &&
		active.request === request
		? active.requestEngine
		: undefined
}

/** Creates one Runtime-owned context and its per-invocation revocable lease. */
export const createRuntimeHookContext = ({
	application,
	emit,
	hook,
	queryable,
	request,
	transactionId,
}: CreateRuntimeHookContextOptions): RuntimeHookContextScope => {
	const lifetime = new TrackedExecutionLifetime(createClosedHookContextError)
	const requestEngine = queryable
		? readMatchingRequestEngine(application, request)
		: undefined
	const context = createTrustedHookContext(
		{
			access: request.access,
			hook,
			requestId: request.requestId,
			signal: request.signal,
			source: request.source,
			transactionId,
		},
		{
			emit: (name, payload): void => {
				lifetime.assertActive()
				assertNonEmptyString(name, 'Hook event name')
				emit({
					hook,
					name,
					payload: snapshotHookEventPayload(payload),
					request,
				})
			},
			hasCapability: (capability) => {
				lifetime.assertActive()
				return request.hasCapability(capability)
			},
			query: <const TSchema extends SchemaDefinition>(
				schema: TSchema,
			): BoundQuery<TSchema> => {
				lifetime.assertActive()

				if (requestEngine === undefined) {
					throw new FrameworkError(
						'MISSING_EXECUTION_CONTEXT',
						'Hook queries require an active operation engine.',
						{
							publicMessage:
								'Queries are not available during this hook phase.',
							internalDetails: {
								reason: 'hook-query-engine-unavailable',
							},
						},
					)
				}

				const framework: RequestEngine['framework'] = requestEngine.framework
				framework.assertOwnsSchema(schema)

				// Runtime ownership validation justifies narrowing the erased application union.
				const executor =
					requestEngine as unknown as QueryOperationExecutor<TSchema>

				return new Query(schema).bind<QueryOperationExecutor<TSchema>>(
					new HookQueryExecutor(executor, lifetime),
				)
			},
		},
	)

	return immutableRecord({ context, lifetime })
}
