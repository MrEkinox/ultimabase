import { expectTypeOf, test } from 'vitest'

import type {
	AnonymousRequestAccess,
	MasterRequestAccess,
} from '../../access/index.js'
import type { CapabilityToken } from '../../plugins/capabilities.js'
import type { RequestContext } from '../context/request-context.js'
import {
	applicationRequestExecutionCapability,
	type ApplicationRequestExecutor,
} from './application-request-execution.js'

declare const executor: ApplicationRequestExecutor

test('retains exact request sources, contexts, and callback results', async () => {
	const anonymous = executor.createAnonymousContext({
		requestId: 'request-1',
		source: 'fixture-http',
	})
	expectTypeOf(anonymous).toEqualTypeOf<
		RequestContext<AnonymousRequestAccess, 'fixture-http'>
	>()

	const synchronous = executor.runWithContext(anonymous, (context) => ({
		requestId: context.requestId,
		source: context.source,
	}))
	expectTypeOf(synchronous).toEqualTypeOf<{
		requestId: string
		source: 'fixture-http'
	}>()

	const asynchronous = executor.runWithContext(anonymous, async () => {
		await Promise.resolve()
		return 1 as const
	})
	expectTypeOf(asynchronous).toEqualTypeOf<Promise<1>>()

	const master = await executor.verifyMasterKey({
		context: anonymous,
		rawKey: 'raw-key',
		reason: 'Fixture verification',
	})
	expectTypeOf(master).toEqualTypeOf<
		RequestContext<MasterRequestAccess, 'fixture-http'>
	>()
	void executor.verifyMasterKey({
		// @ts-expect-error -- verified Master authority is inherited, not re-verified.
		context: master,
		rawKey: 'raw-key',
		reason: 'x',
	})

	// @ts-expect-error -- raw credentials must be strings.
	void executor.verifyMasterKey({ context: anonymous, rawKey: 1, reason: 'x' })
	void executor.verifyMasterKey({
		context: anonymous,
		rawKey: 'raw-key',
		reason: 'x',
		// @ts-expect-error -- authority selection cannot enter verification options.
		useMasterKey: true,
	})
})

test('exports one exact single application-lifetime protocol', () => {
	expectTypeOf(applicationRequestExecutionCapability).toEqualTypeOf<
		CapabilityToken<
			ApplicationRequestExecutor,
			ApplicationRequestExecutor,
			'ultimabase.application-request-execution',
			'1.0.0',
			'single',
			'application'
		>
	>()
})
