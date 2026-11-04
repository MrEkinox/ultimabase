// auth's rules and default (D-10, D-62, D-79, D-83, D-241), on the caller alone.
import { asUser } from '@ultimabase/testing'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Caller, Register, UserOf } from 'ultimabase'
import { defineFunction, master } from 'ultimabase'
import {
	currentUser,
	isAuthenticated,
	isOwner,
	isSelf,
	signedIn,
	signedInRun,
} from './index.ts'

const ada = asUser({ id: 'ada' })
const anonymous: Caller = { kind: 'anonymous' }
const record = (author: { id: string } | null) => ({ record: { author } })
const connect = (id: string) => ({ connect: { id } })
const value = (author: unknown) => ({ value: { author } })

// A read rule's `where`, returning the filter it is given.
const wrapped = (filter: object) => ({ filter })

describe('auth’s rules', () => {
	it('isAuthenticated is true for a user only', () => {
		expect(isAuthenticated({ caller: ada })).toBe(true)
		expect(isAuthenticated({ caller: anonymous })).toBe(false)
		expect(isAuthenticated({ caller: master })).toBe(false)
	})

	it('signedIn passes the user, and is false for anyone else', () => {
		const rule = signedIn(({ user }: { user: { id: string } }) => ({
			author: { id: user.id },
		}))
		expect(rule({ caller: ada })).toStrictEqual({ author: { id: 'ada' } })
		expect(rule({ caller: anonymous })).toBe(false)
	})

	it('signedInRun passes the user, and refuses anyone else', () => {
		const run = signedInRun(({ user }: { user: { id: string } }) => user.id)
		expect(run({ caller: ada })).toBe('ada')
		for (const caller of [anonymous, master]) {
			expect(() => run({ caller })).toThrow(
				expect.objectContaining({
					code: 'UNAUTHENTICATED',
					message: 'This function needs a signed-in user.',
				}),
			)
		}
		// Its facts come from the function, with `user` added.
		defineFunction({
			name: 'whoAmI',
			run: signedInRun(({ caller, client, user }) => {
				expectTypeOf(user).toEqualTypeOf<UserOf<Register>>()
				expectTypeOf(caller).toEqualTypeOf<Caller>()
				expectTypeOf(client).not.toBeAny()
			}),
		})
	})

	it('isOwner compares the relation’s stored key', () => {
		const owner = isOwner('author')
		expect(owner({ caller: ada, ...record({ id: 'ada' }) })).toBe(true)
		expect(owner({ caller: ada, ...record({ id: 'grace' }) })).toBe(false)
		expect(owner({ caller: ada, ...record(null) })).toBe(false)
		expect(owner({ caller: anonymous, ...record({ id: 'ada' }) })).toBe(false)
	})

	it('isOwner owns nothing without a record or a value', () => {
		const owner = isOwner<{ readonly caller: Caller }, 'author'>('author')
		// @ts-expect-error -- typed facts need a record; untyped ones own nothing.
		expect(owner({ caller: ada })).toBe(false)
	})

	it('isOwner lets the value written connect the caller only', () => {
		type Written = {
			readonly caller: Caller
			readonly value: { readonly author?: { readonly connect: { id: string } } }
		}
		const owner = isOwner<Written, 'author'>('author')
		const stored = record({ id: 'ada' })
		expect(owner({ caller: ada, value: {} })).toBe(true)
		expect(owner({ caller: ada, value: { author: connect('ada') } })).toBe(true)
		expect(owner({ caller: ada, value: { author: connect('grace') } })).toBe(
			false,
		)
		expect(owner({ caller: anonymous, value: {} })).toBe(false)
		const updated = isOwner('author')
		expect(updated({ caller: ada, ...stored, ...value(connect('ada')) })).toBe(
			true,
		)
		expect(
			updated({ caller: ada, ...stored, ...value(connect('grace')) }),
		).toBe(false)
		expect(
			updated({ caller: ada, ...stored, ...value({ disconnect: true }) }),
		).toBe(false)
		expect(
			updated({
				caller: ada,
				...record({ id: 'grace' }),
				...value(connect('ada')),
			}),
		).toBe(false)
	})

	it('isOwner filters a model read on the relation', () => {
		type Read = {
			readonly caller: Caller
			readonly operation: 'read'
			readonly where: (filter: {
				readonly author?: { readonly is?: { readonly id?: string } }
				readonly title?: string
			}) => object
		}
		const owner = isOwner<Read, 'author'>('author')
		const read = { operation: 'read', where: wrapped } as const
		expect(owner({ caller: ada, ...read })).toStrictEqual({
			filter: { author: { is: { id: 'ada' } } },
		})
		expect(owner({ caller: anonymous, ...read })).toBe(false)
		expectTypeOf(owner).returns.toEqualTypeOf<object | false>()
		// @ts-expect-error -- a read filters on a `one` relation only.
		isOwner<Read, 'title'>('title')
	})

	it('isSelf is true for the caller’s own record', () => {
		expect(isSelf({ caller: ada, record: { id: 'ada' } })).toBe(true)
		expect(isSelf({ caller: ada, record: { id: 'grace' } })).toBe(false)
		expect(isSelf({ caller: anonymous, record: { id: 'ada' } })).toBe(false)
	})

	it('currentUser is the signed-in caller’s id', () => {
		expect(currentUser({ caller: ada })).toStrictEqual({ id: 'ada' })
		expect(currentUser({ caller: anonymous })).toBeUndefined()
	})
})
