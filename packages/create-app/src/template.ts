import { readFileSync } from 'node:fs'

/**
 * The files every generated project copies unchanged. They are real files in
 * the package's `template/` directory, beside `src/` and `dist/`, so the
 * repository formats, lints and type-checks them as written.
 */
export type TemplateFile =
	| 'compose.yaml'
	// npm never publishes a file named `.gitignore`.
	| 'gitignore'
	| 'tsconfig.build.json'
	| 'tsconfig.json'
	| 'vitest.config.ts'

const templateDirectory = new URL('../template/', import.meta.url)

/** The contents of one `template/` file, as published with the package. */
export const templateFile = (name: TemplateFile): string =>
	readFileSync(new URL(name, templateDirectory), 'utf8')
