import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { snapshotJsonValue } from '../../schema/fields/builtins/json.js'
import { stringField } from '../../schema/fields/builtins/string.js'
import { prepareSchemaCompilation } from '../../schema/schema/definition-compilation.js'
import type { SchemaDeclarationBatch } from '../schema-declaration-contracts.js'
import {
	addSchemaField,
	addSchemaIndex,
	setSchemaFieldOption,
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
	pluginId: 'fixture.compiler-ir-declarations',
	version: '2.0.0',
})

describe('direct schema compilation provenance', () => {
	it('preserves additions, normalized options and all four additive patch families', () => {
		const Post = UltimaBase.Schema.define({
			className: 'CompilerIrDeclarationPost',
			fields: (field) => ({
				title: field.string({ description: 'Title' }),
			}),
			indexes: [{ fields: ['title', 'createdAt'] }],
		})
		const Added = UltimaBase.Schema.define({
			className: 'CompilerIrAddedPost',
			fields: (field) => ({ title: field.string() }),
		})
		const prepared = [
			prepareSchemaCompilation(Post),
			prepareSchemaCompilation(Added),
		] as const
		const title = prepared[0].definition.fields.title
		const index = prepared[0].definition.indexes[0]
		if (title === undefined || index === undefined) {
			throw new TypeError('Missing schema compiler fixture artifacts')
		}
		const operations = immutableArray([
			addSchemaField({
				contributionId: 'field-add',
				field: stringField(),
				name: 'state',
			}),

			addSchemaIndex({
				contributionId: 'index-add',
				fields: ['state', 'createdAt'],
			}),

			setSchemaOption({
				contributionId: 'schema-option-set',
				name: 'workflow',
				value: { enabled: true },
			}),

			setSchemaFieldOption({
				contributionId: 'field-option-set',
				field: 'title',
				name: 'search',
				value: { weight: 10 },
			}),
		])
		const workflowOption = defineSchemaOption({
			normalize: (value) => Boolean(value),
			protocolVersion: 2,
		})
		const searchOption = defineFieldOption({
			contexts: ['stored'],
			normalize: (value, path) => snapshotJsonValue(value, path),
			protocolVersion: 1,
		})
		const batch: SchemaDeclarationBatch = immutableRecord({
			additions: immutableArray([
				immutableRecord({
					contributionId: 'added-schema',
					owner,
					schema: Added,
					staticOptions: immutableRecord({ tenant: 'main' }),
				}),
			]),
			canDeclare: true,
			claims: immutableArray([]),
			options: immutableArray([
				immutableRecord({
					contributionId: 'workflow-option:schema:workflow',
					definition: workflowOption,
					name: 'workflow',
					owner,
					scope: 'schema' as const,
					staticOptions: immutableRecord({ source: 'fixture' }),
				}),
				immutableRecord({
					contributionId: 'search-option:field:search',
					definition: searchOption,
					name: 'search',
					owner,
					scope: 'field' as const,
					staticOptions: immutableRecord({ source: 'fixture' }),
				}),
			]),
			owner,
			patches: immutableArray([
				immutableRecord({
					operations,
					owner,
					staticOptions: immutableRecord({ release: 2 }),
					targets: immutableRecord({
						selectionId: 'selection:0',
						selector: immutableRecord({ className: Post.className }),
					}),
				}),
			]),
			surfaces: immutableRecord({
				modelSurfaces: immutableArray([]),
				operations: immutableArray([]),
			}),
		})

		const compiled = compileSchemaDeclarations(prepared, [batch])
		const post = compiled.candidates[0]?.definition
		const added = compiled.candidates[1]?.definition
		expect(post?.fields.state?.kind).toBe('string')
		expect(post?.indexes).toContainEqual({
			fields: ['state', 'createdAt'],
			unique: false,
		})
		expect(post).toHaveProperty('workflow', true)
		expect(post?.fields.title?.options).toHaveProperty('search', { weight: 10 })
		expect(post?.provenance.patches.map(({ kind }) => kind)).toEqual(
			operations.map(({ kind }) => kind),
		)
		expect(post?.provenance.options.workflow).toMatchObject({
			definition: {
				owner,
				contributionId: 'workflow-option:schema:workflow',
				protocolVersion: 2,
				normalizedStaticOptions: { source: 'fixture' },
			},
			value: {
				owner,
				contributionId: 'schema-option-set',
				normalizedStaticOptions: { release: 2 },
			},
		})
		expect(post?.provenance.fieldOptions.title?.search).toMatchObject({
			definition: { owner, contributionId: 'search-option:field:search' },
			value: { owner, contributionId: 'field-option-set' },
		})
		expect(added?.provenance.schema).toEqual({
			owner,
			contributionId: 'added-schema',
			normalizedStaticOptions: { tenant: 'main' },
			protocolVersion: 1,
		})
		expect(compiled.selections).toEqual([
			{ selectionId: 'selection:0', classNames: [Post.className] },
		])
	})
})
