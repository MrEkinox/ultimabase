import { expectTypeOf, test } from 'vitest'

import { defineOperationValue } from './plugin-operations.js'
import {
	defineSchemaMutation,
	type PluginSchemaMutationErrorCode,
	type PluginSchemaMutationInput,
} from './plugin-schema-mutations.js'

const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['fixture.workflow.denied', 'fixture.workflow.conflict'] as const,
	input: defineOperationValue((value: unknown) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('reason' in value) ||
			typeof value.reason !== 'string'
		) {
			throw new TypeError('reason must be a string')
		}
		return { reason: value.reason } as const
	}),
	name: 'fixture.workflow.archive',
	returning: 'after',
	select: { workflowState: true },
	version: '1.2.3',
})

test('retains exact schema mutation literals and public helper types', () => {
	expectTypeOf(archive.name).toEqualTypeOf<'fixture.workflow.archive'>()
	expectTypeOf(archive.version).toEqualTypeOf<'1.2.3'>()
	expectTypeOf(archive.effect).toEqualTypeOf<'update'>()
	expectTypeOf<PluginSchemaMutationInput<typeof archive>>().toEqualTypeOf<
		Readonly<{ readonly reason: string }>
	>()
	expectTypeOf<PluginSchemaMutationErrorCode<typeof archive>>().toEqualTypeOf<
		'fixture.workflow.denied' | 'fixture.workflow.conflict'
	>()
})
