import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const indexPath = path.join(repositoryRoot, 'docs/current-architecture.md')
const adrCatalogPath = path.join(repositoryRoot, 'docs/adr/README.md')
const tableStart = '<!-- current-architecture:start -->'
const tableEnd = '<!-- current-architecture:end -->'
const linkPattern = /\[[^\]]+\]\(([^)]+)\)/gu

const expectedConcepts = [
	'Repository and package direction',
	'Public API and export control',
	'Application ownership and lifecycle',
	'Plugin installation, identity, and order',
	'Plugin privileges and environmental claims',
	'Capabilities, resources, and lifecycle',
	'Plugin declarations and contributions',
	'Commands and transport bindings',
	'Schemas, immutable models, and specialization',
	'Query and logical operations',
	'Runtime pipeline and transactions',
	'Hooks, Access, and application validation',
	'Request identity and Master authority',
	'Database adapters and persistence plans',
	'Private storage, synchronization, and migrations',
	'Nested writes',
	'Virtual fields and contextual relations',
	'HTTP, REST, and GraphQL transport boundary',
	'Password authentication and sessions',
	'Typegen and generated declarations',
	'Validation, tests, and CI',
] as const

interface ArchitectureIndexRow {
	readonly concept: string
	readonly contract: string
	readonly owner: string
	readonly decisions: string
}

const readLinks = (value: string): readonly string[] =>
	[...value.matchAll(linkPattern)].map(([, target]) => {
		if (target === undefined) {
			throw new TypeError('Architecture index link has no target')
		}

		return target
	})

const readIndexRows = (contents: string): readonly ArchitectureIndexRow[] => {
	const start = contents.indexOf(tableStart)
	const end = contents.indexOf(tableEnd)

	if (start < 0 || end <= start) {
		throw new TypeError('Current architecture index markers are missing')
	}

	return contents
		.slice(start + tableStart.length, end)
		.split('\n')
		.filter((line) => line.startsWith('| ') && !line.startsWith('| ---'))
		.slice(1)
		.map((line) => {
			const cells = line
				.slice(1, -1)
				.split('|')
				.map((cell) => cell.trim())

			if (cells.length !== 4) {
				throw new TypeError(`Invalid architecture index row: ${line}`)
			}

			const [concept, contract, owner, decisions] = cells
			if (
				concept === undefined ||
				contract === undefined ||
				owner === undefined ||
				decisions === undefined
			) {
				throw new TypeError(`Incomplete architecture index row: ${line}`)
			}

			return { concept, contract, owner, decisions }
		})
}

const resolveDocumentationTarget = (
	sourceFile: string,
	target: string,
): string => {
	const fragmentIndex = target.indexOf('#')
	const targetPath = fragmentIndex < 0 ? target : target.slice(0, fragmentIndex)

	return path.resolve(path.dirname(sourceFile), targetPath)
}

const readAdrStatus = async (file: string): Promise<string> => {
	const contents = await readFile(file, 'utf8')
	const status = /^- Status: (.+)$/mu.exec(contents)?.[1]

	if (status === undefined) {
		throw new TypeError(`ADR has no status: ${file}`)
	}

	return status
}

const readCatalogTargets = (
	contents: string,
	start: string,
	end?: string,
): readonly string[] => {
	const startIndex = contents.indexOf(start)
	const endIndex = end === undefined ? contents.length : contents.indexOf(end)

	if (startIndex < 0 || endIndex <= startIndex) {
		throw new TypeError(`ADR catalog section is missing: ${start}`)
	}

	return readLinks(contents.slice(startIndex + start.length, endIndex))
}

describe('current architecture documentation', () => {
	it('indexes every maintained architectural concept with valid targets', async () => {
		const contents = await readFile(indexPath, 'utf8')
		const rows = readIndexRows(contents)

		expect(rows.map(({ concept }) => concept)).toStrictEqual(expectedConcepts)

		for (const row of rows) {
			const contracts = readLinks(row.contract)
			const owners = readLinks(row.owner)
			const decisions = readLinks(row.decisions)

			expect(contracts.length).toBeGreaterThan(0)
			expect(owners.length).toBeGreaterThan(0)
			expect(decisions.length).toBeGreaterThan(0)

			for (const target of [...contracts, ...owners, ...decisions]) {
				expect(target).not.toMatch(/^(?:https?:|#)/u)
				await expect(
					stat(resolveDocumentationTarget(indexPath, target)),
				).resolves.toBeDefined()
			}
		}
	})

	it('references only accepted decisions as current architecture', async () => {
		const rows = readIndexRows(await readFile(indexPath, 'utf8'))
		const decisions = new Set(
			rows.flatMap(({ decisions: cell }) => readLinks(cell)),
		)

		for (const target of decisions) {
			expect(target).toMatch(/^adr\/\d{4}-[^/]+\.md$/u)
			expect(
				await readAdrStatus(resolveDocumentationTarget(indexPath, target)),
			).toBe('accepted')
		}
	})

	it('keeps the ADR catalog aligned with record statuses', async () => {
		const catalog = await readFile(adrCatalogPath, 'utf8')
		const currentTargets = readCatalogTargets(
			catalog,
			'Current records (accepted or still active in part):',
			'Superseded records:',
		)
		const supersededTargets = readCatalogTargets(catalog, 'Superseded records:')

		for (const target of currentTargets) {
			expect(
				await readAdrStatus(path.resolve(path.dirname(adrCatalogPath), target)),
			).toMatch(/^(?:accepted|partially superseded)/u)
		}

		for (const target of supersededTargets) {
			expect(
				await readAdrStatus(path.resolve(path.dirname(adrCatalogPath), target)),
			).toMatch(/^superseded/u)
		}
	})
})
