import { expectTypeOf, test } from 'vitest'

import {
	canonicalSchemaCompilerTarget,
	replaceSchemaCompiler,
	schemaCompilerCapability,
	type CapabilityReplacementDeclaration,
	type SchemaCompilerInput,
	type SchemaCompilerOutput,
	type SchemaCompilerProvenance,
} from '../../index.js'

test('exports the exact complete schema compiler replacement protocol', () => {
	const replacement = replaceSchemaCompiler({
		compile: (input) => ({
			protocolVersion: input.protocolVersion,
			selections: [],
			schemas: input.schemas,
		}),
		contributionId: 'fixture-compiler',
		staticOptions: { mode: 'fixture' },
	})

	expectTypeOf(
		schemaCompilerCapability.capabilityId,
	).toEqualTypeOf<'ultimabase.schema-compiler'>()
	expectTypeOf(schemaCompilerCapability.version).toEqualTypeOf<'5.0.0'>()
	expectTypeOf(schemaCompilerCapability.cardinality).toEqualTypeOf<'single'>()
	expectTypeOf(schemaCompilerCapability.lifetime).toEqualTypeOf<'declaration'>()
	expectTypeOf(replacement).toEqualTypeOf<
		CapabilityReplacementDeclaration<typeof schemaCompilerCapability>
	>()
	expectTypeOf(replacement.target).toEqualTypeOf(canonicalSchemaCompilerTarget)
	expectTypeOf<
		Parameters<Parameters<typeof replaceSchemaCompiler>[0]['compile']>[0]
	>().toEqualTypeOf<SchemaCompilerInput>()
	expectTypeOf<
		ReturnType<Parameters<typeof replaceSchemaCompiler>[0]['compile']>
	>().toEqualTypeOf<SchemaCompilerOutput>()
	expectTypeOf<
		SchemaCompilerProvenance['capabilityVersion']
	>().toEqualTypeOf<'5.0.0'>()
})

test('does not expose partial or asynchronous compiler callbacks', () => {
	replaceSchemaCompiler({
		// @ts-expect-error -- One replacement returns the complete output contract.
		compile: () => ({ schemas: [] }),
		contributionId: 'partial',
	})
	replaceSchemaCompiler({
		// @ts-expect-error -- Static compilation is synchronous and infrastructure-free.
		compile: async (input) => {
			await Promise.resolve()
			return {
				protocolVersion: input.protocolVersion,
				selections: [],
				schemas: input.schemas,
			}
		},
		contributionId: 'async',
	})
})
