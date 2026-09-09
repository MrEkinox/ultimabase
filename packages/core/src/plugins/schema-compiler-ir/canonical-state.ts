import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { JsonValue } from '../../schema/fields/builtins/json.js'
import type {
	PluginSchemaContributionOwner,
	SchemaCompilationProvenance,
	SchemaContributionOwner,
	SchemaContributionOwnerReference,
	SchemaContributionProvenance,
} from '../../schema/schema/provenance.js'
import type {
	SchemaCompilerConstraintNode,
	SchemaCompilerFieldNode,
	SchemaCompilerIndexNode,
	SchemaCompilerOptionNode,
	SchemaCompilerSchemaNode,
	SchemaCompilerVirtualFieldNode,
} from './contracts.js'

export interface CanonicalSchemaCompilerState {
	readonly artifact: SchemaCompilerSchemaNode['artifact']
	readonly className: string
	constraints: readonly SchemaCompilerConstraintNode[]
	developerFieldNames: readonly string[]
	fields: readonly SchemaCompilerFieldNode[]
	indexes: readonly SchemaCompilerIndexNode[]
	options: readonly SchemaCompilerOptionNode[]
	provenance: SchemaCompilationProvenance
	virtualFields: readonly SchemaCompilerVirtualFieldNode[]
}

export const createCanonicalSchemaCompilerState = (
	schema: SchemaCompilerSchemaNode,
): CanonicalSchemaCompilerState => ({
	artifact: schema.artifact,
	className: schema.className,
	constraints: schema.constraints,
	developerFieldNames: schema.developerFieldNames,
	fields: schema.fields,
	indexes: schema.indexes,
	options: schema.options,
	provenance: schema.provenance,
	virtualFields: schema.virtualFields,
})

export const snapshotCanonicalSchemaCompilerState = (
	state: CanonicalSchemaCompilerState,
): SchemaCompilerSchemaNode =>
	immutableRecord({
		artifact: state.artifact,
		className: state.className,
		constraints: immutableArray(state.constraints),
		developerFieldNames: immutableArray(state.developerFieldNames),
		fields: immutableArray(state.fields),
		indexes: immutableArray(state.indexes),
		options: immutableArray(state.options),
		provenance: state.provenance,
		virtualFields: immutableArray(state.virtualFields),
	})

export const sameCompilerOwner = (
	owner: SchemaContributionOwner,
	reference: SchemaContributionOwnerReference,
): boolean => {
	if (owner.kind !== reference.kind) return false
	if (owner.kind !== 'plugin') return true
	return (
		reference.kind === 'plugin' &&
		owner.pluginId === reference.pluginId &&
		owner.instanceId === reference.instanceId
	)
}

export const createCompilerContributionProvenance = (
	owner: PluginSchemaContributionOwner,
	contributionId: string,
	staticOptions: Readonly<Record<string, JsonValue>>,
	protocolVersion = 1,
): SchemaContributionProvenance =>
	immutableRecord({
		contributionId,
		normalizedStaticOptions: staticOptions,
		owner,
		protocolVersion,
	})

export const appendCompilerPatchProvenance = (
	state: CanonicalSchemaCompilerState,
	kind: string,
	provenance: SchemaContributionProvenance,
): void => {
	state.provenance = immutableRecord({
		...state.provenance,
		patches: immutableArray([
			...state.provenance.patches,
			immutableRecord({
				kind,
				provenance,
				targetClassName: state.className,
			}),
		]),
	})
}

export const removeNamedNode = <
	TNode extends Readonly<{ readonly name: string }>,
>(
	nodes: readonly TNode[],
	name: string,
): readonly TNode[] =>
	immutableArray(nodes.filter((node) => node.name !== name))

export const replaceNamedNode = <
	TNode extends Readonly<{ readonly name: string }>,
>(
	nodes: readonly TNode[],
	name: string,
	replacement: TNode,
): readonly TNode[] =>
	immutableArray(nodes.map((node) => (node.name === name ? replacement : node)))

export const withoutCompilerRecordKey = <TValue>(
	record: Readonly<Record<string, TValue>>,
	removedKey: string,
): Readonly<Record<string, TValue>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([key]) => key !== removedKey),
		),
	)
