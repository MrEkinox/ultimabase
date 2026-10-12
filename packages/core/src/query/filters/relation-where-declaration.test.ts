import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import { getRelationWhereDeclaration } from '../../schema/fields/base/definition.js'

import {
	getCompiledStaticRelationWhere,
	normalizeContextualRelationWhereResult,
} from './relation-where-declaration.js'
import { WhereBuilder } from './where.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

describe('relation where declarations', () => {
	it('compiles circular target filters after the complete graph resolves', () => {
		const Left = UltimaBase.Schema.define({
			className: 'CircularRelationWhereLeft',
			fields: (field) => ({
				enabled: field.boolean(),
				rights: field.relation({ target: 'CircularRelationWhereRight' }),
			}),
		}).with({ relations: { rights: { where: { enabled: { eq: true } } } } })
		const Right = UltimaBase.Schema.define({
			className: 'CircularRelationWhereRight',
			fields: (field) => ({
				enabled: field.boolean(),
				lefts: field.relation({ target: 'CircularRelationWhereLeft' }),
			}),
		}).with({ relations: { lefts: { where: { enabled: { eq: false } } } } })

		new FrameworkApplication({
			plugins: [],
			schemas: [Left, Right],
		}).compileSchemas()
		const leftRelation = Left.persistedFields.rights
		const rightRelation = Right.persistedFields.lefts
		if (leftRelation === undefined || rightRelation === undefined) {
			throw new TypeError('Expected circular relation fields')
		}

		expect(getCompiledStaticRelationWhere(leftRelation)).toMatchObject({
			field: 'enabled',
			value: true,
		})
		expect(getCompiledStaticRelationWhere(rightRelation)).toMatchObject({
			field: 'enabled',
			value: false,
		})
	})

	it('keeps one contextual source definition private across applications', () => {
		const resolver = () => ({})
		const User = UltimaBase.Schema.define({
			className: 'IsolatedRelationWhereUser',
			fields: (field) => ({
				peers: field.relation({ target: 'IsolatedRelationWhereUser' }),
			}),
		}).with({ relations: { peers: { where: resolver } } })
		const first = new FrameworkApplication({ plugins: [], schemas: [User] })
		const second = new FrameworkApplication({ plugins: [], schemas: [User] })

		first.compileSchemas()
		second.compileSchemas()
		const peers = User.persistedFields.peers
		if (peers === undefined)
			throw new TypeError('Expected peers relation field')
		const declaration = getRelationWhereDeclaration(peers)

		expect(first.schemaTargets.get(User, ['peers'])).toBe(User)
		expect(second.schemaTargets.get(User, ['peers'])).toBe(User)
		expect(declaration?.kind).toBe('contextual')
		expect(declaration?.kind === 'contextual' && declaration.resolve).toBe(
			resolver,
		)
	})

	it('rejects malformed contextual results before they reach Runtime', () => {
		const Target = UltimaBase.Schema.define({
			className: 'ContextualRelationWhereTarget',
			fields: (field) => ({ active: field.boolean() }),
		})
		const Foreign = UltimaBase.Schema.define({
			className: 'ContextualRelationWhereForeign',
			fields: (field) => ({ active: field.boolean() }),
		})
		new FrameworkApplication({
			plugins: [],
			schemas: [Target, Foreign],
		}).compileSchemas()

		expect(
			normalizeContextualRelationWhereResult(
				Target,
				new WhereBuilder(Target).eq('active', true),
			),
		).toMatchObject({ field: 'active', kind: 'equal', value: true })
		const mutableInput = { active: { eq: true } }
		const detached = normalizeContextualRelationWhereResult(
			Target,
			mutableInput,
		)
		mutableInput.active.eq = false
		expect(detached).toMatchObject({ value: true })
		expect(Object.isFrozen(detached)).toBe(true)
		expect(() =>
			normalizeContextualRelationWhereResult(Target, new WhereBuilder(Foreign)),
		).toThrow('WhereBuilder must use the same schema definition')
		expect(() =>
			normalizeContextualRelationWhereResult(Target, Promise.resolve({})),
		).toThrow('relation where resolver must return synchronously')
		expect(() => normalizeContextualRelationWhereResult(Target, null)).toThrow(
			'relation where resolver must return a WhereInput or WhereBuilder',
		)
		expect(() =>
			normalizeContextualRelationWhereResult(Target, {
				missing: { eq: true },
			}),
		).toThrow('where.missing must reference a schema field')
		expect(() =>
			normalizeContextualRelationWhereResult(Target, {
				active: { contains: true },
			}),
		).toThrow('query operator contains does not support boolean fields')
	})
})
