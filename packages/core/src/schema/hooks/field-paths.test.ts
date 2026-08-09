import { describe, expect, it } from 'vitest'

import { objectField, Schema, stringField } from '../index.js'
import type { SchemaDefinition } from '../index.js'
import { resolveSchemaFieldPath } from './field-paths.js'

const nestedEmail = stringField()
const dottedEmail = stringField()
const listedProfile = objectField({
	list: true,
	fields: { email: nestedEmail },
})
const schema = Schema.define({
	className: 'RuntimeFieldPath',
	fields: (field) => ({
		'profile.email': dottedEmail,
		profile: listedProfile,
		title: field.string(),
	}),
})
const widenedSchema: SchemaDefinition = schema

describe('resolveSchemaFieldPath', () => {
	it('resolves nested listed objects and system fields by definition identity', () => {
		expect(resolveSchemaFieldPath(schema, ['profile', 'email'])).toBe(
			nestedEmail,
		)
		expect(resolveSchemaFieldPath(schema, ['id'])).toBe(schema.fields.id)
	})

	it('keeps dotted field names distinct from nested path segments', () => {
		expect(resolveSchemaFieldPath(schema, ['profile.email'])).toBe(dottedEmail)
		expect(resolveSchemaFieldPath(schema, ['profile', 'email'])).not.toBe(
			dottedEmail,
		)
	})

	it('rejects malformed or unresolved runtime paths precisely', () => {
		expect(() => resolveSchemaFieldPath(widenedSchema, [])).toThrow(
			new TypeError('field path must be a non-empty segment list'),
		)
		expect(() =>
			resolveSchemaFieldPath(widenedSchema, [
				0,
			] as unknown as readonly string[]),
		).toThrow(new TypeError('field path[0] must be a non-empty string'))
		expect(() => resolveSchemaFieldPath(widenedSchema, ['missing'])).toThrow(
			new TypeError(
				'Unknown field path segment "missing" at index 0 in schema "RuntimeFieldPath"',
			),
		)
		expect(() =>
			resolveSchemaFieldPath(widenedSchema, ['title', 'nested']),
		).toThrow(
			new TypeError(
				'Field path segment "title" at index 0 is not an object field',
			),
		)
	})
})
