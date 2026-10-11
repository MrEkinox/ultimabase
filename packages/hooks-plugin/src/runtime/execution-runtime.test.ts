import { FrameworkError } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'
import { setTimeout as delay } from 'node:timers/promises'

import type { HookDiagnosticEvent } from './diagnostics.js'
import type { HookExecutionDescriptor } from './execution-runtime.js'
import {
	applicationHookOwner,
	createHookExecutionDescriptor,
	createPluginHookOwner,
} from './execution-runtime.js'
import { HookExecutionRuntime } from './execution-runtime.js'
import {
	RequestContext,
	requestSources,
	type ApplicationCallbackExecutor,
} from '@ultimabase/core/plugin'

const request = RequestContext.anonymous({
	metadata: { diagnosticSecret: 'must-not-leak' },
	requestId: 'hook-execution-runtime',
	source: requestSources.internal,
})

const createDescriptor = (
	phase: 'afterOperation' | 'beforeOperation',
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

describe('HookExecutionRuntime', () => {
	it('reattributes application and contributed plugin handlers exactly', async () => {
		const trace: string[] = []
		const callbacks: ApplicationCallbackExecutor = {
			runApplication: (callback) => {
				trace.push('owner:application')
				return callback()
			},
			runPlugin: (owner, callback) => {
				trace.push(`owner:${owner.pluginId}:${owner.instanceId ?? 'default'}`)
				return callback()
			},
		}
		const runtime = new HookExecutionRuntime(
			undefined,
			immutableArray([]),
			callbacks,
		)
		const application = createDescriptor('beforeOperation', 'Article')
		const plugin = createHookExecutionDescriptor({
			handler: () => undefined,
			handlerIndex: 0,
			operationKind: 'create-one',
			owner: createPluginHookOwner(
				'fixture.hook-provider',
				'audit-hook',
				'worker',
			),
			phase: 'beforeOperation',
			target: immutableRecord({
				className: 'Article',
				kind: 'schema' as const,
			}),
		})

		await runtime.invoke(application, request, async () => {
			await Promise.resolve()
			trace.push('callback:application')
		})
		await runtime.invoke(plugin, request, () => {
			trace.push('callback:plugin')
		})

		expect(trace).toStrictEqual([
			'owner:application',
			'callback:application',
			'owner:fixture.hook-provider:worker',
			'callback:plugin',
		])
	})

	it('allows 16 nested hook operations and rejects the 17th with its chain', async () => {
		const runtime = new HookExecutionRuntime(undefined)
		const hook = createDescriptor('beforeOperation', 'Article')
		const nest = (remaining: number): Promise<number> =>
			runtime.invoke(hook, request, () =>
				remaining === 0 ? 0 : nest(remaining - 1).then((depth) => depth + 1),
			)

		await expect(nest(16)).resolves.toBe(16)

		try {
			await nest(17)
			expect.unreachable('Expected the depth limit to fail')
		} catch (error: unknown) {
			if (!(error instanceof FrameworkError)) throw error
			expect(error.code).toBe('RUNTIME_CALLBACK_RECURSION')
			expect(error.message).toBe(
				`Hooks nested more than 16 operations: ${Array.from({ length: 18 }, () => 'Article.create-one').join(' -> ')}.`,
			)
			expect(error.toJSON()).toStrictEqual({
				code: 'RUNTIME_CALLBACK_RECURSION',
				message: 'A recursive hook execution was rejected.',
				retryable: false,
			})
			expect(JSON.stringify(error)).not.toContain('must-not-leak')
		}
	})

	it('lets the same hook nest and isolates concurrent root stacks', async () => {
		const runtime = new HookExecutionRuntime(undefined)
		const first = createDescriptor('beforeOperation', 'Article')
		const trace: string[] = []

		// A child completing its parent re-enters the same hook (ADR-0318).
		await runtime.invoke(first, request, () =>
			runtime.invoke(first, request, () => {
				trace.push('nested-same-hook')
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
			'nested-same-hook',
			'first-root',
			'second-root',
		])
	})

	it('reports redacted immutable diagnostics without trusting the observer', async () => {
		const events: HookDiagnosticEvent[] = []
		const observerFailure = new Error('observer failure')
		const runtime = new HookExecutionRuntime((event) => {
			events.push(event)
			throw observerFailure
		})
		const descriptor = createDescriptor('beforeOperation', 'Article')

		await expect(
			runtime.invoke(descriptor, request, () => 'business-result'),
		).resolves.toBe('business-result')

		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({
			depth: 0,
			handlerIndex: 0,
			kind: 'hook',
			operationKind: 'create-one',
			phase: 'beforeOperation',
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
		const descriptor = createDescriptor('beforeOperation', 'Article')

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
				createDescriptor('beforeOperation', 'Article'),
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
		const descriptor = createDescriptor('beforeOperation', 'Article')

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
		const descriptor = createDescriptor('beforeOperation', 'Article')

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
