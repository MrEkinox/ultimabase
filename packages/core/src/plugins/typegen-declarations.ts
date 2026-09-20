import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { JsonValue } from '../schema/fields/builtins/json.js'
import type { FieldDeclarationContext } from '../schema/schema/field-contexts.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type {
	CompiledSchemaSurfaceFacts,
	OperationCommandFacts,
} from './application-surface-contracts.js'
import {
	isTypegenReference,
	type TypegenReference,
} from './typegen-contracts.js'

export interface TypegenReferenceRegistrar {
	/** Authorizes one public type import for this plugin's generated contracts. */
	register(reference: TypegenReference): void
}

export interface OwnedTypegenReference {
	readonly owner: PluginSchemaContributionOwner
	readonly reference: TypegenReference
}

export interface TypegenDeclarations {
	readonly references: readonly OwnedTypegenReference[]
}

export interface CompiledTypegenOption {
	readonly contributionId: string
	readonly contexts?: readonly FieldDeclarationContext[]
	readonly name: string
	readonly owner: PluginSchemaContributionOwner
	readonly scope: 'field' | 'schema'
	readonly staticOptions: Readonly<Record<string, JsonValue>>
	readonly typegen: Readonly<{
		readonly compatibilityType?: string
		readonly generic?: 'self'
		readonly module: string
		readonly type: string
	}>
}

/** Describes the compiled graph without validators, executable tokens or constructors. */
export interface CompiledTypegenGraph {
	readonly declarations: readonly TypegenDeclarations[]
	readonly operations: readonly Readonly<{
		readonly operation: OperationCommandFacts
		readonly owner: PluginSchemaContributionOwner
	}>[]
	readonly options: readonly CompiledTypegenOption[]
	readonly schemaSurfaces: readonly CompiledSchemaSurfaceFacts[]
}

export interface MutableTypegenDeclarations {
	readonly references: OwnedTypegenReference[]
}

/** Creates the owner-bound public type-reference registrar for one declaration batch. */
export const createTypegenReferenceRegistrar = (
	owner: PluginSchemaContributionOwner,
	declarations: MutableTypegenDeclarations,
	assertOpen: () => void,
): TypegenReferenceRegistrar => {
	const registeredReferences = new Set<TypegenReference>()
	return immutableRecord({
		register: (reference): void => {
			assertOpen()
			if (!isTypegenReference(reference))
				throw new TypeError(
					'Typegen reference must be created by defineTypegenReference',
				)
			if (registeredReferences.has(reference))
				throw new TypeError(
					'Typegen reference is already registered by this plugin',
				)
			registeredReferences.add(reference)
			declarations.references.push(immutableRecord({ owner, reference }))
		},
	})
}

export const snapshotTypegenDeclarations = (
	declarations: MutableTypegenDeclarations,
): TypegenDeclarations =>
	immutableRecord({
		references: immutableArray(declarations.references),
	})
