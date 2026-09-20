import { assertNonEmptyString, isPlainRecord } from '@ultimabase/shared'

import type { SchemaCompilerArtifactSession } from './artifacts.js'
import type { SchemaCompilerArtifactKind } from './contracts.js'
import { assertSchemaCompilerFieldNode } from './node-validation.js'

const operationKeys: Readonly<Record<string, ReadonlySet<string>>> = {
	'constraint:add': new Set(['constraint', 'contributionId', 'kind']),
	'field-option:set': new Set([
		'contributionId',
		'field',
		'kind',
		'name',
		'value',
	]),
	'field:add': new Set(['contributionId', 'field', 'kind', 'name']),
	'index:add': new Set(['contributionId', 'index', 'kind']),
	'schema-option:set': new Set(['contributionId', 'kind', 'name', 'value']),
}

const assertKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !keys.has(key)) {
			throw new TypeError(`${path} contains unknown key: ${String(key)}`)
		}
	}
}

const assertArtifactNode = (
	value: unknown,
	artifactKind: SchemaCompilerArtifactKind,
	session: SchemaCompilerArtifactSession,
	path: string,
): void => {
	if (!isPlainRecord(value) || !session.owns(value.artifact, artifactKind)) {
		throw new TypeError(`${path} must contain a ${artifactKind} artifact`)
	}
}

const assertNamed = (
	operation: Readonly<Record<string, unknown>>,
	path: string,
	...names: readonly string[]
): void => {
	for (const name of names) {
		assertNonEmptyString(operation[name], `${path}.${name}`)
	}
}

/** Rejects malformed JavaScript operation objects before a compiler sees them. */
export const assertSchemaCompilerPatchOperation = (
	operation: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
): void => {
	if (!isPlainRecord(operation)) {
		throw new TypeError(`${path} must be an operation`)
	}
	assertNonEmptyString(operation.contributionId, `${path}.contributionId`)
	if (typeof operation.kind !== 'string') {
		throw new TypeError(`${path}.kind is unsupported`)
	}
	const keys = operationKeys[operation.kind]
	if (keys === undefined) throw new TypeError(`${path}.kind is unsupported`)
	assertKeys(operation, keys, path)

	switch (operation.kind) {
		case 'field:add':
			assertNamed(operation, path, 'name')
			assertSchemaCompilerFieldNode(operation.field, session, `${path}.field`)
			return
		case 'constraint:add':
			assertArtifactNode(
				operation.constraint,
				'constraint',
				session,
				`${path}.constraint`,
			)
			return
		case 'field-option:set':
			assertNamed(operation, path, 'field', 'name')
			return
		case 'schema-option:set':
			assertNamed(operation, path, 'name')
			return
		case 'index:add':
			if (!isPlainRecord(operation.index)) {
				throw new TypeError(`${path}.index must be a portable index`)
			}
			return
	}
}
