import fs from 'node:fs'
import path from 'node:path'

import { expect, it } from 'vitest'

// Regression (ADR-0320): option types imported from `pg` or plugin-kit made
// the published declarations load `@types/pg` and Node globals in every
// consumer program.
it('publishes declarations that import neither the driver nor Node', () => {
	const distribution = path.join(import.meta.dirname, '../../dist')
	const imports = fs
		.readdirSync(distribution)
		.filter((file) => file.endsWith('.d.ts'))
		.flatMap((file) =>
			fs
				.readFileSync(path.join(distribution, file), 'utf8')
				.split('\n')
				.filter((line) => line.startsWith('import')),
		)

	expect(imports.length).toBeGreaterThan(0)
	expect(
		imports.filter((line) => /["'](?:pg|node:[^"']+)["']/u.test(line)),
	).toStrictEqual([])
})
