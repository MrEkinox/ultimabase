// The statements PostgreSQL plans once per connection (D-264): planning a
// composed statement costs more than running it, and an application asks the
// same few again and again.
import type { ClientBase } from 'pg'

/** What a connection keeps stays small: 22 KB or so per statement measured. */
export const preparedStatements = 500

/** Past this, a statement is a long list of ids, rarely asked twice alike. */
const parameters = 64

type Prepared = { readonly name: string; readonly text: string }

const prepared = new Map<unknown, Prepared>()

/** Lets `text` run prepared, while there is room for it. */
export function prepare(text: string, size: number): void {
	if (size > parameters || prepared.size >= preparedStatements) return
	if (!prepared.has(text)) {
		prepared.set(text, { name: `ultimabase_${prepared.size}`, text })
	}
}

/** Has `client` run prepared what `prepare` let. */
export function preparing(client: ClientBase): void {
	const query = client.query.bind(client)
	Reflect.set(client, 'query', (text: unknown, values: unknown[]): unknown => {
		const statement = prepared.get(text)
		if (statement !== undefined) return query({ ...statement, values })
		const plain: unknown = Reflect.apply(query, undefined, [text, values])
		return plain
	})
}
