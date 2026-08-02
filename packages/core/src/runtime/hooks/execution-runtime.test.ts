import { FrameworkError } from '../../foundation.js'
import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'
import { setTimeout as delay } from 'node:timers/promises'

import {
	getHookHandlerEntries,
	normalizeHookDeclarations,
	type NormalizedHookHandler,
} from '../../schema/hooks/normalization.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import type { HookDiagnosticEvent } from './diagnostics.js'
import type { HookExecutionDescriptor } from './execution-descriptor.js'
import {
	applicationHookOwner,
	createHookExecutionDescriptor,
} from './execution-descriptor.js'
import { HookExecutionRuntime } from './execution-runtime.js'

const request = RequestContext.anonymous({
	metadata: { diagnosticSecret: 'must-not-leak' },
	requestId: 'hook-execution-runtime',
	source: requestSources.internal,
})

const createDescriptor = (
	phase: 'beforeCreate' | 'beforeUpdate',
	className: string,
	handlerIndex = 0,
): HookExecutionDescriptor => {
	return createHookExecutionDescriptor({
		handler: () => undefined,
		handlerIndex,
		operationKind: 'create-one' as const,
		owner: applicationHookOwner,
		phase,
		target: immutableRecord({ className, kind: 'schema' as const }),
	})
}

const requireHandlerEntry = (
	entry: NormalizedHookHandler | undefined,
): NormalizedHookHandler => {
	if (entry === undefined) {
		throw new TypeError('Expected one normalized hook handler entry')
	}

	return entry
}

describe('HookExecutionRuntime', () => {
	it('rejects direct and indirect active-hook recursion with a safe stack', async () => {
		const runtime = new HookExecutionRuntime(undefined)
		const first = createDescriptor('beforeCreate', 'Article')
		const second = createDescriptor('beforeUpdate', 'Article')

		const direct = runtime.invoke(first, request, () =>
			runtime.invoke(first, request, () => undefined),
		)

		await expect(direct).rejects.toMatchObject({ code: 'HOOK_RECURSION' })

		try {
			await runtime.invoke(first, request, () =>
				runtime.invoke(second, request, () =>
					runtime.invoke(first, request, () => undefined),
				),
			)
			expect.unreachable('Expected indirect hook recursion to fail')
		} catch (error: unknown) {
			if (!(error instanceof FrameworkError)) {
				throw error
			}

			expect(error.code).toBe('HOOK_RECURSION')
			expect(error.toJSON()).toStrictEqual({
				code: 'HOOK_RECURSION',
				message: 'A recursive hook execution was rejected.',
				retryable: false,
			})
			expect(Object.isFrozen(error.internalDetails?.stack)).toBe(true)
			expect(JSON.stringify(error)).not.toContain('must-not-leak')
		}
	})

	it('allows other hook identities and isolates concurrent root stacks', async () => {
		const runtime = new HookExecutionRuntime(undefined)
		const first = createDescriptor('beforeCreate', 'Article')
		const otherTarget = createDescriptor('beforeCreate', 'Comment')
		const trace: string[] = []

		await runtime.invoke(first, request, () =>
			runtime.invoke(otherTarget, request, () => {
				trace.push('nested-other-target')
			}),
		)

		await Promise.all([
			runtime.invoke(first, request, async () => {
				await Promise.resolve()
				trace.push('first-root')
			}),
			runtime.invoke(first, request, async () => {
				await Promise.resolve()
				trace.push('second-root')
			}),
		])

		expect(trace).toStrictEqual([
			'nested-other-target',
			'first-root',
			'second-root',
		])
	})

	it('uses stable family branches instead of composed-list positions', async () => {
		const shared = () => undefined
		const create = () => undefined
		const update = () => undefined
		const declarations = normalizeHookDeclarations({
			descriptors: {
				beforeSave: {
					order: 'broad-first',
					variants: ['create', 'update'],
				},
			},
			hooks: { beforeSave: { all: shared, create, update } },
			phases: ['beforeSave'],
			scope: 'fixture',
		})
		const createEntries = getHookHandlerEntries(
			declarations,
			'beforeSave',
			'create',
		)
		const updateEntries = getHookHandlerEntries(
			declarations,
			'beforeSave',
			'update',
		)
		const toDescriptor = (
			entry: NormalizedHookHandler,
			operationKind: 'create-one' | 'update-one',
		): HookExecutionDescriptor =>
			createHookExecutionDescriptor({
				...entry,
				operationKind,
				owner: applicationHookOwner,
				phase: 'beforeSave',
				target: immutableRecord({
					className: 'FamilyArticle',
					kind: 'schema' as const,
				}),
			})
		const runtime = new HookExecutionRuntime(undefined)
		const createSpecific = toDescriptor(
			requireHandlerEntry(createEntries[1]),
			'create-one',
		)
		const updateSpecific = toDescriptor(
			requireHandlerEntry(updateEntries[1]),
			'update-one',
		)
		const createShared = toDescriptor(
			requireHandlerEntry(createEntries[0]),
			'create-one',
		)
		const updateShared = toDescriptor(
			requireHandlerEntry(updateEntries[0]),
			'update-one',
		)

		await expect(
			runtime.invoke(createSpecific, request, () =>
				runtime.invoke(updateSpecific, request, () => undefined),
			),
		).resolves.toBeUndefined()
		await expect(
			runtime.invoke(createShared, request, () =>
				runtime.invoke(updateShared, request, () => undefined),
			),
		).rejects.toMatchObject({ code: 'HOOK_RECURSION' })
	})

	it('reports redacted immutable diagnostics without trusting the observer', async () => {
		const events: HookDiagnosticEvent[] = []
		const observerFailure = new Error('observer failure')
		const runtime = new HookExecutionRuntime((event) => {
			events.push(event)
			throw observerFailure
		})
		const descriptor = createDescriptor('beforeCreate', 'Article')

		await expect(
			runtime.invoke(descriptor, request, () => 'business-result'),
		).resolves.toBe('business-result')

		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({
			depth: 0,
			handlerIndex: 0,
			kind: 'hook',
			operationKind: 'create-one',
			phase: 'beforeCreate',
			requestId: 'hook-execution-runtime',
			status: 'succeeded',
			transactionId: undefined,
		})
		expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0)
		expect(Object.isFrozen(events[0])).toBe(true)
		expect(JSON.stringify(events[0])).not.toContain('must-not-leak')
	})

	it('preserves a business failure when an async diagnostic observer rejects', async () => {
		const businessFailure = new Error('business failure')
		const runtime = new HookExecutionRuntime(() =>
			Promise.reject(new Error('async observer failure')),
		)
		const descriptor = createDescriptor('beforeCreate', 'Article')

		await expect(
			runtime.invoke(descriptor, request, () => {
				throw businessFailure
			}),
		).rejects.toBe(businessFailure)
	})

	it('does not trust framework-like codes from arbitrary hook errors', async () => {
		const events: HookDiagnosticEvent[] = []
		const runtime = new HookExecutionRuntime((event) => {
			events.push(event)
		})
		const codedError = Object.assign(new Error('plugin error'), {
			code: 'OPERATION_CANCELLED' as const,
		})

		await expect(
			runtime.invoke(
				createDescriptor('beforeCreate', 'Article'),
				request,
				() => {
					throw codedError
				},
			),
		).rejects.toBe(codedError)
		expect(events[0]).toMatchObject({ status: 'failed' })
		expect(events[0]).not.toHaveProperty('errorCode')
	})

	it('turns cooperative cancellation into a typed failure after settlement', async () => {
		const controller = new AbortController()
		const cancellableRequest = RequestContext.anonymous({
			requestId: 'cancelled-hook',
			signal: controller.signal,
			source: requestSources.internal,
		})
		const events: HookDiagnosticEvent[] = []
		const runtime = new HookExecutionRuntime((event) => {
			events.push(event)
		})
		const descriptor = createDescriptor('beforeCreate', 'Article')

		await expect(
			runtime.invoke(descriptor, cancellableRequest, () => {
				controller.abort('sensitive abort reason')
			}),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })

		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({
			errorCode: 'OPERATION_CANCELLED',
			status: 'cancelled',
		})
		expect(JSON.stringify(events[0])).not.toContain('sensitive')
	})

	it('waits for a timed-out hook to settle before rejecting its result', async () => {
		let settled = false
		const timeoutRequest = RequestContext.anonymous({
			requestId: 'timed-out-hook',
			signal: AbortSignal.timeout(20),
			source: requestSources.internal,
		})
		const runtime = new HookExecutionRuntime(undefined)
		const descriptor = createDescriptor('beforeCreate', 'Article')

		await expect(
			runtime.invoke(descriptor, timeoutRequest, async () => {
				await delay(40)
				settled = true

				return 'late-result'
			}),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })

		// The Runtime never detaches a still-running business callback with Promise.race.
		expect(settled).toBe(true)

		try {
			await runtime.invoke(descriptor, timeoutRequest, () => undefined)
			expect.unreachable('Expected the elapsed deadline to reject the hook')
		} catch (error: unknown) {
			if (!(error instanceof FrameworkError)) {
				throw error
			}

			expect(error.internalDetails?.reason).toBe('deadline-exceeded')
		}
	})
})
