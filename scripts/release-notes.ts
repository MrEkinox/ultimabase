// The notes of a version's GitHub release (D-156): the entries its packages'
// changelogs share, each once, after the packages it names, under the
// changelog's headings. Changesets writes one entry in each package a
// changeset names, and an "Updated dependencies" entry in the others.

export type Changelog = { readonly name: string; readonly text: string }

/** The `## <version>` section of a changelog, without its title. */
const sectionOf = (text: string, version: string): string => {
	const lines = text.split('\n')
	const start = lines.indexOf(`## ${version}`)
	if (start === -1) return ''
	const end = lines.findIndex(
		(line, index) => index > start && line.startsWith('## '),
	)
	return lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
}

/** Each `- ` entry of a section, with its indented lines, by heading. */
const entriesOf = (section: string): Array<[string, string]> => {
	const entries: Array<[string, string]> = []
	let heading = ''
	for (const line of section.split('\n')) {
		if (line.startsWith('### ')) heading = line
		else if (line.startsWith('- ')) entries.push([heading, line.slice(2)])
		else if (line.startsWith('  ') && entries.length > 0) {
			const last = entries.length - 1
			const [lastHeading, text] = entries[last] ?? ['', '']
			entries[last] = [lastHeading, `${text}\n${line}`]
		}
	}
	return entries
}

export const releaseNotes = (
	version: string,
	changelogs: readonly Changelog[],
): string => {
	// heading → entry → the packages that list it, in reading order.
	const headings = new Map<string, Map<string, string[]>>()
	for (const { name, text } of changelogs) {
		for (const [heading, entry] of entriesOf(sectionOf(text, version))) {
			if (entry.startsWith('Updated dependencies')) continue
			const entries = headings.get(heading) ?? new Map<string, string[]>()
			headings.set(heading, entries)
			entries.set(entry, [...(entries.get(entry) ?? []), name])
		}
	}
	if (headings.size === 0) {
		throw new Error(`No changelog has an entry for ${version}.`)
	}
	return [...headings]
		.map(([heading, entries]) =>
			[
				heading,
				'',
				...[...entries].map(
					([entry, names]) =>
						`- ${names.map((name) => `\`${name}\``).join(', ')}: ${entry}`,
				),
			].join('\n'),
		)
		.join('\n\n')
		.concat('\n')
}
