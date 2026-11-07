// The statements PostgreSQL plans once per connection (D-264): planning a
// composed statement costs more than running it, and an application asks the
// same few again and again. A connection keeps those it used last (D-293), so
// that a visitor sending shapes of their own cannot take the room for good.
import type { ClientBase } from 'pg'

/** What a connection keeps stays small: 22 KB or so per statement measured. */
export const preparedStatements = 500

/** Past this, a statement is a long list of ids, rarely asked twice alike. */
const parameters = 64

/**
 * What the adapter composed lately, to tell it from raw SQL: true once asked
 * again, for a statement asked once to take no room from another.
 */
const composed = new Map<unknown, boolean>()

/** Lets `text` run prepared. */
export function prepare(text: string, size: number): void {
	if (size > parameters) return
	const known = composed.get(text)
	if (known === true) return
	composed.set(text, known === false)
	if (composed.size > preparedStatements) {
		const [[oldest] = []] = composed
		composed.delete(oldest)
	}
}

/**
 * Has PostgreSQL deallocate `names`: an aborted transaction refuses, so those
 * it refused go back to `names`, for the next query to try again.
 */
function deallocated(
	names: string[],
	query: (text: string) => Promise<unknown>,
): void {
	for (const name of names.splice(0)) {
		query(`deallocate ${name}`).catch(() => names.push(name))
	}
}

/** Has `pg` forget `name`, and answers whether `client` got as far as parsing it. */
function forgotten(client: ClientBase, name: string): boolean {
	const connection: unknown = Reflect.get(client, 'connection')
	const parsed: unknown = Reflect.get(Object(connection), 'parsedStatements')
	if (!(parsed instanceof Object) || !Reflect.has(parsed, name)) return false
	Reflect.deleteProperty(parsed, name)
	return true
}

/** Has `client` run prepared what `prepare` let, the last used kept. */
export function preparing(client: ClientBase): void {
	const query = client.query.bind(client)
	const held = new Map<unknown, string>()
	const dropped: string[] = []
	let named = 0
	Reflect.set(client, 'query', (text: unknown, values: unknown[]): unknown => {
		if (dropped.length > 0) deallocated(dropped, query)
		const name = held.get(text)
		if (name === undefined && composed.get(text) !== true) {
			const plain: unknown = Reflect.apply(query, undefined, [text, values])
			return plain
		}
		held.delete(text)
		for (const [oldest, gone] of held) {
			if (held.size < preparedStatements) break
			held.delete(oldest)
			if (forgotten(client, gone)) dropped.push(gone)
		}
		deallocated(dropped, query)
		const kept = name ?? `ultimabase_${named++}`
		held.set(text, kept)
		const result: unknown = Reflect.apply(query, undefined, [
			{ name: kept, text, values },
		])
		return result
	})
}
