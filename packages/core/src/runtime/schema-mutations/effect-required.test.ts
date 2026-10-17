import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import { readMutationCommand } from '../../plugins/command-graph.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { contributeDeclarations } from '../../plugins/plugin-contributions.js'
import { defineOperationValue } from '../../plugins/plugin-operations.js'
import { defineSchemaMutation } from '../../plugins/plugin-schema-mutations.js'
import { addSchemaField } from '../../plugins/schema-field-patch-operations.js'
import { booleanField } from '../../schema/fields/builtins/boolean.js'
import { UltimaBase } from '../application/ultima-base.js'
import { validateSchemaMutationEffect } from './effect.js'

// Regression (ADR-0340): an update effect accepted `null` for every field
// without a literal `required: true`, so a defaulted plugin-owned field, which
// is required, could receive `null` and reach the database's NOT NULL column.

const Target = UltimaBase.Schema.define({
	className: 'SchemaMutationEffectRequiredItem',
	fields: (field) => ({ title: field.string() }),
})

const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue((value) => value),
	name: 'fixture.effect-required.archive',
	returning: 'after',
	select: { archived: true },
	version: '1.0.0',
})

const readArchiveEffect = () => {
	const application = new FrameworkApplication({
		schemas: [Target],
		logger: false,
		plugins: [
			createPlugin({
				id: 'fixture.effect-required',
				version: '1.0.0',
				core: '^0.0.0',
				permissions: {
					'schema:declare': 'Adds the archived flags.',
					'operation:declare': 'Declares the archive mutation.',
					'model:extend': 'Attaches the mutation to its schema.',
				},
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.patch({
								targets: schemas.select({ className: Target.className }),
								operations: [
									addSchemaField({
										contributionId: 'archived',
										name: 'archived',
										field: booleanField({ default: false }),
									}),
									addSchemaField({
										contributionId: 'reviewed',
										name: 'reviewed',
										field: booleanField({ default: false, required: false }),
									}),
								],
							})
							return undefined
						},
						operations: ({ operations }) => {
							operations.declare(archive)
							return undefined
						},
						models: ({ models }) => {
							models.extend(Target, {
								contributionId: 'archive',
								schemaMutations: {
									archive: { mutation: archive, surfaces: ['schema'] },
								},
							})
							return undefined
						},
					}),
				],
			}),
		],
	})
	const surface = application.getSchemaSurface(Target.className)
	const view = surface?.schemaMutations.get('archive')
	if (surface === undefined || view === undefined) {
		throw new TypeError('Expected the archive schema mutation')
	}
	const { command } = readMutationCommand(view)

	return (data: Readonly<Record<string, unknown>>) =>
		validateSchemaMutationEffect(command, surface.schema, {}, { data })
}

describe('schema mutation update effects on defaulted fields', () => {
	it('rejects null on a defaulted field and keeps it for required: false', () => {
		const validate = readArchiveEffect()

		expect(() => validate({ archived: null })).toThrow(
			expect.objectContaining({
				code: 'PLUGIN_OPERATION_INVALID',
				message:
					'Schema mutation fixture.effect-required.archive returned an invalid value for archived.',
			}),
		)
		expect(validate({ reviewed: null }).current).toStrictEqual({
			reviewed: null,
		})
		expect(validate({ archived: true }).current).toStrictEqual({
			archived: true,
		})
	})
})
