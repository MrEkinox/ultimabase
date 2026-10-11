import { describe, expect, it } from 'vitest'

import type { HookContextIdentity } from '../context/hook-context.js'
import { defineEvent } from './events.js'
import { createRuntimeHookContext } from './hook-context-runtime.js'
import {
	RequestCapability,
	RequestContext,
	RequestContextValue,
} from '@ultimabase/core/plugin'

const identity: HookContextIdentity = {
	declarationBranch: 'direct',
	handlerIndex: 0,
	operationKind: 'create-one',
	owner: { kind: 'application' },
	phase: 'beforeOperation',
	target: { className: 'RevocableHookArticle', kind: 'schema' },
}

const requestValue = new RequestContextValue('fixture.hook-value', (value) => {
	if (typeof value !== 'string') throw new TypeError('Expected string value')
	return value
})
const requestCapability = new RequestCapability('fixture:hook-capability')
const articleCreated = defineEvent<{ readonly nested: { readonly value: string } }>(
	'article.created',
)
const lateEvent = defineEvent('late.event')

const request = RequestContext.anonymous({
	capabilities: [requestCapability],
	requestId: 'revocable-hook-context',
	source: 'internal',
}).withValue(requestValue, 'visible')

describe('Runtime HookContext revocation', () => {
	it('exposes only active request capabilities and snapshots emitted payloads', async () => {
		const emissions: unknown[] = []
		const scope = createRuntimeHookContext({
			emit: (emission) => emissions.push(emission),
			hook: identity,
			principal: undefined,
			queryable: true,
			request,
			transactionId: 'transaction-1',
		})
		const payload = { nested: { value: 'original' } }

		expect(scope.context.getValue(requestValue)).toBe('visible')
		expect(scope.context.hasCapability(requestCapability)).toBe(true)
		scope.context.emit(articleCreated, payload)
		payload.nested.value = 'mutated'
		await expect(
			scope.queryGuard.run(() => Promise.resolve('result')),
		).resolves.toBe('result')

		expect(emissions).toEqual([
			expect.objectContaining({
				contract: articleCreated,
				name: 'article.created',
				payload: { nested: { value: 'original' } },
				request,
			}),
		])
		expect(Object.isFrozen(scope.context)).toBe(true)
		await scope.lifetime.close()

		for (const retainedCapability of [
			() => scope.context.getValue(requestValue),
			() => scope.context.hasCapability(requestCapability),
			() => {
				scope.context.emit(lateEvent, {})
			},
			() => scope.queryGuard.run(() => Promise.resolve()),
		]) {
			expect(retainedCapability).toThrow(
				expect.objectContaining({
					code: 'RUNTIME_CALLBACK_CONTEXT_CLOSED',
				}),
			)
		}
	})

	it('rejects queries in non-queryable phases and forged event contracts', async () => {
		const scope = createRuntimeHookContext({
			emit: () => undefined,
			hook: identity,
			principal: undefined,
			queryable: false,
			request,
			transactionId: undefined,
		})

		expect(() => scope.queryGuard.run(() => Promise.resolve())).toThrow(
			expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
		)
		expect(() => {
			scope.context.emit(
				{ kind: 'hook-event-contract', name: 'forged.event' },
				{},
			)
		}).toThrow('context.emit requires an event created by defineEvent')
		await scope.lifetime.close()
	})
})
