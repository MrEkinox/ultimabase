import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { stringField } from '../../schema/fields/builtins/string.js'
import { defineSchemaExtension } from '../../schema/extensions/definition.js'
import { defineSchemaConstraint } from '../../schema/schema/constraints.js'
import {
	prepareSchemaCompilation,
	Schema,
} from '../../schema/schema/definition.js'
import type { SchemaDeclarationBatch } from '../schema-declaration-contracts.js'
import {
	addSchemaConstraint,
	addSchemaExtension,
	removeSchemaConstraint,
	removeSchemaExtension,
	replaceSchemaConstraint,
	replaceSchemaExtension,
} from '../schema-artifact-patch-operations.js'
import {
	addSchemaField,
	addSchemaIndex,
	removeSchemaField,
	removeSchemaFieldOption,
	removeSchemaIndex,
	removeSchemaOption,
	renameSchemaField,
	replaceSchemaField,
	replaceSchemaIndex,
	setSchemaFieldOption,
	setSchemaOption,
} from '../schema-field-patch-operations.js'
import { defineSchemaOption } from '../schema-option-definitions.js'
import { encodeSchemaCompilerInput } from './input-encoder.js'

const owner = immutableRecord({
	kind: 'plugin' as const,
	pluginId: 'fixture.compiler-ir-declarations',
	version: '2.0.0',
})

describe('schema compiler declaration encoding', () => {
	it('encodes additions, options, selectors, and every patch family', () => {
		const originalExtension = defineSchemaExtension(
			'fixture.compiler-original',
			{ version: 1 },
			'fixture.compiler-original',
			{ fields: { originalMarker: stringField() } },
		)
		const replacementExtension = defineSchemaExtension(
			'fixture.compiler-replacement',
			{ version: 2 },
			'fixture.compiler-replacement',
			{ fields: { replacementMarker: stringField() } },
		)
		const originalConstraint = defineSchemaConstraint({
			kind: 'fixture.compiler-original',
			value: { enabled: true },
			version: 1,
		})
		const replacementConstraint = defineSchemaConstraint({
			kind: 'fixture.compiler-replacement',
			value: { enabled: false },
			version: 1,
		})
		const Post = Schema.define({
			className: 'CompilerIrDeclarationPost',
			extensions: [originalExtension],
			fields: (field) => ({
				title: field.string({ description: 'Title' }),
			}),
			indexes: [{ fields: ['title', 'createdAt'] }],
		})
		const Added = Schema.define({
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
		const fieldTarget = {
			contributionId: 'field:CompilerIrDeclarationPost.title',
			expected: title,
			owner: { kind: 'application' as const },
		}
		const extensionTarget = {
			contributionId:
				'extension:CompilerIrDeclarationPost:0:fixture.compiler-original',
			expected: originalExtension,
			owner: { kind: 'application' as const },
		}
		const constraintTarget = {
			contributionId: 'constraint-original',
			expected: originalConstraint,
			owner: { kind: 'plugin' as const, pluginId: owner.pluginId },
		}
		const indexTarget = {
			contributionId: 'index:CompilerIrDeclarationPost:0',
			expected: index,
			owner: { kind: 'application' as const },
		}
		const operations = immutableArray([
			addSchemaField({
				contributionId: 'field-add',
				field: stringField(),
				name: 'state',
			}),
			replaceSchemaField({
				contributionId: 'field-replace',
				field: stringField({ validation: { required: true } }),
				name: 'title',
				target: fieldTarget,
			}),
			renameSchemaField({
				contributionId: 'field-rename',
				from: 'title',
				target: fieldTarget,
				to: 'headline',
			}),
			removeSchemaField({
				contributionId: 'field-remove',
				name: 'title',
				target: fieldTarget,
			}),
			addSchemaIndex({
				contributionId: 'index-add',
				fields: ['state', 'createdAt'],
			}),
			replaceSchemaIndex({
				contributionId: 'index-replace',
				fields: ['title', 'updatedAt'],
				target: indexTarget,
			}),
			removeSchemaIndex({
				contributionId: 'index-remove',
				target: indexTarget,
			}),
			addSchemaExtension({
				contributionId: 'extension-add',
				extension: replacementExtension,
			}),
			replaceSchemaExtension({
				contributionId: 'extension-replace',
				extension: replacementExtension,
				target: extensionTarget,
			}),
			removeSchemaExtension({
				contributionId: 'extension-remove',
				target: extensionTarget,
			}),
			addSchemaConstraint({
				constraint: originalConstraint,
				contributionId: 'constraint-add',
			}),
			replaceSchemaConstraint({
				constraint: replacementConstraint,
				contributionId: 'constraint-replace',
				target: constraintTarget,
			}),
			removeSchemaConstraint({
				contributionId: 'constraint-remove',
				target: constraintTarget,
			}),
			setSchemaOption({
				contributionId: 'schema-option-set',
				name: 'workflow',
				value: { enabled: true },
			}),
			removeSchemaOption({
				contributionId: 'schema-option-remove',
				name: 'workflow',
				target: {
					contributionId: 'schema-option-set',
					expected: { enabled: true },
					owner: { kind: 'plugin', pluginId: owner.pluginId },
				},
			}),
			setSchemaFieldOption({
				contributionId: 'field-option-set',
				field: 'title',
				name: 'search',
				value: { weight: 10 },
			}),
			removeSchemaFieldOption({
				contributionId: 'field-option-remove',
				field: 'title',
				name: 'description',
				target: {
					contributionId:
						'field-option:CompilerIrDeclarationPost.title.description',
					expected: 'Title',
					owner: { kind: 'application' },
				},
			}),
		])
		const workflowOption = defineSchemaOption({
			normalize: (value) => Boolean(value),
			protocolVersion: 2,
			typegen: { module: '@fixture/compiler', type: 'WorkflowOption' },
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
			canTransform: true,
			options: immutableArray([
				immutableRecord({
					contributionId: 'workflow-option:schema:workflow',
					definition: workflowOption,
					name: 'workflow',
					owner,
					scope: 'schema' as const,
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
						selector: immutableRecord({ className: Post.className }),
					}),
				}),
			]),
		})

		const encoded = encodeSchemaCompilerInput(prepared, [batch])
		const declaration = encoded.input.declarations[0]
		const patch = declaration?.patches[0]

		expect(encoded.input.schemas.map(({ className }) => className)).toEqual([
			Post.className,
		])
		expect(declaration?.additions).toMatchObject([
			{
				contributionId: 'added-schema',
				schema: { className: Added.className },
				staticOptions: { tenant: 'main' },
			},
		])
		expect(declaration?.optionDefinitions[0]).toMatchObject({
			name: 'workflow',
			protocolVersion: 2,
		})
		expect(patch?.operations.map(({ kind }) => kind)).toEqual(
			operations.map(({ kind }) => kind),
		)
		const extensionReplacement = patch?.operations.find(
			(operation) => operation.kind === 'extension:replace',
		)
		expect(
			extensionReplacement?.kind === 'extension:replace'
				? extensionReplacement.extension.fields.map(({ name }) => name)
				: [],
		).toEqual(['replacementMarker'])
		expect(JSON.stringify(encoded.input)).not.toContain('"normalize":')
		expect(JSON.stringify(encoded.input)).not.toContain('SchemaDefinition')
	})
})
