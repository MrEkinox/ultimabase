import { expectTypeOf, test } from 'vitest'

import {
	schemaCompilerProtocolVersion,
	type SchemaCompilerArtifactReference,
	type SchemaCompilerInput,
	type SchemaCompilerOptionNode,
	type SchemaCompilerOutput,
	type SchemaCompilerSchemaAdditionNode,
} from './contracts.js'
import { isSchemaCompilerArtifactReference } from './artifacts.js'

test('keeps the internal compiler IR nominal and versioned', () => {
	expectTypeOf(schemaCompilerProtocolVersion).toEqualTypeOf<'7.0.0'>()
	expectTypeOf<
		SchemaCompilerInput['protocolVersion']
	>().toEqualTypeOf<'7.0.0'>()
	expectTypeOf<
		SchemaCompilerOutput['protocolVersion']
	>().toEqualTypeOf<'7.0.0'>()
	expectTypeOf<SchemaCompilerSchemaAdditionNode>().toHaveProperty(
		'contributionId',
	)
	expectTypeOf<SchemaCompilerSchemaAdditionNode>().toHaveProperty(
		'staticOptions',
	)
	expectTypeOf<SchemaCompilerOptionNode['provenance']>().toHaveProperty(
		'definition',
	)
	expectTypeOf<SchemaCompilerOptionNode['provenance']>().toHaveProperty('value')

	const forged = {
		artifactId: 'field:forged',
		artifactKind: 'field' as const,
		kind: 'schema-compiler-artifact' as const,
	}
	// @ts-expect-error -- Artifact references require Core's nominal session provenance.
	const reference: SchemaCompilerArtifactReference<'field'> = forged
	void reference

	if (isSchemaCompilerArtifactReference(forged)) {
		expectTypeOf(forged.kind).toEqualTypeOf<'schema-compiler-artifact'>()
	}
})
