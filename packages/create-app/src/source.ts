/** One named import: [module specifier, comma-separated imported names]. */
export type NamedImport = readonly [source: string, names: string]

/**
 * Renders one import line per module in first-use order. Template fragments
 * request names independently, so names from the same module are merged here
 * instead of producing duplicate import declarations.
 */
export const renderImports = (imports: readonly NamedImport[]): string => {
	const bySource = new Map<string, string[]>()
	for (const [source, names] of imports) {
		const merged = bySource.get(source) ?? []
		for (const name of names.split(', '))
			if (!merged.includes(name)) merged.push(name)
		bySource.set(source, merged)
	}
	return [...bySource]
		.map(([source, names]) => {
			const line = `import { ${names.join(', ')} } from '${source}'`
			// Prettier breaks an import longer than its 80 columns.
			return line.length <= 80
				? line
				: `import {\n${names.map((name) => `  ${name},`).join('\n')}\n} from '${source}'`
		})
		.join('\n')
}

/**
 * Joins the present top-level sections of a generated file with exactly one
 * blank line. Absent optional sections are empty strings and leave no gap;
 * sections themselves carry no leading or trailing newline.
 */
export const joinSections = (sections: readonly string[]): string =>
	`${sections.filter((section) => section !== '').join('\n\n')}\n`
