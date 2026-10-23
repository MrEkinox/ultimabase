// auth's rules and default (D-10, D-62, D-79, D-83), on the caller alone.
import { asUser } from '@ultimabase/testing'
import { describe, expect, it } from 'vitest'
import type { Caller } from 'ultimabase'
import { master } from 'ultimabase'
import {
	currentUser,
	isAuthenticated,
	isOwner,
	isSelf,
	signedIn,
} from './index.ts'

const ada = asUser({ id: 'ada' })
const anonymous: Caller = { kind: 'anonymous' }
const record = (author: { id: string } | null) => ({ record: { author } })

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

	it('isOwner compares the relation’s stored key', () => {
		const owner = isOwner('author')
		expect(owner({ caller: ada, ...record({ id: 'ada' }) })).toBe(true)
		expect(owner({ caller: ada, ...record({ id: 'grace' }) })).toBe(false)
		expect(owner({ caller: ada, ...record(null) })).toBe(false)
		expect(owner({ caller: anonymous, ...record({ id: 'ada' }) })).toBe(false)
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
