import { randomUUID } from 'node:crypto'

import { privateStore } from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { AccountRecord, AuthCollections } from './collections.js'

/** Selects how a new method account joins an existing user (ADR-0326). */
export type AuthLinking = 'manual' | 'verified-email'

/** A linked sign-in method as `listMethods` reports it. */
export interface AuthMethodInfo {
	readonly createdAt: string
	/** The normalized email the method vouches for, when it has one. */
	readonly email: string | null
	readonly emailVerified: boolean
	readonly id: string
	/** The method name, such as `password`. */
	readonly method: string
}

/** One method account to link, without any provider secret. */
export interface LinkedAccountInput {
	/** The normalized email the method vouches for, if any. */
	readonly email?: string | null
	/** Whether the method verified that email. @default false */
	readonly emailVerified?: boolean
	readonly method: string
	/** The method's stable identifier of the account, such as a provider subject. */
	readonly providerUserId: string
}

const accountLimit = 1000

const toInfo = (record: AccountRecord): AuthMethodInfo =>
	immutableRecord({
		createdAt: record.createdAt,
		email: record.email,
		emailVerified: record.emailVerified,
		id: record.id,
		method: record.method,
	})

/** Links one method account to a user. */
export const insertLinkedAccount = async (
	collections: AuthCollections,
	userId: string,
	input: LinkedAccountInput,
	now: number = Date.now(),
): Promise<AuthMethodInfo> =>
	toInfo(
		await privateStore(collections.accounts).insert({
			data: {
				createdAt: new Date(now).toISOString(),
				email: input.email ?? null,
				emailVerified: input.emailVerified ?? false,
				id: randomUUID(),
				method: input.method,
				providerUserId: input.providerUserId,
				userId,
			},
		}),
	)

/** Finds the user linked to one method account. */
export const findLinkedUserId = async (
	collections: AuthCollections,
	method: string,
	providerUserId: string,
): Promise<string | undefined> =>
	(
		await privateStore(collections.accounts).findUnique({
			where: { method, providerUserId },
		})
	)?.userId

/** Reads the linked accounts of one user. */
const readUserAccounts = (
	collections: AuthCollections,
	userId: string,
): Promise<readonly AccountRecord[]> =>
	privateStore(collections.accounts).findMany({
		limit: accountLimit,
		where: { userId },
	})

/** Lists the sign-in methods linked to one user, oldest first. */
export const listLinkedAccounts = async (
	collections: AuthCollections,
	userId: string,
): Promise<readonly AuthMethodInfo[]> =>
	immutableArray(
		[...(await readUserAccounts(collections, userId))]
			.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
			.map(toInfo),
	)

/**
 * Finds the one user whose linked accounts verified this email, for automatic
 * linking. Several users, or none, return `undefined`.
 */
export const findUserByVerifiedEmail = async (
	collections: AuthCollections,
	email: string,
): Promise<string | undefined> => {
	const accounts = await privateStore(collections.accounts).findMany({
		limit: accountLimit,
		where: { email },
	})
	const users = new Set(
		accounts
			.filter(({ emailVerified }) => emailVerified)
			.map(({ userId }) => userId),
	)
	const [userId] = users
	return users.size === 1 ? userId : undefined
}

/**
 * Removes one linked account of a user. Resolves `'last'` when it is the
 * user's last method and `'missing'` when it is not theirs.
 */
export const removeLinkedAccount = async (
	collections: AuthCollections,
	userId: string,
	id: string,
): Promise<AccountRecord | 'last' | 'missing'> => {
	const accounts = await readUserAccounts(collections, userId)
	const account = accounts.find((candidate) => candidate.id === id)
	if (account === undefined) return 'missing'
	if (accounts.length <= 1) return 'last'
	await privateStore(collections.accounts).delete({ where: { id } })
	return account
}
