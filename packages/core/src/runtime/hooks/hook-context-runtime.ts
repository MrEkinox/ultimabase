import { FrameworkError } from '../../foundation.js'
import type { QueryExecutionGuard } from '../../query/operations/execution.js'
import {
	jsonField,
	snapshotScalarFieldValue,
	type HookContext,
	type HookContextIdentity,
	type JsonDocument,
} from '../../schema/index.js'
import { createTrustedHookContext } from '../../schema/hooks/hook-context.js'
import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import type { RequestContext } from '../context/request-context.js'
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

export interface HookContextEmission {
	readonly hook: HookContextIdentity
	readonly name: string
	readonly payload: JsonDocument
	readonly request: RequestContext
}

interface CreateRuntimeHookContextOptions {
	readonly emit: (emission: HookContextEmission) => void
	readonly hook: HookContextIdentity
	readonly queryable: boolean
	readonly request: RequestContext
	readonly transactionId: string | undefined
}

export interface RuntimeHookContextScope {
	readonly context: HookContext
	readonly lifetime: TrackedExecutionLifetime
	readonly queryGuard: QueryExecutionGuard
}

/** Creates one Runtime-owned context and its per-invocation revocable lease. */
export const createRuntimeHookContext = ({
	emit,
	hook,
	queryable,
	request,
	transactionId,
}: CreateRuntimeHookContextOptions): RuntimeHookContextScope => {
	const lifetime = new TrackedExecutionLifetime(createClosedHookContextError)
	const queryGuard: QueryExecutionGuard = immutableRecord({
		run: <TResult>(operation: () => Promise<TResult>): Promise<TResult> => {
			lifetime.assertActive()

			if (!queryable) {
				throw new FrameworkError(
					'MISSING_EXECUTION_CONTEXT',
					'Queries are not available during this hook phase.',
					{
						publicMessage: 'Queries are not available during this hook phase.',
						internalDetails: {
							reason: 'hook-query-engine-unavailable',
						},
					},
				)
			}

			return lifetime.run(operation)
		},
	})
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
			getValue: (token) => {
				lifetime.assertActive()
				return request.getValue(token)
			},
			hasCapability: (capability) => {
				lifetime.assertActive()
				return request.hasCapability(capability)
			},
		},
	)

	return immutableRecord({ context, lifetime, queryGuard })
}
