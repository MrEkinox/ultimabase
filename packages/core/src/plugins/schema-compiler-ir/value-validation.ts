import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import type { SchemaCompilerArtifactSession } from './artifacts.js'
import { isSchemaCompilerArtifactReference } from './artifacts.js'

/** Validates the executable and ownership boundary before structural decoding. */
export const assertFrozenCallbackFreeValue = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
	seen: WeakSet<object>,
	allowedReferences?: ReadonlySet<object>,
): void => {
	if (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	) {
		if (typeof value === 'number' && !Number.isFinite(value)) {
			throw new TypeError(`${path} must contain only finite numbers`)
		}
		return
	}

	if (typeof value === 'function') {
		throw new TypeError(`${path} must not contain callbacks`)
	}
	if (typeof value !== 'object') {
		throw new TypeError(`${path} must contain only callback-free IR values`)
	}
	if (seen.has(value)) {
		throw new TypeError(`${path} must not contain circular references`)
	}
	if (!Object.isFrozen(value)) {
		throw new TypeError(`${path} must be immutable`)
	}
	if (isSchemaCompilerArtifactReference(value)) {
		if (!session.owns(value)) {
			throw new TypeError(`${path} contains a foreign artifact reference`)
		}
		if (allowedReferences !== undefined && !allowedReferences.has(value)) {
			throw new TypeError(`${path} contains a stale artifact reference`)
		}
		return
	}

	seen.add(value)
	if (isUnknownArray(value)) {
		for (const [index, item] of value.entries()) {
			assertFrozenCallbackFreeValue(
				item,
				session,
				`${path}[${String(index)}]`,
				seen,
				allowedReferences,
			)
		}
		seen.delete(value)
		return
	}
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must contain only plain IR objects`)
	}

	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string') {
			throw new TypeError(`${path} must not contain symbol keys`)
		}
		assertFrozenCallbackFreeValue(
			value[key],
			session,
			`${path}.${key}`,
			seen,
			allowedReferences,
		)
	}
	seen.delete(value)
}

/** Collects the exact nominal references made visible to one compiler call. */
export const collectArtifactReferences = (
	value: unknown,
	references: Set<object>,
	seen: WeakSet<object>,
): void => {
	if (typeof value !== 'object' || value === null || seen.has(value)) return
	if (isSchemaCompilerArtifactReference(value)) {
		references.add(value)
		return
	}

	seen.add(value)
	if (isUnknownArray(value)) {
		for (const item of value) collectArtifactReferences(item, references, seen)
	} else if (isPlainRecord(value)) {
		for (const key of Object.keys(value)) {
			collectArtifactReferences(value[key], references, seen)
		}
	}
}
