import { FrameworkError, privateStore } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { AuthCollections, UserStateRecord } from './collections.js'

/** The private authentication state of one user. */
export interface UserState {
	readonly accountIds: readonly string[]
	readonly sessionGeneration: number
	readonly sessionIds: readonly string[]
}

/** The ids a state row lists, keeping only strings. */
const readIds = (value: unknown): readonly string[] =>
	immutableArray(
		isUnknownArray(value)
			? value.filter((id): id is string => typeof id === 'string')
			: [],
	)

const toState = (record: UserStateRecord | null): UserState =>
	immutableRecord({
		accountIds: readIds(record?.accountIds),
		sessionGeneration: record?.sessionGeneration ?? 0,
		sessionIds: readIds(record?.sessionIds),
	})

const isUniqueViolation = (error: unknown): boolean =>
	error instanceof FrameworkError && error.code === 'UNIQUE_VIOLATION'

/** Reads the state of a user; a user without a row is at generation 0. */
export const readUserState = async (
	collections: AuthCollections,
	userId: string,
): Promise<UserState> =>
	toState(
		await privateStore(collections.states).findUnique({ where: { userId } }),
	)

/**
 * Applies one change to the state of a user through compare-and-swap on its
 * version, creating the row when missing.
 */
export const updateUserState = async (
	collections: AuthCollections,
	userId: string,
	change: (state: UserState) => Partial<UserState>,
): Promise<UserState> => {
	const store = privateStore(collections.states)
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const record = await store.findUnique({ where: { userId } })
		const next = immutableRecord({
			...toState(record),
			...change(toState(record)),
		})
		const data = {
			accountIds: [...next.accountIds],
			sessionGeneration: next.sessionGeneration,
			sessionIds: [...next.sessionIds],
		}
		if (record === null) {
			try {
				await store.insert({ data: { ...data, userId, version: 0 } })
				return next
			} catch (error: unknown) {
				if (!isUniqueViolation(error)) throw error
				continue
			}
		}
		if (
			(await store.compareAndSwap({
				data: { ...data, version: record.version + 1 },
				expected: { version: record.version },
				where: { userId },
			})) !== null
		) {
			return next
		}
	}
	throw new FrameworkError(
		'TRANSACTION_CONFLICT',
		'Concurrent authentication changes conflicted.',
		{ publicMessage: 'The request conflicted; retry it.', retryable: true },
	)
}
