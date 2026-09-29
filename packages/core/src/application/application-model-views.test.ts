import { describe, expect, it } from 'vitest'

import type { OperationExecutionOwnerToken } from '../query/operations/execution.js'
import { Schema } from '../schema/index.js'
import { materializeSchemaModel } from '../schema/schema/model-materialization.js'
import { bindDirectApplicationValue } from './application-model-views.js'

const User = Schema.define({
	className: 'DirectViewUser',
	fields: (field) => ({ name: field.string() }),
})

const noModelMutations = (): ReadonlySet<string> => new Set<string>()

describe('direct application model views', () => {
	it('preserves result descriptors while binding nested immutable models', () => {
		const ownerToken: OperationExecutionOwnerToken = Symbol('owner')
		const user = materializeSchemaModel(User, {
			id: '01999a71-9c07-7000-8000-000000000001',
			name: 'Ada',
		})
		const metadata = Symbol('metadata')
		const result: Record<PropertyKey, unknown> = {}
		Object.defineProperties(result, {
			hiddenUser: {
				configurable: false,
				enumerable: false,
				value: user,
				writable: false,
			},
			[metadata]: {
				configurable: false,
				enumerable: false,
				value: 'retained',
				writable: false,
			},
		})
		Object.preventExtensions(result)

		const bound = bindDirectApplicationValue(
			result,
			ownerToken,
			noModelMutations,
		) as object

		expect(bound).not.toBe(result)
		expect(Reflect.getPrototypeOf(bound)).toBe(Object.prototype)
		expect(Object.isFrozen(bound)).toBe(true)
		expect(Reflect.get(bound, metadata)).toBe('retained')
		const boundUser: unknown = Reflect.get(bound, 'hiddenUser')
		expect(boundUser).toBeInstanceOf(User)
		expect(boundUser).not.toBe(user)
		expect(Object.getOwnPropertyDescriptor(bound, 'hiddenUser')).toMatchObject({
			configurable: false,
			enumerable: false,
			writable: false,
		})
		expect(() =>
			bindDirectApplicationValue(result, Symbol('foreign'), noModelMutations),
		).toThrow('Application result cannot be rebound')
	})

	it('retains untouched records and binds model collections once', () => {
		const ownerToken: OperationExecutionOwnerToken = Symbol('owner')
		const untouched = { status: 'ok' }
		expect(
			bindDirectApplicationValue(untouched, ownerToken, noModelMutations),
		).toBe(untouched)

		const user = materializeSchemaModel(User, {
			id: '01999a71-9c07-7000-8000-000000000002',
			name: 'Grace',
		})
		const users = Object.freeze([user])
		const bound = bindDirectApplicationValue(
			users,
			ownerToken,
			noModelMutations,
		)
		expect(bound).not.toBe(users)
		expect(Object.isFrozen(bound)).toBe(true)
		expect(bound).toEqual([expect.any(User)])
		expect(
			bindDirectApplicationValue(users, ownerToken, noModelMutations),
		).toBe(bound)
	})
})
