import { spawnSync } from 'node:child_process'
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

interface PackageExport {
	import: string
	types: string
}

interface PublishablePackage {
	exports: {
		'.': PackageExport
	}
	name: string
}

// JSON.parse returns an unsafe type, so repository metadata is narrowed from unknown.
const readJsonObject = async (
	filePath: string,
): Promise<Record<string, unknown>> => {
	const value: unknown = JSON.parse(await readFile(filePath, 'utf8'))

	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${filePath} must contain a JSON object`)
	}

	return value as Record<string, unknown>
}

const readProjectReferences = async (
	tsconfigPath: string,
): Promise<string[]> => {
	const config = await readJsonObject(tsconfigPath)

	if (!Array.isArray(config.references)) {
		throw new TypeError(`${tsconfigPath}.references must be an array`)
	}

	return config.references.map((reference: unknown, index: number): string => {
		if (
			typeof reference !== 'object' ||
			reference === null ||
			!('path' in reference) ||
			typeof reference.path !== 'string'
		) {
			throw new TypeError(
				`${tsconfigPath}.references[${String(index)}].path must be a string`,
			)
		}

		return reference.path
	})
}

const readPublishablePackage = async (
	packageJsonPath: string,
): Promise<PublishablePackage> => {
	const manifest = await readJsonObject(packageJsonPath)

	if (
		typeof manifest.name !== 'string' ||
		!manifest.name.startsWith('@ultimabase/')
	) {
		throw new TypeError(
			`${packageJsonPath}.name must use the @ultimabase scope`,
		)
	}

	const packageExports: unknown = manifest.exports
	if (
		typeof packageExports !== 'object' ||
		packageExports === null ||
		!('.' in packageExports) ||
		typeof packageExports['.'] !== 'object' ||
		packageExports['.'] === null
	) {
		throw new TypeError(`${packageJsonPath}.exports["."] must be an object`)
	}

	const rootExport = packageExports['.']
	if (
		!('import' in rootExport) ||
		typeof rootExport.import !== 'string' ||
		!('types' in rootExport) ||
		typeof rootExport.types !== 'string'
	) {
		throw new TypeError(
			`${packageJsonPath}.exports["."] must declare string import and types targets`,
		)
	}

	return {
		exports: {
			'.': {
				import: rootExport.import,
				types: rootExport.types,
			},
		},
		name: manifest.name,
	}
}

// The consumer lives outside the monorepo so workspace resolution cannot mask packaging errors.
const repositoryRoot = process.cwd()
const temporaryRoot = await mkdtemp(
	path.join(tmpdir(), 'ultimabase-packed-packages-'),
)

const run = (
	command: string,
	arguments_: string[],
	options: { cwd?: string } = {},
): void => {
	const result = spawnSync(command, arguments_, {
		encoding: 'utf8',
		...options,
	})

	if (result.status !== 0) {
		throw new Error(
			[
				`Command failed: ${command} ${arguments_.join(' ')}`,
				result.stdout,
				result.stderr,
			]
				.filter(Boolean)
				.join('\n'),
		)
	}
}

try {
	const projectPaths = await readProjectReferences(
		path.join(repositoryRoot, 'tsconfig.json'),
	)
	const consumerDirectory = path.join(temporaryRoot, 'consumer')
	const consumerNodeModules = path.join(consumerDirectory, 'node_modules')
	const consumerScope = path.join(consumerNodeModules, '@ultimabase')

	await mkdir(consumerScope, { recursive: true })
	await writeFile(
		path.join(consumerDirectory, 'package.json'),
		JSON.stringify({ private: true, type: 'module' }),
	)

	// Reuse installed third-party dependencies while keeping UltimaBase packages isolated.
	for (const entry of await readdir(
		path.join(repositoryRoot, 'node_modules'),
	)) {
		if (entry === '@ultimabase' || entry === '.bin') {
			continue
		}

		await symlink(
			path.join(repositoryRoot, 'node_modules', entry),
			path.join(consumerNodeModules, entry),
		)
	}

	const packageNames: string[] = []

	for (const projectPath of projectPaths) {
		const packageDirectory = path.resolve(repositoryRoot, projectPath)
		const packageJson = await readPublishablePackage(
			path.join(packageDirectory, 'package.json'),
		)
		const unscopedName = packageJson.name.slice('@ultimabase/'.length)
		const archivePath = path.join(temporaryRoot, `${unscopedName}.tgz`)
		const extractedPackage = path.join(consumerScope, unscopedName)

		await access(path.join(packageDirectory, packageJson.exports['.'].import))
		await access(path.join(packageDirectory, packageJson.exports['.'].types))

		// Test the archive users receive, not the source workspace.
		run('corepack', ['yarn', 'pack', '--out', archivePath], {
			cwd: packageDirectory,
		})
		await mkdir(extractedPackage)
		run(
			'tar',
			['-xzf', archivePath, '--strip-components=1', '-C', extractedPackage],
			{ cwd: repositoryRoot },
		)

		const packedPackageJson = await readPublishablePackage(
			path.join(extractedPackage, 'package.json'),
		)
		await access(
			path.join(extractedPackage, packedPackageJson.exports['.'].import),
		)
		await access(
			path.join(extractedPackage, packedPackageJson.exports['.'].types),
		)
		packageNames.push(packageJson.name)
	}

	await writeFile(
		path.join(consumerDirectory, 'index.mjs'),
		`${packageNames
			.map((packageName: string): string => `await import('${packageName}')`)
			.join('\n')}\n`,
	)
	// Node resolves every package through the packed manifest's ESM export map.
	run(process.execPath, ['index.mjs'], { cwd: consumerDirectory })

	console.log(
		`Imported ${String(packageNames.length)} packed packages from a temporary ESM consumer.`,
	)
} finally {
	// Cleanup is restricted to the unique directory created by mkdtemp above.
	await rm(temporaryRoot, { force: true, recursive: true })
}
