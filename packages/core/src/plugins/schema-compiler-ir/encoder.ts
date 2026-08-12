import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../../schema/fields/base/contract.js'
import { assertFieldDefinition } from '../../schema/fields/base/definition.js'
import { snapshotJsonValue } from '../../schema/fields/builtins/json.js'
import type {
	SchemaExtension,
	SchemaExtensionFields,
} from '../../schema/extensions/definition.js'
import type { PreparedSchemaCompilation } from '../../schema/schema/definition.js'
import { areSchemaDeclarationValuesCompatible } from '../../schema/schema/definition.js'
import type {
	SchemaContributionProvenance,
	SchemaContributionOwnerReference,
	SchemaOptionProvenance,
} from '../../schema/schema/provenance.js'
import type {
	SchemaCompilerArtifactKind,
	SchemaCompilerArtifactReference,
	SchemaCompilerConstraintNode,
	SchemaCompilerExtensionNode,
	SchemaCompilerFieldNode,
	SchemaCompilerIndexNode,
	SchemaCompilerOptionValue,
	SchemaCompilerSchemaNode,
} from './contracts.js'
import { SchemaCompilerArtifactSession } from './artifacts.js'

const coreSchemaKeys = new Set([
	'className',
	'constraints',
	'extensions',
	'fields',
	'indexes',
	'provenance',
])

/** Encodes trusted artifacts into one deterministic application-local IR session. */
export class SchemaCompilerIrEncoder {
	readonly session: SchemaCompilerArtifactSession =
		new SchemaCompilerArtifactSession()
	readonly #referencesByArtifact = new WeakMap<
		object,
		Map<SchemaCompilerArtifactKind, SchemaCompilerArtifactReference>
	>()
	readonly #artifactsByKind = new Map<
		SchemaCompilerArtifactKind,
		readonly Readonly<{
			readonly artifact: unknown
			readonly reference: SchemaCompilerArtifactReference
		}>[]
	>()
	readonly #referencesByContributionId = new Map<
		string,
		readonly Readonly<{
			readonly owner: SchemaContributionProvenance['owner']
			readonly reference: SchemaCompilerArtifactReference
		}>[]
	>()
	#nextArtifactId: number

	constructor() {
		this.#nextArtifactId = 0
	}

	/** Reuses one nominal reference when the same declared artifact appears again. */
	reference<const TKind extends SchemaCompilerArtifactKind>(
		artifactKind: TKind,
		artifact: unknown,
		path: string,
	): SchemaCompilerArtifactReference<TKind> {
		const reusable =
			(typeof artifact === 'object' && artifact !== null) ||
			typeof artifact === 'function'
		const artifactObject = reusable ? artifact : undefined
		const references =
			artifactObject === undefined
				? undefined
				: this.#referencesByArtifact.get(artifactObject)
		const existing = references?.get(artifactKind)
		if (existing !== undefined) {
			return existing as SchemaCompilerArtifactReference<TKind>
		}

		const reference = this.session.reference(
			artifactKind,
			`${artifactKind}:${String(this.#nextArtifactId)}:${path}`,
			artifact,
		)
		this.#nextArtifactId += 1
		if (artifactObject !== undefined) {
			const nextReferences =
				references ??
				new Map<SchemaCompilerArtifactKind, SchemaCompilerArtifactReference>()
			nextReferences.set(artifactKind, reference)
			this.#referencesByArtifact.set(artifactObject, nextReferences)
		}
		this.#artifactsByKind.set(artifactKind, [
			...(this.#artifactsByKind.get(artifactKind) ?? []),
			{ artifact, reference },
		])
		return reference
	}

	/** Reuses an already encoded logical shape for an exact transform target. */
	compatibleReference<const TKind extends SchemaCompilerArtifactKind>(
		artifactKind: TKind,
		artifact: unknown,
		path: string,
	): SchemaCompilerArtifactReference<TKind> {
		const compatible = this.#artifactsByKind
			.get(artifactKind)
			?.find((candidate) =>
				areSchemaDeclarationValuesCompatible(candidate.artifact, artifact),
			)
		if (compatible !== undefined) {
			return compatible.reference as SchemaCompilerArtifactReference<TKind>
		}
		return this.reference(artifactKind, artifact, path)
	}

	/** Resolves a transform expectation through its exact declared contribution. */
	targetReference<const TKind extends SchemaCompilerArtifactKind>(
		artifactKind: TKind,
		contributionId: string,
		owner: SchemaContributionOwnerReference,
		artifact: unknown,
		path: string,
	): SchemaCompilerArtifactReference<TKind> {
		const candidate = this.#referencesByContributionId
			.get(contributionId)
			?.find(
				(entry) =>
					entry.reference.artifactKind === artifactKind &&
					entry.owner.kind === owner.kind &&
					(entry.owner.kind !== 'plugin' ||
						(owner.kind === 'plugin' &&
							entry.owner.pluginId === owner.pluginId &&
							entry.owner.instanceId === owner.instanceId)),
			)
		return candidate === undefined
			? this.compatibleReference(artifactKind, artifact, path)
			: (candidate.reference as SchemaCompilerArtifactReference<TKind>)
	}

	private recordContributionReference(
		reference: SchemaCompilerArtifactReference,
		provenance: SchemaContributionProvenance,
	): void {
		this.#referencesByContributionId.set(provenance.contributionId, [
			...(this.#referencesByContributionId.get(provenance.contributionId) ??
				[]),
			{ owner: provenance.owner, reference },
		])
	}

	/** Keeps portable values inspectable and masks every executable or nominal value. */
	optionValue(value: unknown, path: string): SchemaCompilerOptionValue {
		try {
			return snapshotJsonValue(value, path)
		} catch (error: unknown) {
			if (!(error instanceof TypeError || error instanceof RangeError))
				throw error
			return this.reference('option-value', value, path)
		}
	}

	/** Encodes one field and recursively exposes nested logical field facts. */
	fieldNode(
		field: GenericField,
		name: string,
		path: string,
		provenance: SchemaContributionProvenance,
		optionProvenance: Readonly<
			Record<string, SchemaOptionProvenance>
		> = immutableRecord({}),
	): SchemaCompilerFieldNode {
		const nestedInput =
			'fields' in field.options && isPlainRecord(field.options.fields)
				? field.options.fields
				: undefined
		const fields = immutableArray(
			Object.entries(nestedInput ?? {}).map(([childName, child]) => {
				assertFieldDefinition(child, `${path}.fields.${childName}`)
				return this.fieldNode(
					child,
					childName,
					`${path}.fields.${childName}`,
					provenance,
				)
			}),
		)
		const options = immutableArray(
			Object.entries(field.options).map(([optionName, value]) => {
				const declaredProvenance = optionProvenance[optionName]
				return immutableRecord({
					name: optionName,
					provenance:
						declaredProvenance ??
						immutableRecord({ definition: provenance, value: provenance }),
					value: this.optionValue(value, `${path}.options.${optionName}`),
				})
			}),
		)

		const artifact = this.reference('field', field, path)
		this.recordContributionReference(artifact, provenance)
		return immutableRecord({
			artifact,
			fields,
			kind: field.kind,
			name,
			options,
			provenance,
		})
	}

	/** Encodes one prepared schema without leaking its constructor identity. */
	schemaNode(
		candidate: PreparedSchemaCompilation,
		path: string,
	): SchemaCompilerSchemaNode {
		const definition = candidate.definition
		const provenance = definition.provenance
		const fields = immutableArray(
			Object.entries(definition.fields).map(([name, field]) => {
				const fieldProvenance = provenance.fields[name]
				if (fieldProvenance === undefined) {
					throw new TypeError(
						`Missing schema compiler field provenance: ${path}.${name}`,
					)
				}
				return this.fieldNode(
					field,
					name,
					`${path}.fields.${name}`,
					fieldProvenance,
					provenance.fieldOptions[name],
				)
			}),
		)
		const options = immutableArray(
			Object.entries(definition)
				.filter(([name]) => !coreSchemaKeys.has(name))
				.map(([name, value]) => {
					const optionProvenance = provenance.options[name]
					if (optionProvenance === undefined) {
						throw new TypeError(
							`Missing schema compiler option provenance: ${path}.${name}`,
						)
					}
					return immutableRecord({
						name,
						provenance: optionProvenance,
						value: this.optionValue(value, `${path}.options.${name}`),
					})
				}),
		)

		return immutableRecord({
			artifact: this.reference('schema', candidate.schema, path),
			className: candidate.schema.className,
			constraints: this.constraintNodes(candidate, path),
			developerFieldNames: immutableArray(
				Object.keys(candidate.developerFields),
			),
			extensions: this.extensionNodes(candidate, path),
			fields,
			indexes: this.indexNodes(candidate),
			options,
			provenance,
		})
	}

	constraintNode(
		definition: SchemaCompilerConstraintNode['definition'],
		provenance: SchemaContributionProvenance,
		path: string,
	): SchemaCompilerConstraintNode {
		const artifact = this.reference('constraint', definition, path)
		this.recordContributionReference(artifact, provenance)
		return immutableRecord({
			artifact,
			definition,
			provenance,
		})
	}

	extensionNode(
		extension: SchemaExtension<string, object, string, SchemaExtensionFields>,
		name: string,
		provenance: SchemaContributionProvenance,
		path: string,
		fieldProvenance: Readonly<
			Record<string, SchemaContributionProvenance>
		> = immutableRecord({}),
		fieldOptionProvenance: Readonly<
			Record<string, Readonly<Record<string, SchemaOptionProvenance>>>
		> = immutableRecord({}),
		fields: SchemaExtensionFields = extension.fields,
	): SchemaCompilerExtensionNode {
		const artifact = this.reference('extension', extension, path)
		this.recordContributionReference(artifact, provenance)
		return immutableRecord({
			artifact,
			fields: immutableArray(
				Object.entries(fields).map(([fieldName, field]) =>
					this.fieldNode(
						field,
						fieldName,
						`${path}.fields.${fieldName}`,
						fieldProvenance[fieldName] ?? provenance,
						fieldOptionProvenance[fieldName],
					),
				),
			),
			name,
			provenance,
		})
	}

	private constraintNodes(
		candidate: PreparedSchemaCompilation,
		path: string,
	): readonly SchemaCompilerConstraintNode[] {
		return immutableArray(
			candidate.definition.constraints.map((definition, index) => {
				const entry = candidate.definition.provenance.constraints[index]
				if (entry === undefined) {
					throw new TypeError(
						`Missing constraint provenance: ${path}:${String(index)}`,
					)
				}
				return this.constraintNode(
					definition,
					entry.provenance,
					`${path}.constraints.${String(index)}`,
				)
			}),
		)
	}

	private extensionNodes(
		candidate: PreparedSchemaCompilation,
		path: string,
	): readonly SchemaCompilerExtensionNode[] {
		return immutableArray(
			candidate.definition.extensions.map((extension, index) => {
				const entry = candidate.definition.provenance.extensions[index]
				if (entry === undefined) {
					throw new TypeError(
						`Missing extension provenance: ${path}:${String(index)}`,
					)
				}
				return this.extensionNode(
					extension,
					entry.name,
					entry.provenance,
					`${path}.extensions.${String(index)}`,
					candidate.definition.provenance.fields,
					candidate.definition.provenance.fieldOptions,
				)
			}),
		)
	}

	private indexNodes(
		candidate: PreparedSchemaCompilation,
	): readonly SchemaCompilerIndexNode[] {
		return immutableArray(
			candidate.definition.indexes.map((definition, index) => {
				const entry = candidate.definition.provenance.indexes[index]
				if (entry === undefined) {
					throw new TypeError(
						`Missing index provenance: ${candidate.schema.className}:${String(index)}`,
					)
				}
				return immutableRecord({ definition, provenance: entry.provenance })
			}),
		)
	}
}
