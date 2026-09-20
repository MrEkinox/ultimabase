import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import * as ts from 'typescript'

interface SourceMeasurement {
	readonly files: number
	readonly lines: number
}

interface PackageMeasurement extends SourceMeasurement {
	readonly declarationBytes: number
	readonly packageName: string
	readonly publicExports: number
}

const workspaceRoot = process.cwd()
const packagesRoot = path.join(workspaceRoot, 'packages')

const walkFiles = (directory: string): readonly string[] => {
	if (!fs.existsSync(directory)) return []

	return fs
		.readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const absolutePath = path.join(directory, entry.name)
			return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath]
		})
		.sort()
}

const isTypeScript = (filePath: string): boolean =>
	filePath.endsWith('.ts') && !filePath.endsWith('.tsbuildinfo')

const isGenerated = (filePath: string): boolean =>
	filePath.endsWith('.generated.ts') || filePath.endsWith('.generated.d.ts')

const isTest = (filePath: string): boolean => {
	const normalized = filePath.split(path.sep).join('/')
	return (
		normalized.includes('/tests/') ||
		/\.(?:e2e\.|performance\.|spec\.|test\.|test-d\.)?test\.ts$/.test(
			normalized,
		) ||
		normalized.endsWith('.test-d.ts') ||
		normalized.endsWith('.test.ts')
	)
}

const countLines = (filePath: string): number => {
	const contents = fs.readFileSync(filePath, 'utf8')
	if (contents.length === 0) return 0
	const lines = contents.split(/\r?\n/)
	return lines.at(-1) === '' ? lines.length - 1 : lines.length
}

const measureFiles = (files: readonly string[]): SourceMeasurement =>
	Object.freeze({
		files: files.length,
		lines: files.reduce((total, filePath) => total + countLines(filePath), 0),
	})

const packageDirectories = fs
	.readdirSync(packagesRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => path.join(packagesRoot, entry.name))
	.filter((directory) => fs.existsSync(path.join(directory, 'package.json')))
	.sort()

const declarationEntries = packageDirectories
	.map((directory) => path.join(directory, 'dist', 'index.d.ts'))
	.filter((filePath) => fs.existsSync(filePath))

if (declarationEntries.length !== packageDirectories.length) {
	throw new Error(
		'Every package must be built before measuring public exports. Run yarn build first.',
	)
}

const declarationProgram = ts.createProgram(declarationEntries, {
	module: ts.ModuleKind.NodeNext,
	moduleResolution: ts.ModuleResolutionKind.NodeNext,
	skipLibCheck: true,
})
const declarationChecker = declarationProgram.getTypeChecker()

const countPublicExports = (filePath: string): number => {
	const sourceFile = declarationProgram.getSourceFile(filePath)
	if (sourceFile === undefined) {
		throw new Error(
			`Missing declaration entry in TypeScript program: ${filePath}`,
		)
	}
	const moduleSymbol = declarationChecker.getSymbolAtLocation(sourceFile)
	if (moduleSymbol === undefined) {
		throw new Error(`Missing declaration module symbol: ${filePath}`)
	}
	return declarationChecker.getExportsOfModule(moduleSymbol).length
}

const packageMeasurements: readonly PackageMeasurement[] =
	packageDirectories.map((directory) => {
		const packageJsonPath = path.join(directory, 'package.json')
		const packageJson = JSON.parse(
			fs.readFileSync(packageJsonPath, 'utf8'),
		) as {
			readonly name?: unknown
		}
		if (typeof packageJson.name !== 'string') {
			throw new TypeError(`Package name is missing: ${packageJsonPath}`)
		}
		const sourceFiles = walkFiles(path.join(directory, 'src')).filter(
			(filePath) =>
				isTypeScript(filePath) && !isGenerated(filePath) && !isTest(filePath),
		)
		const measurement = measureFiles(sourceFiles)
		return Object.freeze({
			packageName: packageJson.name,
			...measurement,
			declarationBytes: fs.statSync(path.join(directory, 'dist', 'index.d.ts'))
				.size,
			publicExports: countPublicExports(
				path.join(directory, 'dist', 'index.d.ts'),
			),
		})
	})

const repositoryTypeScriptFiles = walkFiles(workspaceRoot).filter(
	(filePath) =>
		isTypeScript(filePath) &&
		!isGenerated(filePath) &&
		!filePath.includes(`${path.sep}node_modules${path.sep}`) &&
		!filePath.includes(`${path.sep}dist${path.sep}`) &&
		!filePath.includes(`${path.sep}.yarn${path.sep}`),
)
const testFiles = repositoryTypeScriptFiles.filter(isTest)
const toolingFiles = walkFiles(path.join(workspaceRoot, 'tooling')).filter(
	(filePath) =>
		isTypeScript(filePath) && !isGenerated(filePath) && !isTest(filePath),
)

const production = packageMeasurements.reduce<SourceMeasurement>(
	(total, measurement) => ({
		files: total.files + measurement.files,
		lines: total.lines + measurement.lines,
	}),
	{ files: 0, lines: 0 },
)
const core = packageMeasurements.find(
	(measurement) => measurement.packageName === '@ultimabase/core',
)
if (core === undefined) throw new Error('Core package measurement is missing')

const productionFiles = packageDirectories.flatMap((directory) =>
	walkFiles(path.join(directory, 'src')).filter(
		(filePath) =>
			isTypeScript(filePath) && !isGenerated(filePath) && !isTest(filePath),
	),
)
const productionContents = productionFiles
	.map((filePath) => fs.readFileSync(filePath, 'utf8'))
	.join('\n')
const countMatches = (expression: RegExp): number =>
	productionContents.match(expression)?.length ?? 0

const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
	cwd: workspaceRoot,
	encoding: 'utf8',
}).trim()

const report = Object.freeze({
	revision,
	definitions: Object.freeze({
		lines: 'physical UTF-8 lines excluding the final empty line',
		production: 'non-generated, non-test TypeScript under packages/*/src',
		tests:
			'TypeScript test modules and TypeScript support below a tests directory',
		tooling: 'non-generated, non-test TypeScript under tooling',
		publicExports:
			'TypeScript module exports resolved from each built dist/index.d.ts',
	}),
	totals: Object.freeze({
		production,
		core: Object.freeze({
			files: core.files,
			lines: core.lines,
			sharePercent: Number(((core.lines / production.lines) * 100).toFixed(2)),
		}),
		tests: measureFiles(testFiles),
		tooling: measureFiles(toolingFiles),
		publicExports: packageMeasurements.reduce(
			(total, measurement) => total + measurement.publicExports,
			0,
		),
		declarationBytes: packageMeasurements.reduce(
			(total, measurement) => total + measurement.declarationBytes,
			0,
		),
	}),
	kernelSyntax: Object.freeze({
		defineCapabilityCalls: countMatches(/\bdefineCapability\s*(?:<|\()/g),
		defineAdapterContributionCapabilityCalls: countMatches(
			/\bdefineAdapterContributionCapability\s*(?:<|\()/g,
		),
		defineAdapterRawCapabilityCalls: countMatches(
			/\bdefineAdapterRawCapability\s*(?:<|\()/g,
		),
		decorateCapabilityCalls: countMatches(/\bdecorateCapability\s*\(/g),
		replaceCapabilityCalls: countMatches(/\breplaceCapability\s*\(/g),
		defineQueryExtensionCalls: countMatches(/\bdefineQueryExtension\s*\(/g),
	}),
	packages: packageMeasurements,
})

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
