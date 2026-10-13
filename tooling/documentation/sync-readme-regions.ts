// Rewrites the region blocks of every package and example README from the
// example sources (ADR-0330). `--check` changes nothing and fails when a
// README is out of date: run `yarn docs:regions` to update it.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { listRegionDocuments, renderRegionMarkers } from './readme-regions.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const check = process.argv.includes('--check')
const stale: string[] = []

for (const document of listRegionDocuments(repositoryRoot)) {
	const current = readFileSync(document, 'utf8')
	const rendered = renderRegionMarkers(current, document)
	if (rendered === current) continue
	const relative = path.relative(repositoryRoot, document)
	stale.push(relative)
	if (!check) writeFileSync(document, rendered)
}

if (check && stale.length > 0) {
	console.error(
		`Out of date with their example regions: ${stale.join(', ')}\nRun yarn docs:regions to update them.`,
	)
	process.exitCode = 1
} else {
	console.info(
		check
			? 'README regions are up to date.'
			: `Updated ${String(stale.length)} README file(s).`,
	)
}
