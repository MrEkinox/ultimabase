import {
	assertNonEmptyString,
	immutableArray,
	isPlainRecord,
} from '@ultimabase/shared'
import { valid } from 'semver'

import { assertExactEnumerableKeys } from '../exact-object-validation.js'

import {
	isTypegenReference,
	type TypegenReference,
} from './typegen-contracts.js'

interface OperationValueContractLike {
	readonly snapshot: (value: unknown, path: string) => unknown
	readonly typegen?: TypegenReference
}

const namespacedOperationNamePattern =
	/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u
const operationErrorCodePattern =
	/^(?:[A-Z][A-Z0-9_]*|[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/u

/** @internal Validates the shared stable identity of operation-like tokens. */
export const assertOperationIdentity = (
	name: string,
	version: string,
	subject: string,
): void => {
	assertNonEmptyString(name, `${subject} name`)
	if (!namespacedOperationNamePattern.test(name)) {
		throw new TypeError(`${subject} name must be namespaced: ${name}`)
	}
	if (valid(version) !== version) {
		throw new TypeError(`${subject} version must be exact SemVer: ${version}`)
	}
}

/** @internal Validates the nominal input boundary shared by operation declarations. */
export const assertOperationValueContract: (
	value: unknown,
	path: string,
) => asserts value is OperationValueContractLike = (value, path) => {
	if (!isPlainRecord(value) || typeof value.snapshot !== 'function') {
		throw new TypeError(`${path} must expose a snapshot function`)
	}

	assertExactEnumerableKeys(
		value,
		new Set(['snapshot', 'typegen']),
		`${path} contains unknown option: `,
	)
	if (value.typegen !== undefined && !isTypegenReference(value.typegen)) {
		throw new TypeError(
			`${path}.typegen must be created by defineTypegenReference`,
		)
	}
}

/** @internal Detaches the shared public error vocabulary. */
export const snapshotOperationErrors = <
	const TErrors extends readonly string[],
>(
	errors: TErrors | undefined,
	subject: string,
): TErrors => {
	const normalized = errors ?? ([] as unknown as TErrors)
	if (!Array.isArray(normalized)) {
		throw new TypeError(`${subject} errors must be an array`)
	}
	const seen = new Set<string>()
	for (const [index, code] of normalized.entries()) {
		assertNonEmptyString(code, `${subject} errors[${String(index)}]`)
		if (!operationErrorCodePattern.test(code)) {
			throw new TypeError(
				`${subject} error code must be namespaced or a constant identifier: ${code}`,
			)
		}
		if (seen.has(code)) {
			throw new TypeError(`${subject} errors contains duplicate code: ${code}`)
		}
		seen.add(code)
	}

	return immutableArray(normalized) as TErrors
}
