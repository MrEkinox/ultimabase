#!/usr/bin/env node
// Editor-visible (DX) comparison between a baseline and a candidate checkout.
// Usage: node tooling/dx-audit/run.mjs <baselineRoot> <candidateRoot> [--out dir] [--only a,b]
// Both roots must be built (`yarn build`). Nothing is written inside the
// audited roots except the report directory (default:
// <candidateRoot>/node_modules/.cache/dx-audit). See tooling/dx-audit/README.md.
import process from 'node:process'
import path from 'node:path'

import ts from 'typescript'

import {
	collectDeclarations,
	findRenames,
	listPackages,
} from './declarations.mjs'
import { collectExportHovers, listExports } from './exports.mjs'
import { createRootContext } from './language-service.mjs'
import { writeReport } from './report.mjs'
import {
	collectExampleSites,
	collectFixtureSites,
	collectTypeTestSites,
	groupOf,
	listExamples,
	listFixtureFiles,
	listTypeTests,
} from './usage-sites.mjs'

const parseArguments = (argv) => {
	const positional = []
	const options = new Map()

	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index].startsWith('--')) {
			options.set(argv[index].slice(2), argv[index + 1])
			index += 1
		} else {
			positional.push(argv[index])
		}
	}
	if (
		positional.length !== 2 ||
		[...options.keys()].some((key) => !['only', 'out'].includes(key))
	) {
		throw new Error(
			'Usage: node tooling/dx-audit/run.mjs <baselineRoot> <candidateRoot> [--out dir] [--only a,b]',
		)
	}
	return {
		only: options.get('only')?.split(',') ?? null,
		out: path.resolve(
			options.get('out') ??
				path.join(positional[1], 'node_modules/.cache/dx-audit'),
		),
		roots: positional.map((root) => path.resolve(root)),
	}
}

const log = (message) => process.stderr.write(`[dx-audit] ${message}\n`)
const union = (...lists) => [...new Set(lists.flat())].sort()

const main = () => {
	const { only, out, roots } = parseArguments(process.argv.slice(2))
	const contexts = roots.map(createRootContext)
	const selected = (group) => only === null || only.includes(group)
	const packagesPerRoot = contexts.map((context) =>
		listPackages(context.root).filter((packageInfo) =>
			selected(packageInfo.directory),
		),
	)
	const records = [[], []]

	log('(a) declaration files')
	contexts.forEach((context, side) => {
		for (const packageInfo of packagesPerRoot[side]) {
			for (const record of collectDeclarations(context.root, packageInfo)) {
				records[side].push({
					...record,
					group: packageInfo.directory,
					section: 'declarations',
				})
			}
		}
	})

	log('(b) exports and member hovers')
	const exportLists = contexts.map((context, side) =>
		listExports(context, packagesPerRoot[side]),
	)
	const unionNames = new Map(
		union(...exportLists.map((lists) => [...lists.keys()])).map((entry) => [
			entry,
			union(
				...exportLists.map((lists) => [...(lists.get(entry)?.keys() ?? [])]),
			),
		]),
	)

	contexts.forEach((context, side) => {
		for (const packageInfo of packagesPerRoot[side]) {
			for (const { subpath } of packageInfo.entries) {
				const names =
					exportLists[side].get(`${packageInfo.directory}${subpath}`) ??
					new Map()

				for (const [name, meaning] of names) {
					records[side].push({
						group: packageInfo.directory,
						key: subpath === '.' ? name : `${subpath} ${name}`,
						section: 'exports',
						value: meaning,
					})
				}
			}
		}
		records[side].push(
			...collectExportHovers(context, packagesPerRoot[side], unionNames),
		)
	})

	log('(c) usage sites')
	const fixtureFiles = union(
		...contexts.map((context) => listFixtureFiles(context.root)),
	).filter((file) => selected(groupOf(file)))
	const typeTests = union(
		...contexts.map((context) => listTypeTests(context.root)),
	).filter((file) => selected(groupOf(file)))
	const examples = union(
		...contexts.map((context) => listExamples(context.root)),
	).filter(selected)
	const partial = []

	contexts.forEach((context, side) => {
		log(`  ${context.root}: ${fixtureFiles.length} fixture files`)
		const fixtures = collectFixtureSites(context, fixtureFiles)

		records[side].push(...fixtures.records)
		if (side === 1) partial.push(...fixtures.partial)
		log(`  ${context.root}: ${typeTests.length} type tests`)
		records[side].push(...collectTypeTestSites(context, typeTests))
		log(`  ${context.root}: ${examples.length} examples`)
		records[side].push(...collectExampleSites(context, examples))
	})

	const summary = writeReport({
		out,
		partial,
		records,
		renames: findRenames,
		roots: contexts.map((context) => context.root),
		typescript: ts.version,
	})

	log(summary)
}

main()
