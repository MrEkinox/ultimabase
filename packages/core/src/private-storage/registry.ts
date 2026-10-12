import { createHash } from 'node:crypto'

import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import type { PluginIdentity } from '../plugins/manifest.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
} from '../plugins/manifest.js'
import { PluginIdentityMap } from '../plugins/plugin-identity-map.js'
import { compileFieldValidationPlan } from '../schema/plans/compiler.js'
import type { GenericField } from '../schema/fields/base/contract.js'
import { Schema } from '../schema/schema/definition.js'
import type { SchemaRegistry } from '../schema/schema/registry.js'
import type { JsonValue } from '../schema/fields/builtins/json.js'
import type {
	PrivateCollection,
	PrivateStorageDeclarationRegistrar,
} from './contracts.js'
import { readPrivateCollectionDefinition } from './definition.js'
import type { PrivateStorageAdapterCollection } from './adapter.js'

interface RegisteredPrivateCollection {
	readonly adapter: PrivateStorageAdapterCollection
	readonly collection: PrivateCollection
}

const canonicalJson = (value: JsonValue): JsonValue => {
	if (Array.isArray(value)) return immutableArray(value.map(canonicalJson))
	if (!isPlainRecord(value)) return value
	return immutableRecord(
		Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, canonicalJson(item)]),
		),
	)
}

const fieldFingerprint = (field: GenericField): JsonValue => {
	const options = Object.fromEntries(
		Object.entries(field.options)
			.filter(([name]) => name !== 'fields')
			.sort(([left], [right]) => left.localeCompare(right)),
	)
	const children: unknown = Reflect.get(field.options, 'fields')
	return canonicalJson({
		kind: field.kind,
		options: options as Readonly<Record<string, JsonValue>>,
		...(isPlainRecord(children)
			? {
					fields: Object.fromEntries(
						Object.entries(children)
							.sort(([left], [right]) => left.localeCompare(right))
							.map(([name, child]) => [
								name,
								fieldFingerprint(child as GenericField),
							]),
					),
				}
			: {}),
	})
}

const privateFailure = (
	owner: PluginIdentity,
	kind: string,
	message: string,
): FrameworkError<'PLUGIN_DECLARATION_INVALID'> =>
	new FrameworkError('PLUGIN_DECLARATION_INVALID', message, {
		internalDetails: {
			kind,
			plugin: formatPluginIdentity(owner),
		},
	})

/** Owns private declarations without publishing them through the schema registry. */
export class PrivateStorageRegistry {
	readonly #registered = new Map<object, RegisteredPrivateCollection>()
	readonly #ordered: RegisteredPrivateCollection[] = []
	readonly #ownerIds = new PluginIdentityMap<Set<string>>()
	#closed = false

	beginDeclaration(
		owner: PluginIdentity,
		packageVersion: string,
	): Readonly<{
		close(): void
		registrar: PrivateStorageDeclarationRegistrar
	}> {
		if (this.#closed)
			throw new TypeError('Private storage declaration is closed')
		let open = true
		return immutableRecord({
			registrar: immutableRecord({
				register: (collection: PrivateCollection): void => {
					if (!open)
						throw new TypeError('Private storage declaration facade is closed')
					const definition = readPrivateCollectionDefinition(collection)
					const ids = this.#ownerIds.getOrCreate(owner, () => new Set())
					if (ids.has(definition.contributionId)) {
						throw privateFailure(
							owner,
							'private-storage-contribution-duplicate',
							`Plugin "${formatPluginIdentity(owner)}" already declared private collection "${definition.contributionId}".`,
						)
					}
					if (this.#registered.has(collection)) {
						throw privateFailure(
							owner,
							'private-storage-token-reused',
							'One private collection token cannot be declared by multiple owners.',
						)
					}
					const fields = immutableRecord(
						Object.fromEntries(
							Object.entries(definition.fields).map(([name, field]) => [
								name,
								immutableRecord({
									create: compileFieldValidationPlan(field, 'create'),
									update: compileFieldValidationPlan(field, 'update'),
								}),
							]),
						),
					)
					const registered = immutableRecord({
						adapter: immutableRecord({
							contributionId: definition.contributionId,
							fields,
							indexes: definition.indexes,
							normalizedStaticOptions: definition.normalizedStaticOptions,
							owner: immutableRecord(owner),
							packageVersion,
							protocolVersion: definition.protocolVersion,
							references: definition.references,
						}),
						collection,
					})
					this.#registered.set(collection, registered)
					this.#ordered.push(registered)
					ids.add(definition.contributionId)
				},
			}),
			close: (): void => {
				open = false
			},
		})
	}

	close(schemas: SchemaRegistry): void {
		if (this.#closed)
			throw new TypeError('Private storage registry is already closed')
		for (const { adapter } of this.#ordered) {
			for (const reference of adapter.references) {
				if (
					!Schema.is(reference.target) ||
					schemas.get(reference.target.className) !== reference.target
				) {
					throw privateFailure(
						adapter.owner,
						'private-storage-reference-target-invalid',
						`Private collection "${adapter.contributionId}" references a schema outside this application.`,
					)
				}
			}
		}
		this.#closed = true
	}

	get size(): number {
		return this.#ordered.length
	}

	values(): readonly PrivateStorageAdapterCollection[] {
		if (!this.#closed)
			throw new TypeError('Private storage registry is not compiled')
		return immutableArray(this.#ordered.map(({ adapter }) => adapter))
	}

	resolve(
		collection: unknown,
		owner: PluginIdentity,
	): PrivateStorageAdapterCollection {
		if (!this.#closed)
			throw new TypeError('Private storage registry is not compiled')
		const registered =
			typeof collection === 'object' && collection !== null
				? this.#registered.get(collection)
				: undefined
		if (
			registered === undefined ||
			!isSamePluginIdentity(registered.adapter.owner, owner)
		) {
			throw new FrameworkError(
				'PLUGIN_PRIVILEGE_DENIED',
				'Private collection access requires its exact declaring plugin instance.',
				{ internalDetails: { kind: 'private-storage-owner-mismatch' } },
			)
		}
		return registered.adapter
	}

	fingerprint(): string | undefined {
		if (this.#ordered.length === 0) return undefined
		const snapshot = this.#ordered.map(({ adapter }) => ({
			contributionId: adapter.contributionId,
			fields: Object.fromEntries(
				Object.entries(adapter.fields)
					.sort(([left], [right]) => left.localeCompare(right))
					.map(([name, { create }]) => [name, fieldFingerprint(create.field)]),
			),
			indexes: adapter.indexes,
			normalizedStaticOptions: canonicalJson(adapter.normalizedStaticOptions),
			owner: adapter.owner,
			packageVersion: adapter.packageVersion,
			protocolVersion: adapter.protocolVersion,
			references: adapter.references.map((reference) => ({
				field: reference.field,
				onDelete: reference.onDelete,
				target: reference.target.className,
			})),
		}))
		return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
	}
}
