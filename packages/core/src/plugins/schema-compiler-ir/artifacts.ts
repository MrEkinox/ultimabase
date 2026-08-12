import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	SchemaCompilerArtifactKind,
	SchemaCompilerArtifactReference,
} from './contracts.js'

const artifactReferences = new WeakSet<object>()

/** Reports whether a value is a nominal opaque compiler artifact reference. */
export const isSchemaCompilerArtifactReference = (
	value: unknown,
): value is SchemaCompilerArtifactReference =>
	isPlainRecord(value) && artifactReferences.has(value)

/** Owns private artifact resolution for exactly one application compilation. */
export class SchemaCompilerArtifactSession {
	readonly #artifacts = new Map<SchemaCompilerArtifactReference, unknown>()
	readonly #referencesById = new Map<string, SchemaCompilerArtifactReference>()

	/** Creates one deterministic public reference while retaining the artifact privately. */
	reference<const TKind extends SchemaCompilerArtifactKind>(
		artifactKind: TKind,
		artifactId: string,
		artifact: unknown,
	): SchemaCompilerArtifactReference<TKind> {
		assertNonEmptyString(artifactId, 'schema compiler artifactId')
		if (this.#referencesById.has(artifactId)) {
			throw new TypeError(`Duplicate schema compiler artifactId: ${artifactId}`)
		}

		const reference = immutableRecord({
			artifactId,
			artifactKind,
			kind: 'schema-compiler-artifact' as const,
		}) as SchemaCompilerArtifactReference<TKind>

		artifactReferences.add(reference)
		this.#artifacts.set(reference, artifact)
		this.#referencesById.set(artifactId, reference)
		return reference
	}

	/** Checks nominal identity, expected kind, and exact compilation ownership. */
	owns<const TKind extends SchemaCompilerArtifactKind>(
		reference: unknown,
		artifactKind?: TKind,
	): reference is SchemaCompilerArtifactReference<TKind> {
		return (
			isSchemaCompilerArtifactReference(reference) &&
			this.#artifacts.has(reference) &&
			(artifactKind === undefined || reference.artifactKind === artifactKind)
		)
	}

	/** Resolves one trusted artifact only after the public reference is revalidated. */
	resolve<const TKind extends SchemaCompilerArtifactKind>(
		reference: SchemaCompilerArtifactReference<TKind>,
		artifactKind: TKind,
	): unknown {
		if (!this.owns(reference, artifactKind)) {
			throw new TypeError(
				`Unknown ${artifactKind} artifact reference for this schema compilation`,
			)
		}

		return this.#artifacts.get(reference)
	}
}
