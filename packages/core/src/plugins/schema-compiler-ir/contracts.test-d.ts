import { expectTypeOf, test } from 'vitest'

import {
	isSchemaCompilerArtifactReference,
	schemaCompilerProtocolVersion,
	type SchemaCompilerArtifactReference,
	type SchemaCompilerInput,
	type SchemaCompilerOptionNode,
	type SchemaCompilerOutput,
	type SchemaCompilerSchemaAdditionNode,
} from '../../index.js'

test('exports one nominal versioned compiler IR contract', () => {
	expectTypeOf(schemaCompilerProtocolVersion).toEqualTypeOf<'3.0.0'>()
	expectTypeOf<
		SchemaCompilerInput['protocolVersion']
	>().toEqualTypeOf<'3.0.0'>()
	expectTypeOf<
		SchemaCompilerOutput['protocolVersion']
	>().toEqualTypeOf<'3.0.0'>()
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
