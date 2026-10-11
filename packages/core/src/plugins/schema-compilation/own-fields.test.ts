import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'

import { stringField } from '../../schema/fields/builtins/string.js'
import { plugin as createPlugin } from '../plugin.js'
import { contributeDeclarations } from '../plugin-contributions.js'

import { defineFieldOption } from '../schema-option-definitions.js'
import { defineOperationValue } from '../plugin-operations.js'
import { defineSchemaMutation } from '../plugin-schema-mutations.js'
import {
	addSchemaField,
	setSchemaFieldOption,
} from '../schema-field-patch-operations.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

// Record-based compilation must preserve the former lists' own-name lookup semantics.
describe.each(['constructor', 'toString', 'valueOf'])(
	'inherited field name %s',
	(name) => {
		it('does not match an undeclared field in a public selector', () => {
			const Target = UltimaBase.Schema.define({
				className: 'OwnFieldSelector',
				fields: () => ({}),
			})
			const application = new FrameworkApplication({
				schemas: [Target],
				logger: false,
				plugins: [
					createPlugin({
						id: 'fixture.own-field-selector',
						version: '1.0.0',
						core: '^0.0.0',
						permissions: {
							'schema:declare': 'Checks selector field ownership.',
						},
						contributions: [
							contributeDeclarations({
								schema: ({ schemas }) => {
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

									return undefined
								},
							}),
						],
					}),
				],
			})
			application.compileSchemas()
			expect(Object.hasOwn(Target.fields, 'selected')).toBe(false)
		})

		it('rejects option patches targeting an undeclared inherited name', () => {
			const application = new FrameworkApplication({
				schemas: [
					UltimaBase.Schema.define({
						className: 'OwnFieldPatch',
						fields: () => ({}),
					}),
				],
				logger: false,
				plugins: [
					createPlugin({
						id: 'fixture.own-field-patch',
						version: '1.0.0',
						core: '^0.0.0',
						permissions: { 'schema:declare': 'Checks patch field ownership.' },
						contributions: [
							contributeDeclarations({
								schema: ({ schemas }) => {
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

									return undefined
								},
							}),
						],
					}),
				],
			})
			expect(() => application.compileSchemas()).toThrow(
				`Unknown schema field: ${name}`,
			)
		})

		it('rejects mutation selections targeting an undeclared inherited name', () => {
			const Target = UltimaBase.Schema.define({
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
				logger: false,
				plugins: [
					createPlugin({
						id: 'fixture.own-mutation-selection',
						version: '1.0.0',
						core: '^0.0.0',
						permissions: {
							'operation:declare': 'Declares a mutation selection.',
							'model:extend': 'Attaches the mutation to its schema.',
						},
						contributions: [
							contributeDeclarations({
								operations: ({ operations }) => {
									operations.declare(mutation)
									return undefined
								},
								models: ({ models }) => {
									models.extend(Target, {
										contributionId: 'update',
										schemaMutations: {
											update: { mutation, surfaces: ['schema'] },
										},
									})
									return undefined
								},
							}),
						],
					}),
				],
			})
			expect(() => application.compileSchemas()).toThrow(
				`selects unavailable persisted field: ${name}`,
			)
		})
	},
)
