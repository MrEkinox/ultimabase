import path from 'node:path'

export interface Workspace {
	readonly name: string
	readonly directory: string
}
export interface PackageSelection extends Workspace {
	readonly files: readonly string[]
	readonly browser: boolean
}
export interface CiPlan {
	readonly full: boolean
	readonly changed: readonly string[]
	readonly packages: readonly PackageSelection[]
	readonly transversal: readonly string[]
	readonly build: boolean
	readonly coverage: boolean
	readonly tooling: boolean
	readonly documentation: boolean
	readonly issues: boolean
	readonly website: boolean
	readonly workspaceLint: readonly string[]
}
export interface SelectionInput {
	readonly workspaces: readonly Workspace[]
	readonly files: ReadonlyMap<string, string>
	readonly changed: readonly string[]
	readonly affected: readonly string[]
	readonly full?: boolean
}

export const isDocumentation = (file: string): boolean =>
	/\.(?:md|mdx)$/u.test(file) || file.startsWith('apps/website/content/')

const isSuite = (file: string): boolean => /\.test(?:-d)?\.ts$/u.test(file)
const owner = (file: string, workspaces: readonly Workspace[]) =>
	workspaces.find(({ directory }) => file.startsWith(`${directory}/`))

/** Runtime dependants propagate transitively; test-only consumers do not create product cycles. */
export const selectCi = (input: SelectionInput): CiPlan => {
	const { workspaces, files, changed } = input
	const globalChange = changed.some(
		(file) =>
			!isDocumentation(file) &&
			!file.startsWith('apps/website/') &&
			(owner(file, workspaces) === undefined
				? !(
						isSuite(file) &&
						files.has(file) &&
						(file.startsWith('tests/e2e/') ||
							file.startsWith('tests/performance/'))
					)
				: file.endsWith('/package.json') ||
					(isSuite(file) && !files.has(file))),
	)
	const full = input.full === true || globalChange
	// Yarn owns workspace discovery and transitive dependant selection.
	const affected = new Set(
		full ? workspaces.map(({ name }) => name) : input.affected,
	)

	const knownNames = new Set(workspaces.map(({ name }) => name))
	const directInputs = new Map<
		string,
		{ packages: Set<string>; files: Set<string> }
	>()
	const inputsOf = (file: string) => {
		const cached = directInputs.get(file)
		if (cached !== undefined) return cached
		const source = files.get(file) ?? ''
		// Include package names in generated source strings as well as ordinary imports.
		const packages = new Set(
			[...source.matchAll(/@ultimabase\/[a-z0-9-]+/gu)]
				.map(([name]) => name)
				.filter((name) => knownNames.has(name)),
		)
		const dependencies = new Set<string>()
		// Subprocess and language-service fixtures are often quoted paths, not imports.
		for (const match of source.matchAll(
			/['"]((?:\.{1,2}\/|fixtures\/|packages\/|tests\/|examples\/)[^'"\n]+)['"]/gu,
		)) {
			const specifier = match[1]
			if (specifier === undefined) continue
			const target = /^(?:packages|tests|examples)\//u.test(specifier)
				? specifier
				: path.posix.normalize(
						path.posix.join(path.posix.dirname(file), specifier),
					)
			const targetOwner = owner(target, workspaces)
			if (targetOwner !== undefined && targetOwner !== owner(file, workspaces))
				packages.add(targetOwner.name)
			for (const candidate of [
				target,
				target.replace(/\.js$/u, '.ts'),
				target.replace(/\.js$/u, '.tsx'),
				`${target}.ts`,
				`${target}/index.ts`,
			]) {
				if (files.has(candidate)) {
					dependencies.add(candidate)
					break
				}
			}
		}
		const result = { packages, files: dependencies }
		directInputs.set(file, result)
		return result
	}
	const affectedSuite = (suite: string): boolean => {
		if (
			full ||
			changed.includes(suite) ||
			affected.has(owner(suite, workspaces)?.name ?? '')
		)
			return true
		// These suites enumerate archives or execute generated applications: imports alone are insufficient.
		if (
			affected.size > 0 &&
			(suite === 'tests/e2e/package-archives.e2e.test.ts' ||
				suite.startsWith('packages/create-app/tests/e2e/'))
		)
			return true
		const pending = [suite]
		const visited = new Set<string>()
		while (pending.length > 0) {
			const file = pending.pop()
			if (file === undefined || visited.has(file)) continue
			visited.add(file)
			if (changed.includes(file)) return true
			const dependencies = inputsOf(file)
			if ([...dependencies.packages].some((name) => affected.has(name)))
				return true
			pending.push(...dependencies.files)
		}
		return false
	}
	const selected = [...files.keys()]
		.filter((file) => isSuite(file) && affectedSuite(file))
		.sort()
	const packages = workspaces
		.flatMap((workspace) => {
			const local = selected.filter((file) =>
				file.startsWith(`${workspace.directory}/`),
			)
			const browser = local.some((file) =>
				(files.get(file) ?? '').includes('playwright'),
			)
			return affected.has(workspace.name) || local.length > 0
				? [{ ...workspace, files: local, browser }]
				: []
		})
		.sort((left, right) => left.name.localeCompare(right.name))
	const transversal = selected.filter(
		(file) =>
			file.startsWith('tests/e2e/') || file.startsWith('tests/performance/'),
	)
	const workspaceLint = changed.filter(
		(file) =>
			files.has(file) &&
			/\.(?:ts|tsx|mjs|js)$/u.test(file) &&
			!file.startsWith('packages/') &&
			!file.startsWith('apps/website/'),
	)
	return {
		full,
		changed,
		packages,
		transversal,
		build:
			packages.length > 0 || transversal.length > 0 || workspaceLint.length > 0,
		// A partial suite cannot be compared to the complete production coverage denominator.
		coverage: full,
		tooling: full || changed.some((file) => file.startsWith('tooling/')),
		documentation:
			full ||
			changed.some(
				(file) =>
					isDocumentation(file) ||
					file.startsWith('packages/') ||
					file.startsWith('apps/website/'),
			),
		issues: full || changed.some((file) => file.startsWith('issues/')),
		website:
			full ||
			changed.some(
				(file) => file.startsWith('apps/website/') && !isDocumentation(file),
			),
		workspaceLint,
	}
}
