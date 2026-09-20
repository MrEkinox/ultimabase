import type { JsonValue } from '../../schema/fields/builtins/json.js'
import type {
	PluginSchemaContributionOwner,
	SchemaContributionProvenance,
} from '../../schema/schema/provenance.js'
import type { CanonicalSchemaCompilerState } from './canonical-state.js'
import { createCompilerContributionProvenance } from './canonical-state.js'
import type {
	SchemaCompilerOptionDefinitionNode,
	SchemaCompilerPatchNode,
} from './contracts.js'

export interface CanonicalSchemaOperationContext {
	readonly definitions: readonly SchemaCompilerOptionDefinitionNode[]
	readonly patch: SchemaCompilerPatchNode
	readonly state: CanonicalSchemaCompilerState
}

export const operationContributionProvenance = (
	context: CanonicalSchemaOperationContext,
	contributionId: string,
): SchemaContributionProvenance =>
	createCompilerContributionProvenance(
		context.patch.owner,
		contributionId,
		context.patch.staticOptions,
	)

const samePluginIdentity = (
	left: PluginSchemaContributionOwner,
	right: PluginSchemaContributionOwner,
): boolean =>
	left.pluginId === right.pluginId && left.instanceId === right.instanceId

export const resolveCompilerOptionDefinition = (
	definitions: readonly SchemaCompilerOptionDefinitionNode[],
	scope: 'field' | 'schema',
	name: string,
	preferredOwner: PluginSchemaContributionOwner,
	path: string,
): SchemaCompilerOptionDefinitionNode | undefined => {
	const candidates = definitions.filter(
		(definition) => definition.scope === scope && definition.name === name,
	)
	if (candidates.length === 0) return undefined
	if (candidates.length === 1) return candidates[0]

	const owned = candidates.filter((candidate) =>
		samePluginIdentity(candidate.owner, preferredOwner),
	)
	if (owned.length === 1) return owned[0]
	throw new TypeError(
		`Ambiguous ${scope} option owner for "${name}" at ${path}`,
	)
}

export const assertUnusedCompilerContributionId = (
	state: CanonicalSchemaCompilerState,
	owner: PluginSchemaContributionOwner,
	contributionId: string,
): void => {
	const provenance = [
		state.provenance.schema,
		...Object.values(state.provenance.fields),
		...state.provenance.constraints.map((entry) => entry.provenance),
		...state.provenance.indexes.map((entry) => entry.provenance),
		...state.provenance.patches.map((entry) => entry.provenance),
	]
	if (
		provenance.some(
			(candidate) =>
				candidate.contributionId === contributionId &&
				candidate.owner.kind === 'plugin' &&
				samePluginIdentity(candidate.owner, owner),
		)
	) {
		throw new TypeError(
			`Duplicate schema patch contributionId: ${contributionId}`,
		)
	}
}

export type CompilerStaticOptions = Readonly<Record<string, JsonValue>>
