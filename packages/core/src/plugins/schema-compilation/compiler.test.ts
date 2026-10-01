import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { snapshotJsonValue } from '../../schema/fields/builtins/json.js'
import { stringField } from '../../schema/fields/builtins/string.js'
import { prepareSchemaCompilation } from '../../schema/schema/definition.js'
import type { SchemaDeclarationBatch } from '../schema-declaration-contracts.js'
import {
	addSchemaField,
	setSchemaOption,
} from '../schema-field-patch-operations.js'
import {
	defineFieldOption,
	defineSchemaOption,
} from '../schema-option-definitions.js'
import { compileSchemaDeclarations } from '../compiled-schema-declarations.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const owner = immutableRecord({
	kind: 'plugin' as const,
	pluginId: 'fixture.canonical-schema-compiler',
	version: '1.0.0',
})

describe('direct canonical schema compilation', () => {
	it('normalizes declarations once, freezes selectors, and compiles deterministically', () => {
		let normalizations = 0
		const portableOption = defineSchemaOption({
			normalize: (value, path) => {
				normalizations += 1
				return snapshotJsonValue(value, path)
			},
			protocolVersion: 1,
			typegen: {
				module: '@fixture/canonical-schema-compiler',
				type: 'PortableOption',
			},
		})
		const portableFieldOption = defineFieldOption({
			contexts: ['stored'],
			normalize: portableOption.normalize,
			protocolVersion: 1,
			typegen: portableOption.typegen,
		})
		const Existing = UltimaBase.Schema.define({
			className: 'CanonicalCompilerExisting',
			fields: (field) => ({
				title: field.string(),
				summary: field.virtual({
					output: (output) => output.string(),
					select: { title: true },
					resolve: () => 'summary',
				}),
			}),
		})
		const Added = UltimaBase.Schema.define({
			className: 'CanonicalCompilerAdded',
			fields: (field) => ({ title: field.string() }),
		})
		const selection = immutableRecord({
			selectionId: 'selection:0',
			selector: immutableRecord({}),
		})
		const batch: SchemaDeclarationBatch = immutableRecord({
			additions: immutableArray([
				immutableRecord({
					contributionId: 'added-schema',
					owner,
					schema: Added,
					staticOptions: immutableRecord({}),
				}),
			]),
			canDeclare: true,
			claims: immutableArray([]),
			options: immutableArray([
				immutableRecord({
					contributionId: 'portable-option:field:portable',
					definition: portableFieldOption,
					name: 'portable',
					owner,
					scope: 'field' as const,
					staticOptions: immutableRecord({}),
				}),
				immutableRecord({
					contributionId: 'portable-option:schema:portable',
					definition: portableOption,
					name: 'portable',
					owner,
					scope: 'schema' as const,
					staticOptions: immutableRecord({}),
				}),
			]),
			owner,
			patches: immutableArray([
				immutableRecord({
					operations: immutableArray([
						addSchemaField({
							contributionId: 'portable-field',
							field: stringField({
								// @ts-expect-error -- Typegen owns installed option augmentation.
								portable: { enabled: true },
							}),
							name: 'portableField',
						}),
						setSchemaOption({
							contributionId: 'portable-schema-option',
							name: 'portable',
							value: { enabled: true },
						}),
					]),
					owner,
					staticOptions: immutableRecord({}),
					targets: selection,
				}),
			]),
			surfaces: immutableRecord({
				modelSurfaces: immutableArray([]),
				operations: immutableArray([]),
			}),
			typegen: immutableRecord({
				references: immutableArray([]),
			}),
		})
		const prepared = immutableArray([
			prepareSchemaCompilation(Existing),
			prepareSchemaCompilation(Added),
		])
		const first = compileSchemaDeclarations(prepared, [batch])
		expect(normalizations).toBe(2)
		const repeated = compileSchemaDeclarations(prepared, [batch])
		expect(normalizations).toBe(4)
		expect(repeated).toStrictEqual(first)
		expect(Object.isFrozen(first)).toBe(true)
		expect(Object.isFrozen(first.candidates)).toBe(true)
		const existing = first.candidates.find(({ schema }) => schema === Existing)
		const added = first.candidates.find(({ schema }) => schema === Added)
		expect(existing?.definition.fields.portableField).toBeDefined()
		// Physical fields retain their order before virtual fields, including later additions.
		expect(Object.keys(existing?.definition.fields ?? {}).slice(-2)).toEqual([
			'portableField',
			'summary',
		])
		expect(Object.keys(existing?.developerFields ?? {})).toEqual([
			'title',
			'portableField',
		])
		expect(existing?.definition).toHaveProperty('portable')
		expect(added?.definition.fields.portableField).toBeUndefined()
		expect(added?.definition).not.toHaveProperty('portable')
		expect(first.selections[0]?.classNames).toEqual([Existing.className])
	})
})
