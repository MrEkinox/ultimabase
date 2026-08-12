import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const readSource = (path: string): Promise<string> =>
	readFile(new URL(path, import.meta.url), 'utf8')

describe('canonical schema compiler production path', () => {
	it('contains no prepared-schema transform callback or legacy patch bypass', async () => {
		const [application, compilation, declarations, registry, selection] =
			await Promise.all([
				readSource('../../application/framework-application.ts'),
				readSource('../compiled-schema-declarations.ts'),
				readSource('../schema-declaration-registry.ts'),
				readSource('../../schema/schema/registry.ts'),
				readSource('./schema-compiler-selection.ts'),
			])

		expect(application).toContain(
			'this.#schemaDeclarations.compileSchemaRegistry(',
		)
		expect(application).toContain('selectSchemaCompiler(')
		expect(declarations).toContain('compileSchemaDeclarations(')
		expect(compilation).toContain('const output = compile(encoded.input)')
		expect(compilation).toContain('assertSchemaCompilerOutput(')
		expect(compilation).toContain('decodeSchemaCompilerOutput(')
		expect(selection).toContain('readSchemaCompilerImplementation(')
		expect(compilation).not.toContain('compileCanonicalSchemaCompilerIr(')
		expect(compilation).not.toContain('applyPatch(')
		expect(registry).not.toContain('SchemaCompilationTransformer')
		expect(registry).not.toContain('transform:')
	})
})
