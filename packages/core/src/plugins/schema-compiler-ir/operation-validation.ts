import { assertNonEmptyString, isPlainRecord } from '@ultimabase/shared'

import type { SchemaCompilerArtifactKind } from './contracts.js'
import type { SchemaCompilerArtifactSession } from './artifacts.js'
import {
	assertSchemaCompilerExtensionNode,
	assertSchemaCompilerFieldNode,
} from './node-validation.js'

const operationKeys: Readonly<Record<string, ReadonlySet<string>>> = {
	'constraint:add': new Set(['constraint', 'contributionId', 'kind']),
	'constraint:remove': new Set(['contributionId', 'kind', 'target']),
	'constraint:replace': new Set([
		'constraint',
		'contributionId',
		'kind',
		'target',
	]),
	'extension:add': new Set(['contributionId', 'extension', 'kind']),
	'extension:remove': new Set(['contributionId', 'kind', 'target']),
	'extension:replace': new Set([
		'contributionId',
		'extension',
		'kind',
		'target',
	]),
	'field-option:remove': new Set([
		'contributionId',
		'field',
		'kind',
		'name',
		'target',
	]),
	'field-option:set': new Set([
		'contributionId',
		'field',
		'kind',
		'name',
		'target',
		'value',
	]),
	'field:add': new Set(['contributionId', 'field', 'kind', 'name']),
	'field:remove': new Set(['contributionId', 'kind', 'name', 'target']),
	'field:rename': new Set(['contributionId', 'from', 'kind', 'target', 'to']),
	'field:replace': new Set([
		'contributionId',
		'field',
		'kind',
		'name',
		'target',
	]),
	'index:add': new Set(['contributionId', 'index', 'kind']),
	'index:remove': new Set(['contributionId', 'kind', 'target']),
	'index:replace': new Set(['contributionId', 'index', 'kind', 'target']),
	'schema-option:remove': new Set(['contributionId', 'kind', 'name', 'target']),
	'schema-option:set': new Set([
		'contributionId',
		'kind',
		'name',
		'target',
		'value',
	]),
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

const assertTarget = (
	value: unknown,
	artifactKind: SchemaCompilerArtifactKind | undefined,
	session: SchemaCompilerArtifactSession,
	path: string,
): void => {
	if (!isPlainRecord(value)) throw new TypeError(`${path} must be a target`)
	assertKeys(value, new Set(['contributionId', 'expected', 'owner']), path)
	assertNonEmptyString(value.contributionId, `${path}.contributionId`)
	if (!isPlainRecord(value.owner))
		throw new TypeError(`${path}.owner must be an owner`)
	if (
		artifactKind !== undefined &&
		!session.owns(value.expected, artifactKind)
	) {
		throw new TypeError(`${path}.expected must be a ${artifactKind} artifact`)
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
	const optionalTarget =
		(operation.kind === 'field-option:set' ||
			operation.kind === 'schema-option:set') &&
		operation.target === undefined
			? new Set([...keys].filter((key) => key !== 'target'))
			: keys
	assertKeys(operation, optionalTarget, path)

	switch (operation.kind) {
		case 'field:add':
			assertNamed(operation, path, 'name')
			assertSchemaCompilerFieldNode(operation.field, session, `${path}.field`)
			return
		case 'field:replace':
			assertNamed(operation, path, 'name')
			assertSchemaCompilerFieldNode(operation.field, session, `${path}.field`)
			assertTarget(operation.target, 'field', session, `${path}.target`)
			return
		case 'field:remove':
			assertNamed(operation, path, 'name')
			assertTarget(operation.target, 'field', session, `${path}.target`)
			return
		case 'field:rename':
			assertNamed(operation, path, 'from', 'to')
			assertTarget(operation.target, 'field', session, `${path}.target`)
			return
		case 'extension:add':
			assertSchemaCompilerExtensionNode(
				operation.extension,
				session,
				`${path}.extension`,
			)
			return
		case 'extension:replace':
			assertSchemaCompilerExtensionNode(
				operation.extension,
				session,
				`${path}.extension`,
			)
			assertTarget(operation.target, 'extension', session, `${path}.target`)
			return
		case 'extension:remove':
			assertTarget(operation.target, 'extension', session, `${path}.target`)
			return
		case 'constraint:add':
			assertArtifactNode(
				operation.constraint,
				'constraint',
				session,
				`${path}.constraint`,
			)
			return
		case 'constraint:replace':
			assertArtifactNode(
				operation.constraint,
				'constraint',
				session,
				`${path}.constraint`,
			)
			assertTarget(operation.target, 'constraint', session, `${path}.target`)
			return
		case 'constraint:remove':
			assertTarget(operation.target, 'constraint', session, `${path}.target`)
			return
		case 'field-option:set':
			assertNamed(operation, path, 'field', 'name')
			if (operation.target !== undefined) {
				assertTarget(operation.target, undefined, session, `${path}.target`)
			}
			return
		case 'field-option:remove':
			assertNamed(operation, path, 'field', 'name')
			assertTarget(operation.target, undefined, session, `${path}.target`)
			return
		case 'schema-option:set':
			assertNamed(operation, path, 'name')
			if (operation.target !== undefined) {
				assertTarget(operation.target, undefined, session, `${path}.target`)
			}
			return
		case 'schema-option:remove':
			assertNamed(operation, path, 'name')
			assertTarget(operation.target, undefined, session, `${path}.target`)
			return
		case 'index:add':
		case 'index:replace':
			if (!isPlainRecord(operation.index)) {
				throw new TypeError(`${path}.index must be a portable index`)
			}
			if (operation.kind === 'index:replace') {
				assertTarget(operation.target, undefined, session, `${path}.target`)
			}
			return
		case 'index:remove':
			assertTarget(operation.target, undefined, session, `${path}.target`)
	}
}
