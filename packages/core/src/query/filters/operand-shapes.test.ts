import { describe, expect, it } from 'vitest'

import { SchemaRegistry } from '../../schema/index.js'
import { normalizeWhereInput, type WhereInput } from './where.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Author = UltimaBase.Schema.define({
	className: 'OperandShapeAuthor',
	fields: (field) => ({ name: field.string() }),
})

const Post = UltimaBase.Schema.define({
	className: 'OperandShapePost',
	fields: (field) => ({
		author: field.pointer({ target: () => Author }),
		code: field.uuid(),
		price: field.decimal({ precision: 6, scale: 2 }),
		refs: field.uuid({ list: true }),
		reviewers: field.relation({ target: () => Author }),
	}),
})

new SchemaRegistry([Author, Post]).resolveSchemaTargets()

const valid = '0192f5d2-7c3e-7a1b-8c4d-5e6f7a8b9c0d'
const invalid = 'abc'

const rejects = (where: WhereInput<typeof Post>, message: string): void => {
	expect(() => normalizeWhereInput(Post, where)).toThrow(new TypeError(message))
}

// A UUID operand that is not one can never match and fails in the database
// with a data-constraint error; Core refuses it as malformed input instead.
describe('filter operand shapes', () => {
	it('refuses malformed UUID operands of equality and membership', () => {
		rejects({ id: { eq: invalid } }, 'where.id.eq must be a valid UUID')
		rejects({ id: invalid }, 'where.id must be a valid UUID')
		rejects({ code: { ne: invalid } }, 'where.code.ne must be a valid UUID')
		rejects(
			{ id: { in: [valid, invalid] } },
			'where.id.in[1] must be a valid UUID',
		)
		rejects(
			{ code: { notIn: [invalid] } },
			'where.code.notIn[0] must be a valid UUID',
		)
	})

	it('refuses malformed pointer ids and list elements', () => {
		rejects({ author: invalid }, 'where.author must be a valid UUID')
		rejects({ author: { eq: invalid } }, 'where.author.eq must be a valid UUID')
		rejects(
			{ author: { in: [invalid] } },
			'where.author.in[0] must be a valid UUID',
		)
		rejects({ refs: { has: invalid } }, 'where.refs.has must be a valid UUID')
		rejects(
			{ refs: { hasSome: [valid, invalid] } },
			'where.refs.hasSome[1] must be a valid UUID',
		)
		rejects(
			{ refs: { hasEvery: [invalid] } },
			'where.refs.hasEvery[0] must be a valid UUID',
		)
		rejects(
			{ refs: { eq: [invalid] } },
			'where.refs.eq[0] must be a valid UUID',
		)
	})

	it('checks operands inside logical and relation filters', () => {
		rejects({ NOT: { id: invalid } }, 'where.id must be a valid UUID')
		rejects(
			{ OR: [{ code: valid }, { code: { eq: invalid } }] },
			'where.code.eq must be a valid UUID',
		)
		rejects(
			{ AND: [{ id: { in: [invalid] } }] },
			'where.id.in[0] must be a valid UUID',
		)
		rejects(
			{ reviewers: { some: { id: { eq: invalid } } } },
			'where.id.eq must be a valid UUID',
		)
		rejects(
			{ author: { is: { id: invalid } } },
			'where.id must be a valid UUID',
		)
	})

	it('keeps valid, null and storage-bounded operands', () => {
		expect(() =>
			normalizeWhereInput(Post, {
				author: valid,
				code: null,
				id: { in: [valid], eq: valid.toUpperCase() },
				refs: { hasSome: [valid] },
				// Precision and scale bound stored values, not comparisons.
				price: { gt: '0.001', lt: '12345678.9' },
				reviewers: { none: { id: valid } },
			}),
		).not.toThrow()
	})
})
