// Checks the production line budget of every package (D-69).
// Production code is every `.ts` file under `packages/<name>/src`, except tests.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const budgetFile = 'line-budgets.json'

const isTestPath = (path: string): boolean =>
	/\.test(-d)?\.ts$/.test(path) || /(^|\/)test\//.test(path)

const listSources = (directory: string, prefix = ''): string[] =>
	readdirSync(directory).flatMap((entry) => {
		const path = join(directory, entry)
		const relative = prefix === '' ? entry : `${prefix}/${entry}`
		if (statSync(path).isDirectory()) return listSources(path, relative)
		return relative.endsWith('.ts') && !isTestPath(relative) ? [relative] : []
	})

export const countLines = (source: string): number =>
	source === '' ? 0 : source.replace(/\n$/, '').split('\n').length

const readBudgets = (root: string): Map<string, number> => {
	const parsed: unknown = JSON.parse(
		readFileSync(join(root, budgetFile), 'utf8'),
	)
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new TypeError(
			`${budgetFile} must be an object of package names to line counts`,
		)
	}
	const budgets = new Map<string, number>()
	for (const [name, budget] of Object.entries(parsed)) {
		if (
			!Number.isInteger(budget) ||
			typeof budget !== 'number' ||
			budget <= 0
		) {
			throw new TypeError(
				`${budgetFile}: the budget of "${name}" must be a positive integer`,
			)
		}
		budgets.set(name, budget)
	}
	return budgets
}

const listPackages = (root: string): string[] => {
	const directory = join(root, 'packages')
	try {
		return readdirSync(directory).filter((entry) =>
			statSync(join(directory, entry)).isDirectory(),
		)
	} catch {
		return []
	}
}

/** Returns one message per violation; an empty list means every budget holds. */
export const checkBudgets = (root: string): string[] => {
	const budgets = readBudgets(root)
	const packages = listPackages(root)
	const problems: string[] = []
	for (const name of packages) {
		const budget = budgets.get(name)
		if (budget === undefined) {
			problems.push(`packages/${name} has no budget in ${budgetFile}`)
			continue
		}
		const sourceDirectory = join(root, 'packages', name, 'src')
		let sources: string[] = []
		try {
			sources = listSources(sourceDirectory)
		} catch {
			sources = []
		}
		const lines = sources.reduce(
			(total, path) =>
				total + countLines(readFileSync(join(sourceDirectory, path), 'utf8')),
			0,
		)
		if (lines > budget)
			problems.push(`packages/${name}: ${lines} lines, budget ${budget}`)
	}
	for (const name of budgets.keys()) {
		if (!packages.includes(name))
			problems.push(`${budgetFile} lists "${name}", which has no package`)
	}
	return problems
}

if (import.meta.main) {
	const problems = checkBudgets(process.cwd())
	for (const problem of problems) console.error(problem)
	if (problems.length > 0) process.exitCode = 1
	else console.log('Every package is within its line budget.')
}
