import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { privateStore } from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type { AuthCollections, TokenRecord } from './collections.js'
import { readUserState, swapUserState } from './user-state.js'

/** What one single-use account token proves (ADR-0326). */
export type AuthTokenPurpose =
	'email-change' | 'email-verification' | 'password-reset'

// Each purpose has its own prefix, so a token is never accepted for another.
const tokenPrefixes: Readonly<Record<AuthTokenPurpose, string>> =
	immutableRecord({
		'email-change': 'ub_c1.',
		'email-verification': 'ub_v1.',
		'password-reset': 'ub_r1.',
	})
const tokenBody = /^[A-Za-z0-9_-]{43}$/u

/** A newly issued token, given to the application callback exactly once. */
export interface AuthIssuedToken {
	/** When the token stops being accepted (ISO time). */
	readonly expiresAt: string
	/** The raw token; only its SHA-256 digest is stored. */
	readonly token: string
}

/** The account a valid token designates. */
export interface AuthTokenClaim {
	/** The email the token was issued for, such as the address to verify. */
	readonly email: string
	readonly userId: string
}

const digestToken = (token: string): string =>
	createHash('sha256').update(token).digest('hex')

/** Rejects malformed tokens before any storage access. */
const isToken = (purpose: AuthTokenPurpose, value: unknown): value is string =>
	typeof value === 'string' &&
	value.startsWith(tokenPrefixes[purpose]) &&
	tokenBody.test(value.slice(tokenPrefixes[purpose].length))

/**
 * Issues one token for a user and purpose. The user state designates it as
 * the purpose's current token: an older token of the same purpose stops being
 * accepted and is deleted. Runs in the current transaction.
 */
export const issueAuthToken = async (
	collections: AuthCollections,
	options: Readonly<{
		readonly email: string
		readonly expiresInMs: number
		readonly purpose: AuthTokenPurpose
		readonly userId: string
	}>,
	now: number = Date.now(),
): Promise<AuthIssuedToken> => {
	const { email, expiresInMs, purpose, userId } = options
	const token = `${tokenPrefixes[purpose]}${randomBytes(32).toString('base64url')}`
	const expiresAt = new Date(now + expiresInMs).toISOString()
	const store = privateStore(collections.tokens)
	const record = await store.insert({
		data: {
			createdAt: new Date(now).toISOString(),
			digest: digestToken(token),
			email,
			expiresAt,
			id: randomUUID(),
			purpose,
			userId,
		},
	})
	let replaced: string | undefined
	await swapUserState(collections, userId, (state) => {
		replaced = state.tokenIds[purpose]
		return { tokenIds: { ...state.tokenIds, [purpose]: record.id } }
	})
	if (replaced !== undefined) await store.delete({ where: { id: replaced } })
	return immutableRecord({ expiresAt, token })
}

/** Reads the token row while it is the purpose's current, unexpired token. */
const findCurrentToken = async (
	collections: AuthCollections,
	purpose: AuthTokenPurpose,
	token: unknown,
	now: number,
): Promise<TokenRecord | undefined> => {
	if (!isToken(purpose, token)) return undefined
	const record = await privateStore(collections.tokens).findUnique({
		where: { digest: digestToken(token) },
	})
	if (
		record === null ||
		record.purpose !== purpose ||
		Date.parse(record.expiresAt) <= now
	) {
		return undefined
	}
	const state = await readUserState(collections, record.userId)
	return state.tokenIds[purpose] === record.id ? record : undefined
}

const toClaim = (record: TokenRecord): AuthTokenClaim =>
	immutableRecord({ email: record.email, userId: record.userId })

/** Reads the account of a valid token without using it. */
export const findAuthToken = async (
	collections: AuthCollections,
	purpose: AuthTokenPurpose,
	token: unknown,
	now: number = Date.now(),
): Promise<AuthTokenClaim | undefined> => {
	const record = await findCurrentToken(collections, purpose, token, now)
	return record === undefined ? undefined : toClaim(record)
}

/**
 * Uses one valid token: the compare-and-swap on the user state lets exactly
 * one concurrent use succeed, then the row is deleted. Runs in the current
 * transaction.
 */
export const consumeAuthToken = async (
	collections: AuthCollections,
	purpose: AuthTokenPurpose,
	token: unknown,
	now: number = Date.now(),
): Promise<AuthTokenClaim | undefined> => {
	const record = await findCurrentToken(collections, purpose, token, now)
	if (record === undefined) return undefined
	const consumed = await swapUserState(collections, record.userId, (state) => {
		if (state.tokenIds[purpose] !== record.id) return undefined
		return {
			tokenIds: Object.fromEntries(
				Object.entries(state.tokenIds).filter(([name]) => name !== purpose),
			),
		}
	})
	if (consumed === undefined) return undefined
	await privateStore(collections.tokens).delete({ where: { id: record.id } })
	return toClaim(record)
}

/** Cancels the current token of one purpose, if any. */
export const cancelAuthToken = async (
	collections: AuthCollections,
	userId: string,
	purpose: AuthTokenPurpose,
): Promise<void> => {
	let cancelled: string | undefined
	await swapUserState(collections, userId, (state) => {
		cancelled = state.tokenIds[purpose]
		if (cancelled === undefined) return undefined
		return {
			tokenIds: Object.fromEntries(
				Object.entries(state.tokenIds).filter(([name]) => name !== purpose),
			),
		}
	})
	if (cancelled !== undefined) {
		await privateStore(collections.tokens).delete({ where: { id: cancelled } })
	}
}
