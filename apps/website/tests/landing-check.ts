import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

/** The repository root, so landing samples resolve the built workspace packages. */
export const repositoryRoot = fileURLToPath(
	new URL('../../..', import.meta.url),
)

/** The strict settings an application author compiles the landing samples with. */
export const landingCompilerOptions: ts.CompilerOptions = {
	allowImportingTsExtensions: true,
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	noEmit: true,
	skipLibCheck: true,
	strict: true,
	target: ts.ScriptTarget.ES2024,
	types: ['node'],
}

/** Runs a check in a disposable directory inside the repository. */
export const withLandingDirectory = async <T>(
	check: (directory: string) => Promise<T>,
): Promise<T> => {
	const directory = await mkdtemp(path.join(repositoryRoot, '.landing-check-'))
	try {
		return await check(directory)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

/** Writes one sample file and returns the compiler program that checks it. */
export const compileLandingSample = async (
	filename: string,
	source: string,
	options: ts.CompilerOptions = {},
): Promise<ts.Program> => {
	await writeFile(filename, source)
	return ts.createProgram([filename], { ...landingCompilerOptions, ...options })
}

/** Formats every diagnostic so a failing sample names the exact excerpt line. */
export const formatLandingDiagnostics = (program: ts.Program): string =>
	ts.formatDiagnosticsWithColorAndContext(ts.getPreEmitDiagnostics(program), {
		getCanonicalFileName: (name) => name,
		getCurrentDirectory: () => repositoryRoot,
		getNewLine: () => '\n',
	})

interface CompiledLandingApplication {
	readonly schemas: { readonly has: (className: string) => boolean }
}

interface CompilableApplication {
	readonly compile: () => CompiledLandingApplication
}

const isCompilableApplication = (
	value: unknown,
): value is CompilableApplication =>
	typeof value === 'object' &&
	value !== null &&
	typeof Reflect.get(value, 'compile') === 'function'

/**
 * Loads a sample module and compiles its exported `app` without starting it,
 * so Core validates the declarations while no infrastructure is opened.
 */
export const compileLandingApplication = async (
	filename: string,
	source: string,
): Promise<CompiledLandingApplication> => {
	await writeFile(filename, source)
	const loaded: unknown = await import(pathToFileURL(filename).href)
	const application: unknown =
		typeof loaded === 'object' && loaded !== null
			? Reflect.get(loaded, 'ultimabase')
			: undefined
	if (!isCompilableApplication(application))
		throw new TypeError(`${filename} must export an UltimaBase application`)
	return application.compile()
}
