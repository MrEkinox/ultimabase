import { immutableRecord } from '@ultimabase/shared'

import {
	readSelectedCapabilityProvider,
	type CapabilityInventory,
} from '../capability-inventory.js'
import type {
	CapabilityProviderDeclaration,
	CapabilityReplacementDeclaration,
} from '../capabilities.js'
import {
	isCanonicalSchemaCompilerDeclaration,
	readSchemaCompilerDescriptor,
	readSchemaCompilerImplementation,
	schemaCompilerCapability,
	type SchemaCompilerImplementation,
	type SchemaCompilerProvenance,
} from './schema-compiler-capability.js'

export interface SelectedSchemaCompiler {
	readonly compile: SchemaCompilerImplementation
	readonly provenance: SchemaCompilerProvenance
}

/** Selects the callback privately while deriving all public provenance in Core. */
export const selectSchemaCompiler = (
	inventory: CapabilityInventory,
): SelectedSchemaCompiler => {
	const selected = readSelectedCapabilityProvider(
		inventory,
		schemaCompilerCapability,
	)
	// The exact nominal token selected above makes this narrower declaration safe.
	const declaration = selected.declaration as
		| CapabilityProviderDeclaration<typeof schemaCompilerCapability>
		| CapabilityReplacementDeclaration<typeof schemaCompilerCapability>
	const descriptor = readSchemaCompilerDescriptor(declaration)
	const owner = isCanonicalSchemaCompilerDeclaration(declaration)
		? immutableRecord({ kind: 'core' as const, version: selected.version })
		: immutableRecord({
				kind: 'plugin' as const,
				pluginId: selected.owner.pluginId,
				...(selected.owner.instanceId === undefined
					? {}
					: { instanceId: selected.owner.instanceId }),
				version: selected.version,
			})

	return immutableRecord({
		compile: readSchemaCompilerImplementation(declaration),
		provenance: immutableRecord({
			capabilityId: schemaCompilerCapability.capabilityId,
			capabilityVersion: schemaCompilerCapability.version,
			contributionId: declaration.contributionId,
			normalizedStaticOptions: descriptor.staticOptions,
			owner,
			protocolVersion: descriptor.protocolVersion,
			...('target' in declaration ? { target: declaration.target } : {}),
		}),
	})
}
