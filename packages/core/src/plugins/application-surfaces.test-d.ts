import { immutableRecord } from '@ultimabase/shared'
import { expectTypeOf, test } from 'vitest'

import type {
	ApplicationOperationHandle,
	ApplicationSchemaHandle,
	PluginOperationEnvelope,
} from '../application/application-handles.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
import { Schema } from '../schema/schema/definition.js'
import { definePlugin } from './definition.js'
import {
	defineOperation,
	defineOperationValue,
	type PluginOperationErrorCode,
	type PluginOperationInput,
	type PluginOperationResult,
} from './plugin-operations.js'

const input = defineOperationValue((value: unknown) => {
	if (typeof value !== 'string') throw new TypeError('input must be a string')
	return value
})
const result = defineOperationValue((value: unknown) => {
	if (typeof value !== 'number') throw new TypeError('result must be a number')
	return value
})
const inspect = defineOperation({
	errors: ['fixture.types.denied', 'fixture.types.conflict'] as const,
	input,
	name: 'fixture.types.inspect',
	result,
	target: 'application',
	transaction: 'optional',
	version: '1.2.3',
})
const Post = Schema.define({
	className: 'ApplicationSurfaceTypePost',
	fields: (field) => ({ title: field.string() }),
})
const plugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.application-surface-types',
	privileges: [
		{ name: 'operation:declare', reason: 'Declares typed operations.' },
	] as const,
	version: '1.0.0',
	declare: ({ operations }) => {
		operations.declare(inspect)
	},
})

test('preserves exact operation descriptors and bootstrap handles', () => {
	expectTypeOf(inspect.name).toEqualTypeOf<'fixture.types.inspect'>()
	expectTypeOf(inspect.version).toEqualTypeOf<'1.2.3'>()
	expectTypeOf(inspect.target).toEqualTypeOf<'application'>()
	expectTypeOf<PluginOperationInput<typeof inspect>>().toEqualTypeOf<string>()
	expectTypeOf<PluginOperationResult<typeof inspect>>().toEqualTypeOf<number>()
	expectTypeOf<PluginOperationErrorCode<typeof inspect>>().toEqualTypeOf<
		'fixture.types.denied' | 'fixture.types.conflict'
	>()

	const ultimabase = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [plugin],
		schemas: [Post],
	})
	const operation = ultimabase.operation(inspect)
	expectTypeOf(operation).toEqualTypeOf<
		ApplicationOperationHandle<typeof inspect>
	>()
	expectTypeOf(operation.prepare('value')).toEqualTypeOf<
		PluginOperationEnvelope<typeof inspect>
	>()
	expectTypeOf(operation.execute('value')).toEqualTypeOf<Promise<number>>()
	// @ts-expect-error -- The stable token retains its exact input contract.
	operation.prepare(1)
	// @ts-expect-error -- Execution retains the same exact input contract.
	void operation.execute(1)

	const post = ultimabase.schema(Post)
	expectTypeOf(post).toEqualTypeOf<ApplicationSchemaHandle<typeof Post>>()
	expectTypeOf(post.schema).toEqualTypeOf<typeof Post>()
	expectTypeOf(post.findMany()).toEqualTypeOf<
		ReturnType<typeof Post.findMany>
	>()
	expectTypeOf(
		ultimabase.schema('UnknownAtBootstrap').schema.className,
	).toEqualTypeOf<'UnknownAtBootstrap'>()
})

test('exposes declaration facades only for their exact privileges', () => {
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.no-surface-privilege',
		version: '1.0.0',
		declare: (context) => {
			expectTypeOf(context).not.toHaveProperty('models')
			expectTypeOf(context).not.toHaveProperty('queries')
			expectTypeOf(context).not.toHaveProperty('operations')
			expectTypeOf(context).not.toHaveProperty('runtime')
		},
	})

	const detached = defineOperationValue((value: unknown) =>
		immutableRecord({ value }),
	)
	expectTypeOf(detached.snapshot('value', 'input')).toEqualTypeOf<
		Readonly<{ readonly value: unknown }>
	>()
})

// Retired operation targets cannot reappear through generic inference.
defineOperation({
	input,
	name: 'fixture.types.retired-schema-command',
	result,
	// @ts-expect-error -- Generic operations now target the application only.
	target: 'schema',
	transaction: 'required',
	version: '1.0.0',
})
