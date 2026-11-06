// What an example's test does with the request files its page shows (D-282):
// it sends each one as a client does, and compares the response with its JSON
// file. Private to the examples' tests.
import { existsSync, readFileSync } from 'node:fs'
import { expect } from 'vitest'

/** What changes at each run, which a response file shows as `…`. */
const changing = new Set(['id', 'cursor', 'startCursor', 'endCursor'])

const steady = (body: unknown): unknown =>
	JSON.parse(
		JSON.stringify(body, (key, value: unknown) =>
			changing.has(key) && typeof value === 'string' ? '…' : value,
		),
	)

/** The request files of `directory`, sent to `server`. */
export function requestFiles(directory: URL, server: { readonly url: string }) {
	const path = (file: string) => new URL(file, directory)
	const read = (file: string) => readFileSync(path(file), 'utf8')

	/** A GraphQL document's response body. */
	const send = async (
		query: string,
		variables: object = {},
		headers: object = {},
	): Promise<unknown> => {
		const response = await fetch(`${server.url}/graphql`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify({ query, variables }),
		})
		return response.json()
	}

	/** An `.http` file's response body: its request line, headers and body. */
	const sendHttp = async (text: string): Promise<unknown> => {
		const [head = '', ...rest] = text.trim().split('\n\n')
		const [line = '', ...headers] = head.split('\n')
		const [method = '', target = ''] = line.split(' ')
		const body = rest.join('\n\n').trim()
		const response = await fetch(`${server.url}${target}`, {
			method,
			headers: new Headers(
				headers.map((header) => {
					const [name = '', value = ''] = header.split(': ')
					return [name, value]
				}),
			),
			...(body === '' ? {} : { body }),
		})
		return response.json()
	}

	/** The response body of `requests/<name>.graphql` or `.http`. */
	const file = (name: string, variables: object = {}): Promise<unknown> =>
		existsSync(path(`${name}.graphql`))
			? send(read(`${name}.graphql`), variables)
			: sendHttp(read(`${name}.http`))

	/** Sends a request file, and expects its `.json`; returns the body as sent. */
	const check = async (
		name: string,
		variables: object = {},
	): Promise<unknown> => {
		const body = await file(name, variables)
		const expected: unknown = JSON.parse(read(`${name}.json`))
		expect(steady(body)).toEqual(expected)
		return body
	}

	return { send, file, check }
}
