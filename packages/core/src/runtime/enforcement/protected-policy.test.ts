import { FrameworkError } from '../../foundation.js'
import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	createProtectedPolicyDeniedError,
	isProtectedPolicyDenied,
} from './protected-denial.js'
import {
	getProtectedPolicyImplementation,
	normalizeProtectedPolicyEffects,
	protectedPolicy,
} from './protected-policy.js'
import { validateProtectedPolicyResultSubset } from './protected-result.js'

const Post = Schema.define({
	className: 'ProtectedPolicyPost',
	fields: (field) => ({ secret: field.string(), title: field.string() }),
})

describe('protectedPolicy', () => {
	it('retains inert matching metadata and keeps executable handlers private', () => {
		const evaluate = () => ({ allowed: true })
		const definition = protectedPolicy({
			evaluate,
			operations: ['find-many'],
			schema: Post,
		})
		const implementation = getProtectedPolicyImplementation(definition)

		expect(definition).toStrictEqual({
			kind: 'protected-policy',
			operations: ['find-many'],
			schema: Post,
		})
		expect(Object.isFrozen(definition)).toBe(true)
		expect(implementation?.evaluate).toBe(evaluate)
		expect(getProtectedPolicyImplementation({ ...definition })).toBeUndefined()
	})

	it('rejects unknown options, missing handlers, and widening effect shapes', () => {
		expect(() => protectedPolicy({})).toThrow(
			'protected policy must declare at least one handler',
		)
		expect(() =>
			protectedPolicy({ evaluate: () => undefined, unknown: true } as never),
		).toThrow('protected policy contains unknown key: unknown')
		expect(() =>
			normalizeProtectedPolicyEffects({ allowed: true, replace: {} }),
		).toThrow('protected policy effects contain unknown key: replace')
	})

	it('accepts only structural result subsets with unchanged leaf values', () => {
		const original = [
			{ id: 'post-1', nested: { public: 'yes', secret: 'no' }, title: 'Post' },
		]
		const candidate = [
			{ id: 'post-1', nested: { public: 'yes' }, title: 'Post' },
		]

		expect(validateProtectedPolicyResultSubset(original, candidate)).toEqual(
			candidate,
		)
		expect(() =>
			validateProtectedPolicyResultSubset(original, [
				{ id: 'post-1', nested: { public: 'changed' }, title: 'Post' },
			]),
		).toThrow('protected policy result may only omit values')
		expect(() => validateProtectedPolicyResultSubset(original, [])).toThrow(
			'protected policy result must preserve collection length',
		)
	})

	it('brands only Core-created denials for protected absence translation', () => {
		const denial = createProtectedPolicyDeniedError()
		const lookalike = new FrameworkError(
			'PERMISSION_DENIED',
			'A plugin-created lookalike',
		)

		expect(isProtectedPolicyDenied(denial)).toBe(true)
		expect(isProtectedPolicyDenied(lookalike)).toBe(false)
	})
})
