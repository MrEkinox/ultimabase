import {
	FrameworkError,
	jsonField,
	snapshotScalarFieldValue,
	TrackedExecutionLifetime,
	type JsonDocument,
	type QueryExecutionGuard,
	type RequestContext,
} from '@ultimabase/core'
import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import {
	createTrustedHookContext,
	type HookContext,
	type HookContextIdentity,
} from '../context/hook-context.js'
import { getHookEventContractImplementation } from './events.js'

export interface HookContextEmission {
	readonly delivery: 'optional' | 'required'
	readonly hook: HookContextIdentity
	readonly name: string
	readonly payload: JsonDocument
	readonly request: RequestContext
}

export interface RuntimeHookContextScope {
	readonly context: HookContext
	readonly lifetime: TrackedExecutionLifetime
	readonly queryGuard: QueryExecutionGuard
}

const hookEventPayloadField = jsonField()

/** Creates one Runtime-owned context and its per-invocation revocable lease. */
export const createRuntimeHookContext = ({
	emit,
	hook,
	queryable,
	request,
	transactionId,
}: Readonly<{
	emit: (emission: HookContextEmission) => void
	hook: HookContextIdentity
	queryable: boolean
	request: RequestContext
	transactionId: string | undefined
}>): RuntimeHookContextScope => {
	// Contexts and queries retained after the callback share one stable failure.
	const lifetime = new TrackedExecutionLifetime(
		() =>
			new FrameworkError(
				'RUNTIME_CALLBACK_CONTEXT_CLOSED',
				'Hook context cannot be used after its callback has completed.',
				{
					publicMessage: 'The hook context is no longer active.',
					internalDetails: { reason: 'hook-context-closed' },
				},
			),
	)
	const queryGuard: QueryExecutionGuard = immutableRecord({
		run: <TResult>(operation: () => Promise<TResult>): Promise<TResult> => {
			lifetime.assertActive()
			if (!queryable) {
				throw new FrameworkError(
					'MISSING_EXECUTION_CONTEXT',
					'Queries are not available during this hook phase.',
					{
						publicMessage: 'Queries are not available during this hook phase.',
						internalDetails: { reason: 'hook-query-engine-unavailable' },
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
			emit: (event, payload): void => {
				lifetime.assertActive()
				const contract =
					typeof event === 'string'
						? { delivery: 'required' as const, name: event }
						: getHookEventContractImplementation(event)
				if (contract === undefined) {
					throw new TypeError('Invalid hook event contract')
				}
				assertNonEmptyString(contract.name, 'Hook event name')
				emit({
					delivery: contract.delivery,
					hook,
					name: contract.name,
					// Detaches the payload from developer-owned mutable state.
					payload: snapshotScalarFieldValue(
						hookEventPayloadField,
						payload,
						'hook event payload',
					),
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
