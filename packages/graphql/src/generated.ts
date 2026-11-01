// The schema file a client's codegen reads (D-191): the served schema,
// printed as SDL, written only when its content changed.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { GraphQLSchema } from 'graphql'
import { printSchema } from 'graphql'

/** Writes `schema` to `path`, from the current directory; true when written. */
export async function writeGenerated(
	path: string,
	schema: GraphQLSchema,
): Promise<boolean> {
	const file = resolve(path)
	const printed = `${printSchema(schema)}\n`
	const current = await readFile(file, 'utf8').catch(() => undefined)
	if (current === printed) return false
	await mkdir(dirname(file), { recursive: true })
	await writeFile(file, printed)
	return true
}
