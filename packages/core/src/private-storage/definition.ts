import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { assertExactPlainObject } from '../exact-object-validation.js'
import { assertFieldDefinition } from '../schema/fields/base/definition.js'
import type { GenericField } from '../schema/fields/base/contract.js'
import {
	snapshotJsonValue,
	type JsonValue,
} from '../schema/fields/builtins/json.js'
import type {
	DefinePrivateCollectionOptions,
	PrivateCollection,
	PrivateCollectionReference,
	PrivateCollectionUniqueIndex,
} from './contracts.js'

export interface PrivateCollectionDefinition {
	readonly contributionId: string
	readonly fields: Readonly<Record<string, GenericField>>
	readonly indexes: readonly PrivateCollectionUniqueIndex<
		Readonly<Record<string, GenericField>>
	>[]
	readonly normalizedStaticOptions: Readonly<Record<string, JsonValue>>
	readonly protocolVersion: number
	readonly references: readonly PrivateCollectionReference<
		Readonly<Record<string, GenericField>>
	>[]
}

// Only nominal tokens minted by definePrivateCollection resolve to a descriptor.
const collectionDefinitions = new WeakMap<object, PrivateCollectionDefinition>()
const forbiddenFieldOptions = new Set([
	'autoIncrement',
	'autoNow',
	'default',
	'generatedOn',
	'indexed',
	'postgres',
	'system',
])

const assertPortableField = (field: GenericField, path: string): void => {
	assertFieldDefinition(field, path)
	if (
		field.kind.includes('.') ||
		field.kind === 'pointer' ||
		field.kind === 'relation'
	) {
		throw new TypeError(
			`${path} must use a portable non-relational built-in field`,
		)
	}
	for (const key of Object.keys(field.options)) {
		if (forbiddenFieldOptions.has(key)) {
			throw new TypeError(`${path}.${key} is unavailable in private storage`)
		}
	}
	if (field.kind === 'object') {
		const children: unknown = Reflect.get(field.options, 'fields')
		if (!isPlainRecord(children)) {
			throw new TypeError(`${path}.fields must be a plain object`)
		}
		for (const [name, child] of Object.entries(children)) {
			assertPortableField(child as GenericField, `${path}.fields.${name}`)
		}
	}
	// Snapshot every non-child option so callbacks and other process-local values
	// cannot disappear silently from an adapter or upgrade fingerprint.
	snapshotJsonValue(
		Object.fromEntries(
			Object.entries(field.options).filter(([name]) => name !== 'fields'),
		),
		`${path}.options`,
	)
}

const normalizeIndexes = <
	TFields extends Readonly<Record<string, GenericField>>,
>(
	fields: TFields,
	value: unknown,
): readonly PrivateCollectionUniqueIndex<TFields>[] => {
	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError('private collection indexes must be a non-empty array')
	}
	const seen = new Set<string>()
	return immutableArray(
		value.map((candidate, index) => {
			const path = `private collection indexes[${String(index)}]`
			assertExactPlainObject(
				candidate,
				new Set(['fields']),
				`${path} must be a plain object`,
				`${path} contains unknown option: `,
			)
			if (!isUnknownArray(candidate.fields) || candidate.fields.length === 0) {
				throw new TypeError(`${path}.fields must be a non-empty array`)
			}
			const names = candidate.fields.map((name, fieldIndex) => {
				assertNonEmptyString(name, `${path}.fields[${String(fieldIndex)}]`)
				const field = fields[name]
				if (field === undefined)
					throw new TypeError(`${path} references missing field: ${name}`)
				if (!('required' in field.options) || field.options.required !== true) {
					throw new TypeError(`${path} unique fields must be required: ${name}`)
				}
				return name
			})
			if (new Set(names).size !== names.length) {
				throw new TypeError(`${path} contains duplicate fields`)
			}
			const identity = JSON.stringify(names)
			if (seen.has(identity))
				throw new TypeError(`${path} duplicates another unique index`)
			seen.add(identity)
			return immutableRecord({ fields: immutableArray(names) })
		}),
	)
}

const normalizeReferences = <
	TFields extends Readonly<Record<string, GenericField>>,
>(
	fields: TFields,
	value: unknown,
): readonly PrivateCollectionReference<TFields>[] => {
	if (value === undefined) return immutableArray([])
	if (!isUnknownArray(value)) {
		throw new TypeError('private collection references must be an array')
	}
	const names = new Set<string>()
	return immutableArray(
		value.map((candidate, index) => {
			const path = `private collection references[${String(index)}]`
			assertExactPlainObject(
				candidate,
				new Set(['field', 'onDelete', 'target']),
				`${path} must be a plain object`,
				`${path} contains unknown option: `,
			)
			assertNonEmptyString(candidate.field, `${path}.field`)
			const field = fields[candidate.field]
			if (
				field?.kind !== 'uuid' ||
				!('required' in field.options) ||
				field.options.required !== true
			) {
				throw new TypeError(
					`${path}.field must reference a required UUID field`,
				)
			}
			if (names.has(candidate.field))
				throw new TypeError(`${path}.field is already referenced`)
			if (candidate.onDelete !== 'cascade' && candidate.onDelete !== 'fail') {
				throw new TypeError(`${path}.onDelete must be cascade or fail`)
			}
			if (
				(typeof candidate.target !== 'object' || candidate.target === null) &&
				typeof candidate.target !== 'function'
			) {
				throw new TypeError(`${path}.target must be a schema definition`)
			}
			names.add(candidate.field)
			return immutableRecord({
				field: candidate.field,
				onDelete: candidate.onDelete,
				target: candidate.target,
			}) as PrivateCollectionReference<TFields>
		}),
	)
}

/** Defines one nominal private collection while keeping its descriptor inaccessible. */
export const definePrivateCollection = <
	const TFields extends Readonly<Record<string, GenericField>>,
	const TIndexes extends readonly PrivateCollectionUniqueIndex<TFields>[],
>(
	options: DefinePrivateCollectionOptions<TFields, TIndexes>,
): PrivateCollection<TFields, TIndexes> => {
	assertExactPlainObject(
		options,
		new Set([
			'contributionId',
			'fields',
			'indexes',
			'normalizedStaticOptions',
			'protocolVersion',
			'references',
		]),
		'private collection options must be a plain object',
		'private collection options contains unknown option: ',
	)
	assertNonEmptyString(
		options.contributionId,
		'private collection contributionId',
	)
	if (
		!isPlainRecord(options.fields) ||
		Object.keys(options.fields).length === 0
	) {
		throw new TypeError(
			'private collection fields must be a non-empty plain object',
		)
	}
	for (const [name, field] of Object.entries(options.fields)) {
		assertNonEmptyString(name, 'private collection field name')
		assertPortableField(field, `private collection fields.${name}`)
	}
	const protocolVersion = options.protocolVersion ?? 1
	if (!Number.isSafeInteger(protocolVersion) || protocolVersion < 1) {
		throw new TypeError(
			'private collection protocolVersion must be a positive safe integer',
		)
	}
	const definition = immutableRecord({
		contributionId: options.contributionId,
		fields: immutableRecord(options.fields),
		indexes: normalizeIndexes(options.fields, options.indexes),
		normalizedStaticOptions: snapshotJsonValue(
			options.normalizedStaticOptions ?? {},
			'private collection normalizedStaticOptions',
		) as Readonly<Record<string, JsonValue>>,
		protocolVersion,
		references: normalizeReferences(options.fields, options.references),
	})
	const collection = immutableRecord({
		kind: 'private-collection' as const,
	}) as PrivateCollection<TFields, TIndexes>
	collectionDefinitions.set(collection, definition)
	return collection
}

/** @internal Rejects structural lookalikes at every owner boundary. */
export const readPrivateCollectionDefinition = (
	collection: unknown,
): PrivateCollectionDefinition => {
	const definition =
		typeof collection === 'object' && collection !== null
			? collectionDefinitions.get(collection)
			: undefined
	if (definition === undefined) {
		throw new TypeError(
			'private collection must be created by definePrivateCollection',
		)
	}
	return definition
}
