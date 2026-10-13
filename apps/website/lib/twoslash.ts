import ts from 'typescript'

/**
 * Compiler options of the documentation snippets flagged `twoslash`
 * (ADR-0330). The site build and `compiled-snippets.content.test.ts` share
 * them, so the content checks fail exactly when the build would. Hidden
 * context before `// ---cut---` may import an example's `.ts` sources,
 * relative to `apps/website` (`'../../examples/<feature>/src/schema.ts'`).
 */
export const twoslashCompilerOptions: ts.CompilerOptions = {
	allowImportingTsExtensions: true,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	noEmit: true,
}
