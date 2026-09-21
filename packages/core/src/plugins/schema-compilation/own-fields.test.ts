import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import { Schema } from '../../schema/schema/definition.js'
import { stringField } from '../../schema/fields/builtins/string.js'
import { definePlugin } from '../definition.js'
import { defineFieldOption } from '../schema-option-definitions.js'
import { defineOperationValue } from '../plugin-operations.js'
import { defineSchemaMutation } from '../plugin-schema-mutations.js'
import {
	addSchemaField,
	setSchemaFieldOption,
} from '../schema-field-patch-operations.js'

// Record-based compilation must preserve the former lists' own-name lookup semantics.
describe.each(['constructor', 'toString', 'valueOf'])(
	'inherited field name %s',
	(name) => {
		it('does not match an undeclared field in a public selector', () => {
			const Target = Schema.define({
				className: 'OwnFieldSelector',
				fields: () => ({}),
			})
			const application = new FrameworkApplication({
				schemas: [Target],
				pluginPrivileges: { logger: false },
				plugins: [
					definePlugin({
						pluginId: 'fixture.own-field-selector',
						version: '1.0.0',
						core: '^0.0.0',
						privileges: [
							{
								name: 'schema:declare',
								reason: 'Checks selector field ownership.',
							},
						],
						declare: ({ schemas }) => {
							schemas.patch({
								targets: schemas.select({ field: { name } }),
								operations: [
									addSchemaField({
										contributionId: 'selected',
										name: 'selected',
										field: stringField(),
									}),
								],
							})
						},
					}),
				],
			})
			application.compileSchemas()
			expect(Object.hasOwn(Target.fields, 'selected')).toBe(false)
		})

		it('rejects option patches targeting an undeclared inherited name', () => {
			const application = new FrameworkApplication({
				schemas: [
					Schema.define({ className: 'OwnFieldPatch', fields: () => ({}) }),
				],
				pluginPrivileges: { logger: false },
				plugins: [
					definePlugin({
						pluginId: 'fixture.own-field-patch',
						version: '1.0.0',
						core: '^0.0.0',
						privileges: [
							{
								name: 'schema:declare',
								reason: 'Checks patch field ownership.',
							},
						],
						declare: ({ schemas }) => {
							schemas.defineOptions({
								contributionId: 'flag',
								field: {
									flag: defineFieldOption({
										contexts: ['stored'],
										normalize: (value) => Boolean(value),
										protocolVersion: 1,
										typegen: false,
									}),
								},
							})
							schemas.patch({
								targets: schemas.select({}),
								operations: [
									setSchemaFieldOption({
										contributionId: 'flag-value',
										field: name,
										name: 'flag',
										value: true,
									}),
								],
							})
						},
					}),
				],
			})
			expect(() => application.compileSchemas()).toThrow(
				`Unknown schema field: ${name}`,
			)
		})

		it('rejects mutation selections targeting an undeclared inherited name', () => {
			const Target = Schema.define({
				className: 'OwnMutationSelection',
				fields: () => ({}),
			})
			const mutation = defineSchemaMutation({
				authority: 'request',
				effect: 'update',
				input: defineOperationValue((value) => value),
				name: 'fixture.own-selection.update',
				returning: 'after',
				select: { [name]: true },
				version: '1.0.0',
			})
			const application = new FrameworkApplication({
				schemas: [Target],
				pluginPrivileges: { logger: false },
				plugins: [
					definePlugin({
						pluginId: 'fixture.own-mutation-selection',
						version: '1.0.0',
						core: '^0.0.0',
						privileges: [
							{
								name: 'operation:declare',
								reason: 'Declares a mutation selection.',
							},
							{
								name: 'model:extend',
								reason: 'Attaches the mutation to its schema.',
							},
						],
						declare: ({ operations, models }) => {
							operations.declare(mutation)
							models.extend(Target, {
								contributionId: 'update',
								schemaMutations: { update: { mutation, surfaces: ['schema'] } },
							})
						},
					}),
				],
			})
			expect(() => application.compileSchemas()).toThrow(
				`selects unavailable persisted field: ${name}`,
			)
		})
	},
)
