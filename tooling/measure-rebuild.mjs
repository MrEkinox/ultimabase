#!/usr/bin/env node
// Reproducible size measurement shared by the reference and the reconstruction.
// Usage: node tooling/measure-rebuild.mjs [repositoryRoot] [--json]
// Only Git-tracked files are counted, so build outputs and node_modules never
// influence the result. Lines are physical non-blank lines.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const root = path.resolve(args.find((arg) => !arg.startsWith('--')) ?? '.')
const asJson = args.includes('--json')

const files = execFileSync('git', ['ls-files', '-z'], { cwd: root })
	.toString('utf8')
	.split('\0')
	.filter(Boolean)

const code = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/
const isGenerated = (file) =>
	/\.generated\.(?:d\.)?ts$/.test(file) || file.includes('/.ultimabase/')
const isTest = (file) =>
	/\.(?:test|test-d|spec)\.tsx?$/.test(file) ||
	/(?:^|\/)tests?\//.test(file) ||
	/(?:^|\/)fixtures?\//.test(file)

const classify = (file) => {
	if (!code.test(file) && !file.endsWith('.json') && !file.endsWith('.yml')) {
		return /\.mdx?$/.test(file) ? 'documentation' : 'other'
	}
	if (isGenerated(file)) return 'generated'
	if (file.startsWith('apps/website/')) return 'website'
	if (file.startsWith('examples/')) return isTest(file) ? 'tests' : 'examples'
	if (isTest(file)) return 'tests'
	if (/^packages\/[^/]+\/src\//.test(file) && code.test(file)) {
		return 'production'
	}
	if (/^packages\/[^/]+\/(?:templates|examples)\//.test(file)) return 'production'
	return 'configuration-and-tooling'
}

const countLines = (file) => {
	const contents = fs.readFileSync(path.join(root, file), 'utf8')
	return contents.split(/\r?\n/).filter((line) => line.trim() !== '').length
}

const totals = {}
const productionByPackage = {}
for (const file of files) {
	if (!fs.existsSync(path.join(root, file))) continue
	const category = classify(file)
	if (category === 'other') continue
	const lines = countLines(file)
	totals[category] ??= { files: 0, lines: 0 }
	totals[category].files += 1
	totals[category].lines += lines
	if (category === 'production') {
		const name = file.split('/')[1]
		productionByPackage[name] = (productionByPackage[name] ?? 0) + lines
	}
}

// Third-party dependencies declared by every tracked manifest.
const dependencies = { runtime: new Set(), development: new Set() }
for (const file of files.filter((file) => file.endsWith('package.json'))) {
	const manifest = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
	const external = (record) =>
		Object.keys(record ?? {}).filter((name) => !name.startsWith('@ultimabase/'))
	for (const name of [
		...external(manifest.dependencies),
		...external(manifest.peerDependencies),
	]) {
		dependencies.runtime.add(name)
	}
	for (const name of external(manifest.devDependencies)) {
		dependencies.development.add(name)
	}
}
const publishedRuntime = new Set()
for (const file of files.filter((file) =>
	/^packages\/[^/]+\/package\.json$/.test(file),
)) {
	const manifest = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
	for (const name of Object.keys({
		...manifest.dependencies,
		...manifest.peerDependencies,
	})) {
		if (!name.startsWith('@ultimabase/')) publishedRuntime.add(name)
	}
}

const result = {
	root,
	categories: totals,
	productionByPackage: Object.fromEntries(
		Object.entries(productionByPackage).sort(([a], [b]) => a.localeCompare(b)),
	),
	dependencies: {
		publishedPackageRuntime: [...publishedRuntime].sort(),
		allRuntime: dependencies.runtime.size,
		allDevelopment: dependencies.development.size,
	},
}

if (asJson) {
	process.stdout.write(`${JSON.stringify(result, null, '\t')}\n`)
} else {
	console.log(`Measured ${root}`)
	for (const [name, value] of Object.entries(totals).sort()) {
		console.log(
			`${name.padEnd(28)} ${String(value.lines).padStart(8)} lines ${String(value.files).padStart(6)} files`,
		)
	}
	console.log('\nProduction by package:')
	for (const [name, lines] of Object.entries(result.productionByPackage)) {
		console.log(`  ${name.padEnd(26)} ${String(lines).padStart(8)}`)
	}
	console.log(
		`\nPublished runtime dependencies (${publishedRuntime.size}): ${result.dependencies.publishedPackageRuntime.join(', ')}`,
	)
	console.log(
		`All manifests: ${result.dependencies.allRuntime} runtime, ${result.dependencies.allDevelopment} development dependency names`,
	)
}
