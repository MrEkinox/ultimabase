import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { assertFieldDefinition } from '../../schema/fields/base/definition.js'
import {
	prepareSchemaCompilation,
	Schema,
} from '../../schema/schema/definition.js'
import { isSchemaCompilerArtifactReference } from './artifacts.js'
import { schemaCompilerProtocolVersion } from './contracts.js'
import { SchemaCompilerIrEncoder } from './encoder.js'
import { assertSchemaCompilerInput } from './validation.js'

describe('schema compiler IR encoding', () => {
	it('masks schema classes and default factories behind artifacts', () => {
		const defaultTitle = (): string => 'draft'
		const Post = Schema.define({
			className: 'CompilerIrPost',
			fields: (field) => ({
				metadata: field.object({
					fields: (nested) => ({ source: nested.string() }),
				}),
				title: field.string({
					default: defaultTitle,
				}),
			}),
		})
		const prepared = prepareSchemaCompilation(Post)
		const encoder = new SchemaCompilerIrEncoder()
		const schema = encoder.schemaNode(prepared, 'schemas.CompilerIrPost')
		const input = immutableRecord({
			declarations: immutableArray([]),
			protocolVersion: schemaCompilerProtocolVersion,
			schemas: immutableArray([schema]),
		})

		expect(() => {
			assertSchemaCompilerInput(input, encoder.session)
		}).not.toThrow()
		expect(JSON.stringify(input)).not.toContain('draft')
		expect(JSON.stringify(input)).not.toContain('defaultTitle')

		const title = schema.fields.find(({ name }) => name === 'title')
		const defaultValue = title?.options.find(
			({ name }) => name === 'default',
		)?.value
		const defaultProvenance = title?.options.find(
			({ name }) => name === 'default',
		)?.provenance
		expect(isSchemaCompilerArtifactReference(defaultValue)).toBe(true)
		expect(defaultProvenance).toEqual(
			prepared.definition.provenance.fieldOptions.title?.default,
		)
		const metadata = schema.fields.find(({ name }) => name === 'metadata')
		expect(metadata?.fields.map(({ name }) => name)).toEqual(['source'])

		if (title === undefined) throw new TypeError('Missing encoded title')
		const decodedTitle = encoder.session.resolve(title.artifact, 'field')
		assertFieldDefinition(decodedTitle, 'decoded title')
		expect(decodedTitle).toBe(prepared.definition.fields.title)
	})

	it('assigns stable ordered identities and reuses repeated artifacts', () => {
		const encoder = new SchemaCompilerIrEncoder()
		const artifact = Object.freeze({ ready: true })
		const first = encoder.reference('field', artifact, 'first')
		const repeated = encoder.reference('field', artifact, 'second')
		const distinctKind = encoder.reference('option-value', artifact, 'third')
		const repeatedCompilation = new SchemaCompilerIrEncoder().reference(
			'field',
			artifact,
			'first',
		)

		expect(repeated).toBe(first)
		expect(distinctKind).not.toBe(first)
		expect(first.artifactId).toBe('field:0:first')
		expect(distinctKind.artifactId).toBe('option-value:1:third')
		expect(repeatedCompilation.artifactId).toBe(first.artifactId)
	})
})
