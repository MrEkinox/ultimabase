import { RequestCapability, RequestContextValue } from '../../access/index.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { expectTypeOf, test } from 'vitest'

import {
	RequestContext,
	type RequestMetadata,
	requestSources,
} from './request-context.js'

interface FixturePrincipal {
	readonly id: string
}

const principalValue = new RequestContextValue<FixturePrincipal>(
	'fixture.principal',
	(value: unknown): FixturePrincipal => {
		if (!isPlainRecord(value) || typeof value.id !== 'string') {
			throw new TypeError('Fixture principal must contain a string id')
		}

		return immutableRecord({ id: value.id })
	},
)

test('correlates access, source, and immutable request values', () => {
	const capability = new RequestCapability('tenant:read')
	const anonymous = RequestContext.anonymous({
		requestId: 'request-1',
		source: 'fixture.transport',
	})
	const scoped = RequestContext.anonymous({
		capabilities: [capability],
		metadata: { trace: 'trace-1' },
		requestId: 'request-2',
		source: 'grpc',
	}).withValue(principalValue, { id: 'user-1' })

	expectTypeOf(anonymous.access.mode).toEqualTypeOf<'anonymous'>()
	expectTypeOf(anonymous.source).toEqualTypeOf<'fixture.transport'>()
	expectTypeOf(requestSources.internal).toEqualTypeOf<'internal'>()
	expectTypeOf(scoped.access.mode).toEqualTypeOf<'anonymous'>()
	expectTypeOf(scoped.source).toEqualTypeOf<'grpc'>()
	expectTypeOf(scoped.getValue(principalValue)).toEqualTypeOf<
		FixturePrincipal | undefined
	>()
	expectTypeOf(scoped.hasCapability(capability)).toBeBoolean()

	expectTypeOf<'master'>().not.toExtend<keyof typeof RequestContext>()
	expectTypeOf<'user'>().not.toExtend<keyof typeof RequestContext>()
	// @ts-expect-error -- Access state cannot change during execution.
	scoped.access = { mode: 'anonymous' }
	// @ts-expect-error -- Request metadata is readonly at the context boundary.
	scoped.metadata.trace = 'changed'
	// @ts-expect-error -- Capability collections cannot change after construction.
	scoped.capabilities[0] = capability
	// @ts-expect-error -- Raw master keys are excluded from typed metadata.
	const unsafeMetadata: RequestMetadata = { masterKey: 'secret' }
	// @ts-expect-error -- Authentication credentials are excluded from metadata.
	const unsafeSessionMetadata: RequestMetadata = { sessionToken: 'secret' }
	// @ts-expect-error -- The token type drives the derived value type.
	scoped.withValue(principalValue, { id: 1 })

	expectTypeOf(unsafeMetadata).toBeObject()
	expectTypeOf(unsafeSessionMetadata).toBeObject()
})
