import { FrameworkError, Pointer, type SchemaReference } from '@ultimabase/core'
import type { RequestContext } from '@ultimabase/core/plugin'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { rejectSignUp } from './errors.js'

// Byte snapshots stay opaque and immutable across the operation boundary;
// only this module recovers a fresh native copy for the schema pipeline.
class SnapshotBytes {
	readonly #value: Uint8Array
	constructor(value: Uint8Array) {
		this.#value = Uint8Array.from(value)
		Object.freeze(this)
	}
	copy(): Uint8Array {
		return Uint8Array.from(this.#value)
	}
}

const snapshotValue = (value: unknown, seen: Set<object>): unknown => {
	if (typeof value !== 'object' || value === null) {
		if (typeof value === 'function' || typeof value === 'symbol')
			throw new TypeError('Unsupported sign-up value')
		return value
	}
	if (value instanceof SnapshotBytes || Pointer.is(value)) return value
	if (value instanceof Uint8Array) return new SnapshotBytes(value)
	if (seen.has(value)) throw new TypeError('Cyclic sign-up input')
	seen.add(value)
	try {
		if (isUnknownArray(value))
			return immutableArray(value.map((item) => snapshotValue(item, seen)))
		if (
			!isPlainRecord(value) ||
			Reflect.ownKeys(value).some((key) => typeof key !== 'string')
		)
			throw new TypeError('Sign-up values must be plain data')
		return immutableRecord(
			Object.fromEntries(
				Object.entries(value).map(([key, item]) => [
					key,
					snapshotValue(item, seen),
				]),
			),
		)
	} finally {
		seen.delete(value)
	}
}

/**
 * Detaches sign-up input before asynchronous credential work, without
 * running defaults; `required` names the method's own string fields.
 */
export const snapshotSignUpInput = (
	value: unknown,
	path: string,
	required: readonly string[],
): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(value) ||
		required.some((name) => typeof value[name] !== 'string')
	) {
		throw new TypeError(
			`${path} must contain ${required.join(' and ')} beside User create fields`,
		)
	}
	return snapshotValue(value, new Set()) as Readonly<Record<string, unknown>>
}

const restoreValue = (value: unknown): unknown => {
	if (typeof value !== 'object' || value === null) return value
	if (value instanceof SnapshotBytes) return value.copy()
	if (Pointer.is(value)) return value
	if (isUnknownArray(value)) return value.map((item) => restoreValue(item))
	if (!isPlainRecord(value)) throw new TypeError('Invalid sign-up snapshot')
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, restoreValue(item)]),
	)
}

/** Restores the native values of a snapshotted create input. */
const restoreData = (
	data: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	Object.fromEntries(
		Object.entries(data).map(([key, value]) => [key, restoreValue(value)]),
	)

/** Reads the top-level fields a Core `VALIDATION_ERROR` names. */
const readIssueFields = (error: unknown): readonly string[] => {
	const details: unknown =
		typeof error === 'object' && error !== null
			? Reflect.get(error, 'publicDetails')
			: undefined
	const issues: unknown = isPlainRecord(details) ? details.issues : undefined
	if (!isUnknownArray(issues)) return []
	return [
		...new Set(
			issues.flatMap((issue) => {
				const path: unknown = isPlainRecord(issue) ? issue.path : undefined
				// Core prefixes create issues with `input`; the field comes next.
				const segments = isUnknownArray(path) ? path : []
				const field = segments[0] === 'input' ? segments[1] : segments[0]
				return typeof field === 'string' ? [field] : []
			}),
		),
	].sort()
}

const readUserId = (model: unknown): string => {
	const id: unknown =
		typeof model === 'object' && model !== null
			? Reflect.get(model, 'id')
			: undefined
	if (typeof id !== 'string') {
		throw new TypeError('Auth User creation returned no id')
	}
	return id
}

/**
 * Creates one User through the ordinary pipeline (validation, defaults,
 * Hooks) with the plugin's own `authority:elevate`, so the User's Access
 * rules need not open creation. As the plugin that closes the User's
 * generic create (ADR-0341), its own call still runs it. Invalid data names
 * its fields; a duplicate unique value is rejected without naming it.
 */
export const createUserElevated = async (
	user: SchemaReference<string>,
	data: Readonly<Record<string, unknown>>,
	context: RequestContext,
): Promise<string> => {
	try {
		const created: unknown = await user.createOne(
			{ data: restoreData(data), select: { id: true } },
			{
				context,
				...(context.access.mode === 'master' ? {} : { useMasterKey: true }),
			},
		)
		return readUserId(created)
	} catch (error: unknown) {
		if (error instanceof FrameworkError) {
			if (error.code === 'VALIDATION_ERROR') {
				return rejectSignUp(readIssueFields(error), error)
			}
			if (error.code === 'UNIQUE_VIOLATION') return rejectSignUp([], error)
		}
		throw error
	}
}
