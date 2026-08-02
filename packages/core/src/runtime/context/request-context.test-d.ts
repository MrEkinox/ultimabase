import { RequestCapability } from '../../access/index.js'
import { expectTypeOf, test } from 'vitest'

import {
	RequestContext,
	type RequestMetadata,
	requestSources,
} from './request-context.js'

test('correlates access, source, and immutable request values', () => {
	const capability = new RequestCapability('tenant:read')
	const anonymous = RequestContext.anonymous({
		requestId: 'request-1',
		source: requestSources.rest,
	})
	const user = RequestContext.user('user-1', {
		capabilities: [capability],
		metadata: { trace: 'trace-1' },
		requestId: 'request-2',
		source: 'grpc',
	})

	expectTypeOf(anonymous.access.mode).toEqualTypeOf<'anonymous'>()
	expectTypeOf(anonymous.source).toEqualTypeOf<'rest'>()
	expectTypeOf(user.access.mode).toEqualTypeOf<'user'>()
	expectTypeOf(user.access.userId).toEqualTypeOf<'user-1'>()
	expectTypeOf(user.source).toEqualTypeOf<'grpc'>()
	expectTypeOf(user.hasCapability(capability)).toBeBoolean()

	expectTypeOf<'master'>().not.toExtend<keyof typeof RequestContext>()
	// @ts-expect-error -- Access state cannot change during execution.
	user.access = { mode: 'anonymous' }
	// @ts-expect-error -- Request metadata is readonly at the context boundary.
	user.metadata.trace = 'changed'
	// @ts-expect-error -- Capability collections cannot change after construction.
	user.capabilities[0] = capability
	// @ts-expect-error -- Raw master keys are excluded from typed metadata.
	const unsafeMetadata: RequestMetadata = { masterKey: 'secret' }

	expectTypeOf(unsafeMetadata).toBeObject()
})
