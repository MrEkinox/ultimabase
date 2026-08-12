import { immutableRecord } from '@ultimabase/shared'
import { expectTypeOf, test } from 'vitest'

import { UltimaBase } from '../runtime/application/ultima-base.js'
import type {
	ApplicationOperationHandle,
	ApplicationSchemaHandle,
	PluginOperationEnvelope,
} from '../application/application-handles.js'
import { QueryBuilder } from '../query/query/query.js'
import { Schema } from '../schema/schema/definition.js'
import { definePlugin } from './definition.js'
import { defineQueryExtension } from './application-surface-declarations.js'
import {
	defineOperation,
	defineOperationValue,
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
	input,
	name: 'fixture.types.inspect',
	result,
	target: 'application',
	transaction: 'optional',
	version: '1.2.3',
})
const schemaCommand = defineOperation({
	input,
	name: 'fixture.types.schema-command',
	result,
	target: 'schema',
	transaction: 'required',
	version: '2.0.0',
})
const modelCommand = defineOperation({
	input,
	name: 'fixture.types.model-command',
	result,
	target: 'model',
	transaction: 'required',
	version: '2.0.0',
})
const query = defineQueryExtension({
	apply: (schema, value) =>
		new QueryBuilder(schema).where({ title: { eq: value } }),
	input,
	name: 'fixture.types.by-title',
	version: '1.0.0',
})
const Post = Schema.define({
	className: 'ApplicationSurfaceTypePost',
	fields: (field) => ({ title: field.string() }),
})
const plugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.application-surface-types',
	privileges: [
		{ name: 'model:extend', reason: 'Adds typed model commands.' },
		{ name: 'operation:declare', reason: 'Declares typed operations.' },
		{ name: 'query:extend', reason: 'Adds typed query extensions.' },
	] as const,
	version: '1.0.0',
	declare: ({ models, operations, queries }) => {
		operations.declare(inspect)
		operations.declare(schemaCommand)
		operations.declare(modelCommand)
		models.extend(
			{ className: Post.className },
			{
				contributionId: 'commands',
				modelCommands: { publish: modelCommand },
				schemaCommands: { publish: schemaCommand },
			},
		)
		queries.extend(
			{ className: Post.className },
			{ contributionId: 'queries', extensions: { byTitle: query } },
		)
	},
})

test('preserves exact operation descriptors and bootstrap handles', () => {
	expectTypeOf(inspect.name).toEqualTypeOf<'fixture.types.inspect'>()
	expectTypeOf(inspect.version).toEqualTypeOf<'1.2.3'>()
	expectTypeOf(inspect.target).toEqualTypeOf<'application'>()
	expectTypeOf<PluginOperationInput<typeof inspect>>().toEqualTypeOf<string>()
	expectTypeOf<PluginOperationResult<typeof inspect>>().toEqualTypeOf<number>()

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
	// @ts-expect-error -- The stable token retains its exact input contract.
	operation.prepare(1)

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
