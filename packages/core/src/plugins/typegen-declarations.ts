import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type {
	CompiledApplicationSchemaSurface,
	CompiledPluginOperation,
} from './application-surface-registry.js'
import { snapshotStaticOptions } from './schema-declaration-contracts.js'
import {
	isTypegenReference,
	snapshotTypegenProperties,
	snapshotTypegenTypeNode,
	type TypegenNamedDeclaration,
	type TypegenOutputDeclaration,
	type TypegenOutputDeclarationOptions,
	type TypegenPropertyNode,
	type TypegenReference,
	type TypegenSchemaAugmentation,
	type TypegenStructuredContribution,
} from './typegen-contracts.js'

export interface TypegenReferenceRegistrar {
	/** Authorizes one public type import for this plugin's generated contracts. */
	register(reference: TypegenReference): void
}

export interface TypegenContributionRegistrar {
	/** Adds structured declarations to the main application-owned output. */
	add(contribution: TypegenStructuredContribution): void
}

export interface TypegenOutputRegistrar {
	/** Declares one separately owned inert output without accepting source text. */
	emit(output: TypegenOutputDeclarationOptions): void
}

export interface OwnedTypegenReference {
	readonly owner: PluginSchemaContributionOwner
	readonly reference: TypegenReference
}

export interface OwnedTypegenContribution {
	readonly augmentations: readonly TypegenSchemaAugmentation[]
	readonly contributionId: string
	readonly declarations: readonly TypegenNamedDeclaration[]
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export interface OwnedTypegenOutput {
	readonly contributionId: string
	readonly declarations?: readonly TypegenNamedDeclaration[]
	readonly kind: 'declaration' | 'metadata'
	readonly metadata?: JsonValue
	readonly outputPath: string
	readonly owner: PluginSchemaContributionOwner
	readonly staticOptions: Readonly<Record<string, JsonValue>>
}

export interface TypegenDeclarations {
	readonly contributions: readonly OwnedTypegenContribution[]
	readonly outputs: readonly OwnedTypegenOutput[]
	readonly references: readonly OwnedTypegenReference[]
}

export interface CompiledTypegenOption {
	readonly contributionId: string
	readonly name: string
	readonly owner: PluginSchemaContributionOwner
	readonly scope: 'field' | 'schema'
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly typegen: Readonly<{
		readonly generic?: 'self'
		readonly module: string
		readonly type: string
	}>
}

/** Exposes one immutable final graph to declaration-only tooling. */
export interface CompiledTypegenGraph {
	readonly declarations: readonly TypegenDeclarations[]
	readonly operations: readonly CompiledPluginOperation[]
	readonly options: readonly CompiledTypegenOption[]
	readonly schemaSurfaces: readonly CompiledApplicationSchemaSurface[]
}

export interface MutableTypegenDeclarations {
	readonly contributions: OwnedTypegenContribution[]
	readonly outputs: OwnedTypegenOutput[]
	readonly references: OwnedTypegenReference[]
}

const hasDeclarationKind = (
	_value: TypegenOutputDeclarationOptions,
	kind: unknown,
): _value is TypegenOutputDeclaration => kind === 'declaration'

const identifierPattern = /^[$A-Z_a-z][$\w]*$/u
const dangerousMetadataKey =
	/^(?:access[-_]?token|api[-_]?key|credential|database[-_]?url|password|private[-_]?key|runtime[-_]?client|secret)$/iu

const assertExactKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !keys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
	}
}

const snapshotDeclarations = (
	value: unknown,
	path: string,
): readonly TypegenNamedDeclaration[] => {
	if (!isUnknownArray(value)) throw new TypeError(`${path} must be a list`)
	const names = new Set<string>()
	return immutableArray(
		value.map((candidate, index) => {
			const itemPath = `${path}[${String(index)}]`
			if (!isPlainRecord(candidate)) {
				throw new TypeError(`${itemPath} must be a named declaration`)
			}
			assertExactKeys(
				candidate,
				new Set(['description', 'kind', 'name', 'type']),
				itemPath,
			)
			if (candidate.kind !== 'type') {
				throw new TypeError(`${itemPath}.kind must be type`)
			}
			assertNonEmptyString(candidate.name, `${itemPath}.name`)
			if (!identifierPattern.test(candidate.name)) {
				throw new TypeError(`${itemPath}.name must be an identifier`)
			}
			if (names.has(candidate.name)) {
				throw new TypeError(
					`${path} contains duplicate declaration: ${candidate.name}`,
				)
			}
			names.add(candidate.name)
			if (
				candidate.description !== undefined &&
				typeof candidate.description !== 'string'
			) {
				throw new TypeError(`${itemPath}.description must be a string`)
			}
			return immutableRecord({
				...(candidate.description === undefined
					? {}
					: { description: candidate.description }),
				kind: 'type' as const,
				name: candidate.name,
				type: snapshotTypegenTypeNode(candidate.type, `${itemPath}.type`),
			})
		}),
	)
}

const snapshotAugmentations = (
	value: unknown,
	path: string,
): readonly TypegenSchemaAugmentation[] => {
	if (!isUnknownArray(value)) throw new TypeError(`${path} must be a list`)
	const targets = new Set<string>()
	return immutableArray(
		value.map((candidate, index) => {
			const itemPath = `${path}[${String(index)}]`
			if (!isPlainRecord(candidate)) {
				throw new TypeError(`${itemPath} must be a schema augmentation`)
			}
			assertExactKeys(
				candidate,
				new Set(['model', 'schema', 'target']),
				itemPath,
			)
			assertNonEmptyString(candidate.target, `${itemPath}.target`)
			if (targets.has(candidate.target)) {
				throw new TypeError(
					`${path} contains duplicate target: ${candidate.target}`,
				)
			}
			targets.add(candidate.target)
			const snapshotProperties = (
				properties: unknown,
				propertyPath: string,
			): readonly TypegenPropertyNode[] => {
				if (!isUnknownArray(properties)) {
					throw new TypeError(`${propertyPath} must be a list`)
				}
				return snapshotTypegenProperties(properties, propertyPath)
			}
			const schema =
				candidate.schema === undefined
					? undefined
					: snapshotProperties(candidate.schema, `${itemPath}.schema`)
			const model =
				candidate.model === undefined
					? undefined
					: snapshotProperties(candidate.model, `${itemPath}.model`)
			if (schema === undefined && model === undefined) {
				throw new TypeError(`${itemPath} must augment schema or model`)
			}
			return immutableRecord({
				...(model === undefined ? {} : { model }),
				...(schema === undefined ? {} : { schema }),
				target: candidate.target,
			})
		}),
	)
}

const assertSafeMetadata = (value: unknown, path: string): void => {
	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			assertSafeMetadata(item, `${path}[${String(index)}]`)
		})
		return
	}
	if (isPlainRecord(value)) {
		for (const [key, item] of Object.entries(value)) {
			if (dangerousMetadataKey.test(key)) {
				throw new TypeError(`${path} contains prohibited sensitive key: ${key}`)
			}
			assertSafeMetadata(item, `${path}.${key}`)
		}
		return
	}
	if (
		value !== null &&
		typeof value !== 'boolean' &&
		typeof value !== 'number' &&
		typeof value !== 'string'
	) {
		throw new TypeError(`${path} must contain only JSON values`)
	}
}

const collectReferences = (
	value: unknown,
	references: Set<TypegenReference>,
): void => {
	if (isTypegenReference(value)) {
		references.add(value)
		return
	}
	if (Array.isArray(value)) {
		for (const item of value) collectReferences(item, references)
		return
	}
	if (isPlainRecord(value)) {
		for (const item of Object.values(value)) collectReferences(item, references)
	}
}

/** Creates all three owner-bound Typegen facades over one declaration batch. */
export const createTypegenRegistrars = (
	owner: PluginSchemaContributionOwner,
	declarations: MutableTypegenDeclarations,
	assertOpen: () => void,
): Readonly<{
	contributions: TypegenContributionRegistrar
	outputs: TypegenOutputRegistrar
	references: TypegenReferenceRegistrar
}> => {
	const registeredReferences = new Set<TypegenReference>()
	const assertReferencesRegistered = (value: unknown, path: string): void => {
		const references = new Set<TypegenReference>()
		collectReferences(value, references)
		for (const reference of references) {
			if (!registeredReferences.has(reference)) {
				throw new TypeError(`${path} uses an unregistered Typegen reference`)
			}
		}
	}
	return immutableRecord({
		contributions: immutableRecord({
			add: (value): void => {
				assertOpen()
				if (!isPlainRecord(value)) {
					throw new TypeError('Typegen contribution must be a plain object')
				}
				assertExactKeys(
					value,
					new Set([
						'augmentations',
						'contributionId',
						'declarations',
						'staticOptions',
					]),
					'Typegen contribution',
				)
				assertNonEmptyString(value.contributionId, 'Typegen contributionId')
				const declarationsSnapshot = snapshotDeclarations(
					value.declarations ?? [],
					'Typegen contribution declarations',
				)
				const augmentations = snapshotAugmentations(
					value.augmentations ?? [],
					'Typegen contribution augmentations',
				)
				if (declarationsSnapshot.length === 0 && augmentations.length === 0) {
					throw new TypeError(
						'Typegen contribution must contain declarations or augmentations',
					)
				}
				assertReferencesRegistered(value, 'Typegen contribution')
				declarations.contributions.push(
					immutableRecord({
						augmentations,
						contributionId: value.contributionId,
						declarations: declarationsSnapshot,
						owner,
						staticOptions: snapshotStaticOptions(
							value.staticOptions,
							'Typegen contribution staticOptions',
						),
					}),
				)
			},
		}),
		outputs: immutableRecord({
			emit: (value): void => {
				assertOpen()
				const candidate: unknown = value
				if (!isPlainRecord(candidate)) {
					throw new TypeError('Typegen output must be a plain object')
				}
				assertNonEmptyString(
					value.contributionId,
					'Typegen output contributionId',
				)
				assertNonEmptyString(value.outputPath, 'Typegen outputPath')
				if (hasDeclarationKind(value, candidate.kind)) {
					assertExactKeys(
						value,
						new Set([
							'contributionId',
							'declarations',
							'kind',
							'outputPath',
							'staticOptions',
						]),
						'Typegen declaration output',
					)
					if (!value.outputPath.endsWith('.d.ts')) {
						throw new TypeError(
							'Typegen declaration outputPath must end in .d.ts',
						)
					}
					const declarationsSnapshot = snapshotDeclarations(
						value.declarations,
						'Typegen output declarations',
					)
					if (declarationsSnapshot.length === 0) {
						throw new TypeError(
							'Typegen declaration output must contain at least one declaration',
						)
					}
					assertReferencesRegistered(value, 'Typegen output')
					declarations.outputs.push(
						immutableRecord({
							contributionId: value.contributionId,
							declarations: declarationsSnapshot,
							kind: 'declaration' as const,
							outputPath: value.outputPath,
							owner,
							staticOptions: snapshotStaticOptions(
								value.staticOptions,
								'Typegen output staticOptions',
							),
						}),
					)
					return
				}
				if (candidate.kind !== 'metadata') {
					throw new TypeError(
						'Typegen output kind must be declaration or metadata',
					)
				}
				assertExactKeys(
					value,
					new Set([
						'contributionId',
						'kind',
						'metadata',
						'outputPath',
						'staticOptions',
					]),
					'Typegen metadata output',
				)
				if (!value.outputPath.endsWith('.json')) {
					throw new TypeError('Typegen metadata outputPath must end in .json')
				}
				assertSafeMetadata(value.metadata, 'Typegen output metadata')
				declarations.outputs.push(
					immutableRecord({
						contributionId: value.contributionId,
						kind: 'metadata' as const,
						metadata: value.metadata,
						outputPath: value.outputPath,
						owner,
						staticOptions: snapshotStaticOptions(
							value.staticOptions,
							'Typegen output staticOptions',
						),
					}),
				)
			},
		}),
		references: immutableRecord({
			register: (reference): void => {
				assertOpen()
				if (!isTypegenReference(reference)) {
					throw new TypeError(
						'Typegen reference must be created by defineTypegenReference',
					)
				}
				if (registeredReferences.has(reference)) {
					throw new TypeError(
						'Typegen reference is already registered by this plugin',
					)
				}
				registeredReferences.add(reference)
				declarations.references.push(immutableRecord({ owner, reference }))
			},
		}),
	})
}

export const snapshotTypegenDeclarations = (
	declarations: MutableTypegenDeclarations,
): TypegenDeclarations =>
	immutableRecord({
		contributions: immutableArray(declarations.contributions),
		outputs: immutableArray(declarations.outputs),
		references: immutableArray(declarations.references),
	})
