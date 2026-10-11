import { UltimaBase, dateTimeField } from '@ultimabase/core'
import type {
	PluginSchemaMutationDefinition,
	PluginSourceSchemaPermissions,
} from '@ultimabase/core/plugin'
import { expectTypeOf, test } from 'vitest'

import {
	command,
	definePlugin,
	shapeMethod,
	type CommandDefinition,
	type CommandMutation,
	type ShapeMethodArguments,
} from '../index.js'

const archive = shapeMethod({
	fields: { archivedAt: dateTimeField() },
	commands: {
		archiveOne: command({ authority: 'request', effect: 'update' }),
		archiveMany: command({
			authority: 'request',
			effect: 'update',
			target: 'many',
		}),
		purgeOne: command({ authority: 'master', effect: 'delete' }),
	},
})
const labelled = shapeMethod({
	options: (value): { readonly label: string } => ({ label: String(value) }),
})

test('infers each command from its options alone', () => {
	expectTypeOf(
		command({ authority: 'request', effect: 'update' }),
	).toEqualTypeOf<CommandDefinition<'request', 'update', 'one'>>()
	expectTypeOf(
		command({ authority: 'master', effect: 'delete', target: 'many' }),
	).toEqualTypeOf<CommandDefinition<'master', 'delete', 'many'>>()
	expectTypeOf<
		CommandMutation<CommandDefinition<'master', 'delete', 'many'>>
	>().toExtend<
		PluginSchemaMutationDefinition<
			string,
			'1.0.0',
			undefined,
			readonly [],
			'master',
			'delete',
			'before'
		>
	>()
})

test('types shape-method arguments from the validator', () => {
	expectTypeOf<ShapeMethodArguments<typeof archive>>().toEqualTypeOf<
		readonly []
	>()
	expectTypeOf<ShapeMethodArguments<typeof labelled>>().toEqualTypeOf<
		readonly [options?: { readonly label: string }]
	>()
})

test('projects fields, commands and rules into form D schemas', () => {
	const App = UltimaBase.use(
		definePlugin({
			name: '@community/archive',
			shape: { archivable: archive, labelled },
			rules: {
				audit: (value): boolean => value === true,
			},
		}),
	)
	const Post = App.Schema.define({
		className: 'TypedFacadePost',
		fields: (field) => ({ title: field.string() }),
	})
		.archivable()
		.labelled({ label: 'x' })
		.with({ audit: true })

	expectTypeOf(
		Post.archiveOne({ id: 'post-1', select: { archivedAt: true } }),
	).resolves.toEqualTypeOf<{
		readonly id: string
		readonly archivedAt: string | null
	}>()
	expectTypeOf(Post.archiveMany({ where: {} })).resolves.toExtend<
		readonly object[]
	>()
	void Post.purgeOne({ id: 'post-1' })
	// @ts-expect-error -- The method takes no argument without a validator.
	void App.Schema.define({ className: 'A', fields: () => ({}) }).archivable({})
	App.Schema.define({ className: 'B', fields: () => ({}) })
		// @ts-expect-error -- The options object is checked against the validator.
		.labelled({ label: 1 })
	App.Schema.define({ className: 'C', fields: () => ({}) }).with({
		// @ts-expect-error -- `.with` checks the rule value.
		audit: 'yes',
	})
	// @ts-expect-error -- Server-written fields are rejected in create input.
	void Post.createOne({ data: { archivedAt: null } })
	const Plain = App.Schema.define({
		className: 'TypedFacadePlain',
		fields: (field) => ({ title: field.string() }),
	}).with({})
	// @ts-expect-error -- No command without the shape method.
	void Plain.archiveOne
})

test('projects shape-method permissions for rule plugins (ADR-0317)', () => {
	const App = UltimaBase.use(
		definePlugin({
			name: '@community/archive-permission',
			shape: {
				archivable: shapeMethod({ permissions: ['readArchived'] }),
			},
		}),
	)
	const Archived = App.Schema.define({
		className: 'TypedPermissionArchived',
		fields: (field) => ({ title: field.string() }),
	})
		.archivable()
		.with({})
	const Plain = App.Schema.define({
		className: 'TypedPermissionPlain',
		fields: (field) => ({ title: field.string() }),
	}).with({})

	expectTypeOf<
		PluginSourceSchemaPermissions<typeof Archived>
	>().toEqualTypeOf<'readArchived'>()
	expectTypeOf<PluginSourceSchemaPermissions<typeof Plain>>().toBeNever()
})
