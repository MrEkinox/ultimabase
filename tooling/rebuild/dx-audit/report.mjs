// Comparison and report writing: JSON for machines, Markdown for humans.
import fs from 'node:fs'
import path from 'node:path'

/** Sections whose differences an editor user can observe directly. */
const editorSections = new Set([
	'exports',
	'export-completions',
	'export-hover',
	'member-hover',
	'usage-completions',
	'usage-diagnostics',
	'usage-hover',
])

const recordKey = (record) =>
	`${record.group}\u0000${record.section}\u0000${record.key}`

const indexRecords = (records) => {
	const index = new Map()

	for (const record of records) {
		const key = recordKey(record)

		if (index.has(key))
			throw new Error(`Duplicate audit key: ${key.replaceAll('\u0000', ' / ')}`)
		index.set(key, record)
	}
	return index
}

/** Compares every collected value; values are compared as exact JSON. */
export const compareRecords = (referenceRecords, rebuildRecords) => {
	const reference = indexRecords(referenceRecords)
	const rebuild = indexRecords(rebuildRecords)
	const differences = []

	for (const key of [
		...new Set([...reference.keys(), ...rebuild.keys()]),
	].sort()) {
		const left = reference.get(key)
		const right = rebuild.get(key)

		if (JSON.stringify(left?.value) !== JSON.stringify(right?.value)) {
			const { group, key: name, section } = right ?? left

			differences.push({
				group,
				key: name,
				location: right?.location ?? left?.location,
				rebuild: right?.value,
				reference: left?.value,
				section,
			})
		}
	}
	return differences
}

const formatHover = (value) =>
	[value.display, value.documentation, ...value.tags]
		.filter((part) => part !== '')
		.join('\n---\n')

const formatValue = (value) => {
	if (value === undefined) return '(absent)'
	if (value === null) return '(none)'
	if (typeof value === 'string') return value
	if (Array.isArray(value)) return value.join('\n')
	if ('display' in value) return formatHover(value)
	if ('hover' in value) {
		return [
			`type: ${value.type}`,
			value.hover === null ? 'hover: (none)' : formatHover(value.hover),
			value.documentation === '' ? '' : `documentation: ${value.documentation}`,
			...value.tags,
		]
			.filter((part) => part !== '')
			.join('\n')
	}
	return JSON.stringify(value, null, 2)
}

// Lists (completion entries, diagnostics) are shown as set differences.
const listChange = (difference) => {
	const left = difference.reference
	const right = difference.rebuild
	const listOf = (value) =>
		Array.isArray(value)
			? value
			: Array.isArray(value?.entries)
				? value.entries
				: undefined
	const leftList = listOf(left)
	const rightList = listOf(right)

	if (leftList === undefined || rightList === undefined) return undefined
	const rightSet = new Set(rightList)
	const leftSet = new Set(leftList)
	const lines = [
		...leftList
			.filter((entry) => !rightSet.has(entry))
			.map((entry) => `- ${entry}`),
		...rightList
			.filter((entry) => !leftSet.has(entry))
			.map((entry) => `+ ${entry}`),
	]

	if (!Array.isArray(left)) {
		for (const flag of ['isMemberCompletion', 'isNewIdentifierLocation']) {
			if (left[flag] !== right[flag])
				lines.push(`${flag}: ${left[flag]} -> ${right[flag]}`)
		}
	}
	return lines.join('\n')
}

const fence = (text) => {
	const ticks = '`'.repeat(
		Math.max(3, ...[...text.matchAll(/`+/g)].map(([run]) => run.length + 1)),
	)

	return `${ticks}text\n${text}\n${ticks}`
}

const markdown = (report) => {
	const lines = [
		'# DX audit',
		'',
		`- reference: \`${report.roots.reference}\``,
		`- rebuild: \`${report.roots.rebuild}\``,
		`- TypeScript ${report.typescript}, ${report.generatedAt}`,
		`- differences: ${report.differences.length} (editor-visible sections: ${report.differences.filter((difference) => editorSections.has(difference.section)).length})`,
		'',
		'## Coverage (reference / rebuild records)',
		'',
		'| group | section | reference | rebuild | differences |',
		'| --- | --- | ---: | ---: | ---: |',
		...report.coverage.map(
			(row) =>
				`| ${row.group} | ${row.section} | ${row.reference} | ${row.rebuild} | ${row.differences} |`,
		),
		'',
		'## Fixture snippets with unresolved substitutions (replaced by empty text)',
		'',
		...report.partialFixtures.map(
			({ label, unresolved }) =>
				`- \`${label}\`: ${unresolved.map((text) => `\`${text}\``).join(', ')}`,
		),
		'',
	]

	for (const [group, differences] of Map.groupBy(
		report.differences,
		(difference) => difference.group,
	)) {
		lines.push(`## ${group}`, '')
		// Identical changes seen at several sites (e.g. every hover of one import) are listed once.
		const sameChange = Map.groupBy(differences, (difference) =>
			JSON.stringify([
				difference.section,
				difference.reference,
				difference.rebuild,
			]),
		)

		for (const occurrences of sameChange.values()) {
			const [difference] = occurrences

			lines.push(
				`### ${difference.section}: \`${difference.key}\`${occurrences.length > 1 ? ` (+${occurrences.length - 1} identical)` : ''}`,
				'',
				...occurrences
					.filter((occurrence) => occurrence.location !== undefined)
					.map(
						(occurrence) =>
							`- \`${occurrence.location}\` \`${occurrence.key}\``,
					),
				'',
				...(difference.note === undefined
					? []
					: [`note: ${difference.note}`, '']),
			)
			const change = listChange(difference)

			if (change === undefined) {
				lines.push(
					'reference:',
					'',
					fence(formatValue(difference.reference)),
					'',
					'rebuild:',
					'',
					fence(formatValue(difference.rebuild)),
					'',
				)
			} else {
				lines.push('change (- reference, + rebuild):', '', fence(change), '')
			}
		}
	}
	return `${lines.join('\n')}\n`
}

const coverageOf = (records, differences) => {
	const rows = new Map()
	const row = (group, section) => {
		const key = `${group}\u0000${section}`

		if (!rows.has(key))
			rows.set(key, {
				differences: 0,
				group,
				rebuild: 0,
				reference: 0,
				section,
			})
		return rows.get(key)
	}

	records[0].forEach(
		(record) => (row(record.group, record.section).reference += 1),
	)
	records[1].forEach(
		(record) => (row(record.group, record.section).rebuild += 1),
	)
	differences.forEach(
		(difference) =>
			(row(difference.group, difference.section).differences += 1),
	)
	return [...rows.values()].sort(
		(left, right) =>
			left.group.localeCompare(right.group) ||
			left.section.localeCompare(right.section),
	)
}

/** Writes report.json and summary.md; returns a one-line summary. */
export const writeReport = ({
	out,
	partial,
	records,
	renames,
	roots,
	typescript,
}) => {
	const differences = compareRecords(records[0], records[1])

	for (const group of new Set(
		differences.map((difference) => difference.group),
	)) {
		renames(
			differences.filter(
				(difference) =>
					difference.group === group && difference.section === 'declarations',
			),
		)
	}
	const report = {
		coverage: coverageOf(records, differences),
		differences,
		generatedAt: new Date().toISOString(),
		partialFixtures: partial,
		roots: { rebuild: roots[1], reference: roots[0] },
		typescript,
	}

	fs.mkdirSync(out, { recursive: true })
	fs.writeFileSync(
		path.join(out, 'report.json'),
		`${JSON.stringify(report, null, '\t')}\n`,
	)
	fs.writeFileSync(path.join(out, 'summary.md'), markdown(report))
	return `${differences.length} differences (${records[0].length} reference / ${records[1].length} rebuild records) -> ${out}`
}
