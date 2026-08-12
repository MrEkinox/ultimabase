import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const readSource = (path: string): Promise<string> =>
	readFile(new URL(path, import.meta.url), 'utf8')

describe('canonical schema compiler production path', () => {
	it('contains no prepared-schema transform callback or legacy patch bypass', async () => {
		const [application, declarations, registry] = await Promise.all([
			readSource('../../application/framework-application.ts'),
			readSource('../schema-declaration-registry.ts'),
			readSource('../../schema/schema/registry.ts'),
		])

		expect(application).toContain(
			'this.#schemaDeclarations.compileSchemaRegistry(',
		)
		expect(declarations).toContain('compileCanonicalSchemaCompilerIr(')
		expect(declarations).toContain('assertSchemaCompilerOutput(')
		expect(declarations).toContain('decodeSchemaCompilerOutput(')
		expect(declarations).not.toContain('applyPatch(')
		expect(registry).not.toContain('SchemaCompilationTransformer')
		expect(registry).not.toContain('transform:')
	})
})
