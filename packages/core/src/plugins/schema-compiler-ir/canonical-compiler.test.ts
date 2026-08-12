import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { snapshotJsonValue } from '../../schema/fields/builtins/json.js'
import { stringField } from '../../schema/fields/builtins/string.js'
import {
	prepareSchemaCompilation,
	Schema,
} from '../../schema/schema/definition.js'
import type { SchemaDeclarationBatch } from '../schema-declaration-contracts.js'
import {
	addSchemaField,
	setSchemaOption,
} from '../schema-field-patch-operations.js'
import { defineSchemaOption } from '../schema-option-definitions.js'
import { compileCanonicalSchemaCompilerIr } from './canonical-compiler.js'
import { decodeSchemaCompilerOutput } from './decoder.js'
import { encodeSchemaCompilerInput } from './input-encoder.js'
import { assertSchemaCompilerOutput } from './validation.js'

const owner = immutableRecord({
	kind: 'plugin' as const,
	pluginId: 'fixture.canonical-schema-compiler',
	version: '1.0.0',
})

describe('canonical schema compiler IR', () => {
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
		const Existing = Schema.define({
			className: 'CanonicalCompilerExisting',
			fields: (field) => ({ title: field.string() }),
		})
		const Added = Schema.define({
			className: 'CanonicalCompilerAdded',
			fields: (field) => ({ title: field.string() }),
		})
		const selection = immutableRecord({
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
			canTransform: false,
			options: immutableArray([
				immutableRecord({
					contributionId: 'portable-option:field:portable',
					definition: portableOption,
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
		})
		const prepared = immutableArray([
			prepareSchemaCompilation(Existing),
			prepareSchemaCompilation(Added),
		])
		const encoded = encodeSchemaCompilerInput(prepared, [batch])

		expect(normalizations).toBe(2)
		const first = compileCanonicalSchemaCompilerIr(encoded.input)
		const repeated = compileCanonicalSchemaCompilerIr(encoded.input)
		expect(normalizations).toBe(2)
		expect(repeated).toStrictEqual(first)
		expect(Object.isFrozen(first)).toBe(true)
		expect(Object.isFrozen(first.schemas)).toBe(true)
		expect(() => {
			assertSchemaCompilerOutput(encoded.input, first, encoded.session)
		}).not.toThrow()

		const existing = first.schemas.find(
			({ className }) => className === Existing.className,
		)
		const added = first.schemas.find(
			({ className }) => className === Added.className,
		)
		expect(existing?.fields.map(({ name }) => name)).toContain('portableField')
		expect(existing?.options.map(({ name }) => name)).toContain('portable')
		expect(added?.fields.map(({ name }) => name)).not.toContain('portableField')
		expect(added?.options.map(({ name }) => name)).not.toContain('portable')

		const decoded = decodeSchemaCompilerOutput(first, encoded.session)
		expect(
			decoded.find(({ schema }) => schema === Existing)?.definition.fields
				.portableField,
		).toBeDefined()
	})

	it('requires canonical output to pass the public completeness validator', () => {
		const Post = Schema.define({
			className: 'CanonicalCompilerValidation',
			fields: (field) => ({ title: field.string() }),
		})
		const encoded = encodeSchemaCompilerInput(
			[prepareSchemaCompilation(Post)],
			[],
		)
		const output = compileCanonicalSchemaCompilerIr(encoded.input)
		const incomplete = immutableRecord({
			...output,
			schemas: immutableArray([]),
		})

		expect(() => {
			assertSchemaCompilerOutput(encoded.input, incomplete, encoded.session)
		}).toThrow('Schema compiler output must contain the complete schema graph')
	})
})
