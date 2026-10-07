import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import type { FieldBuilder } from '../../schema/index.js'
import { plugin as createPlugin } from '../plugin.js'
import { contributeDeclarations } from '../plugin-contributions.js'
import { defineSchemaOption } from '../schema-option-definitions.js'
import { addSchemaField } from '../schema-field-patch-operations.js'
import { stringField } from '../../schema/fields/builtins/string.js'
import type { SchemaSelectorOptions } from '../schema-patch-contracts.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

describe('opaque option selection boundary', () => {
	it('preserves presence while rejecting marker and opaque-content matching', () => {
		let callbacks = 0
		let opaqueReads = 0
		const callback = () => {
			callbacks += 1
		}
		// Opaque options deliberately enter before their plugin declaration;
		// this test checks the Runtime selector boundary, not source authorization.
		const Target = UltimaBase.Schema.define({
			className: 'OpaqueDirectSelector',
			opaque: { enabled: true, callback },
			portable: { enabled: true, nested: { tag: 'ready' } },
			fields: (field: FieldBuilder) => ({
				title: field.string({
					default: () => {
						callbacks += 1
						return 'default'
					},
				}),
			}),
		} as never)
		const selectors: Readonly<Record<string, SchemaSelectorOptions>> = {
			present: { option: { name: 'opaque' } },
			absent: { option: { name: 'opaque', present: false } },
			markerKind: {
				option: {
					name: 'opaque',
					path: ['artifactKind'],
					equals: 'option-value',
				},
			},
			markerType: {
				option: {
					name: 'opaque',
					path: ['kind'],
					equals: 'schema-compiler-artifact',
				},
			},
			contents: { option: { name: 'opaque', path: ['enabled'], equals: true } },
			portableMatched: {
				option: { name: 'portable', path: ['nested', 'tag'], equals: 'ready' },
			},
			structural: {
				option: {
					name: 'portable',
					equals: { nested: { tag: 'ready' }, enabled: true },
				},
			},
		}
		const option = defineSchemaOption({
			normalize: (value) => value,
			protocolVersion: 1,
			typegen: false,
			valueKind: 'opaque',
		})
		const plugin = createPlugin({
			id: 'fixture.opaque-selectors',
			version: '1.0.0',
			core: '^0.0.0',
			permissions: {
				'schema:declare': 'Checks portable and opaque selection boundaries.',
			},
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'options',
							schema: {
								opaque: defineSchemaOption({
									...option,
									normalize: () => ({
										get enabled() {
											opaqueReads += 1
											return true
										},
										callback,
									}),
								}),
								portable: option,
							},
						})
						for (const [name, selector] of Object.entries(selectors))
							schemas.patch({
								targets: schemas.select(selector),
								operations: [
									addSchemaField({
										contributionId: name,
										name,
										field: stringField(),
									}),
								],
							})

						return undefined
					},
				}),
			],
		})
		const application = new FrameworkApplication({
			schemas: [Target],
			plugins: [plugin],
			pluginPrivileges: { logger: false },
		})
		application.compileSchemas()
		for (const name of ['present', 'portableMatched', 'structural'])
			expect(Target.fields[name]).toBeDefined()
		for (const name of ['absent', 'markerKind', 'markerType', 'contents'])
			expect(Target.fields[name]).toBeUndefined()
		expect(callbacks).toBe(0)
		// Preparation inspects the value once; matching must not reopen opaque contents.
		expect(opaqueReads).toBe(1)
		// Public command inspection stays inert even when private declarations retain callbacks.
		expect(JSON.stringify(application.typegenGraph)).not.toContain(
			'artifactKind',
		)
	})
})
