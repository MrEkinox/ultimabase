// Named code regions shared by the website and the package READMEs (ADR-0330).
// A region is the code between `//#region <name>` and `//#endregion <name>`
// lines. Extraction follows Fumadocs MDX `<include>`: nested marker lines are
// dropped and the result is dedented, so a README and a page show the same text.

const startMarker = /^\s*\/\/\s*#?region\b\s*(.*?)\s*$/u
const endMarker = /^\s*\/\/\s*#?endregion\b\s*(.*?)\s*$/u

const dedent = (lines: readonly string[]): string => {
	const indents = lines
		.filter((line) => line.trim() !== '')
		.map((line) => /^\s*/u.exec(line)?.[0].length ?? 0)
	const indent = indents.length === 0 ? 0 : Math.min(...indents)
	return lines.map((line) => line.slice(indent)).join('\n')
}

/** Every region name declared in a source file, in order. */
export const listCodeRegions = (source: string): readonly string[] =>
	source.split('\n').flatMap((line) => {
		const name = startMarker.exec(line)?.[1]
		return name === undefined || name === '' ? [] : [name]
	})

/**
 * Returns the dedented code of one named region, without nested marker lines.
 * Throws when the region is missing or not closed by `//#endregion <name>`.
 */
export const extractCodeRegion = (source: string, name: string): string => {
	const lines = source.split('\n')
	const start = lines.findIndex((line) => startMarker.exec(line)?.[1] === name)
	if (start === -1) throw new TypeError(`Region "${name}" not found`)
	const body: string[] = []
	// An unnamed `//#endregion` closes the innermost open region, as in Fumadocs.
	let depth = 1
	for (const line of lines.slice(start + 1)) {
		if (startMarker.test(line)) {
			depth += 1
			continue
		}
		const end = endMarker.exec(line)?.[1]
		if (end === undefined) {
			body.push(line)
			continue
		}
		if (end === name) return dedent(body)
		if (end === '') depth -= 1
		if (depth === 0) return dedent(body)
	}
	throw new TypeError(`Region "${name}" is not closed by //#endregion ${name}`)
}
