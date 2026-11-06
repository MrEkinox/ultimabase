// What an example's test does with the request files its page shows (D-282):
// it sends each one as a client does, and compares the response with its JSON
// file. Private to the examples' tests.
import { existsSync, readFileSync } from 'node:fs'
import { expect } from 'vitest'

/** What changes at each run, which a response file shows as `…`. */
const changing = new Set([
	'id',
	'cursor',
	'startCursor',
	'endCursor',
	'createdAt',
	'updatedAt',
	'correlationId',
])

const steady = (body: unknown): unknown =>
	body === undefined
		? undefined
		: JSON.parse(
				JSON.stringify(body, (key, value: unknown) =>
					changing.has(key) && typeof value === 'string' ? '…' : value,
				),
			)

/** What a test adds to a request file: its headers, and the status it expects. */
interface Sending {
	readonly headers?: { readonly [name: string]: string }
	readonly status?: number
}

type Variables = { readonly [name: string]: unknown }

/** A response's JSON body, none for an empty one; checks its status. */
const answer = async (response: Response, status?: number) => {
	if (status !== undefined) expect(response.status).toBe(status)
	const text = await response.text()
	const body: unknown = text === '' ? undefined : JSON.parse(text)
	return body
}

/** The request files of `directory`, sent to `server`. */
export function requestFiles(directory: URL, server: { readonly url: string }) {
	const path = (file: string) => new URL(file, directory)
	const read = (file: string) => readFileSync(path(file), 'utf8')

	/** A GraphQL document's response body. */
	const send = async (
		query: string,
		variables: Variables = {},
		{ headers, status }: Sending = {},
	): Promise<unknown> =>
		answer(
			await fetch(`${server.url}/graphql`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...headers },
				body: JSON.stringify({ query, variables }),
			}),
			status,
		)

	/**
	 * An `.http` file's response body: its request line, headers and body, with
	 * each `$name` replaced by that variable.
	 */
	const sendHttp = async (
		template: string,
		variables: Variables,
		{ headers: added, status }: Sending,
	): Promise<unknown> => {
		const values = new Map(Object.entries(variables))
		const text = template.replaceAll(/\$(\w+)/gu, (match, name: string) =>
			values.has(name) ? String(values.get(name)) : match,
		)
		const [head = '', ...rest] = text.trim().split('\n\n')
		const [line = '', ...lines] = head.split('\n')
		const [method = '', target = ''] = line.split(' ')
		const body = rest.join('\n\n').trim()
		const headers = new Headers(added)
		for (const header of lines) {
			const [name = '', value = ''] = header.split(': ')
			headers.set(name, value)
		}
		return answer(
			await fetch(`${server.url}${target}`, {
				method,
				headers,
				...(body === '' ? {} : { body }),
			}),
			status,
		)
	}

	/** The response body of `requests/<name>.graphql` or `.http`. */
	const file = (
		name: string,
		variables: Variables = {},
		sending: Sending = {},
	): Promise<unknown> =>
		existsSync(path(`${name}.graphql`))
			? send(read(`${name}.graphql`), variables, sending)
			: sendHttp(read(`${name}.http`), variables, sending)

	/**
	 * Sends a request file, and expects its `.json`, or an empty body without
	 * one; returns the body as sent.
	 */
	const check = async (
		name: string,
		variables: Variables = {},
		sending: Sending = {},
	): Promise<unknown> => {
		const body = await file(name, variables, sending)
		const expected: unknown = existsSync(path(`${name}.json`))
			? JSON.parse(read(`${name}.json`))
			: undefined
		expect(steady(body)).toEqual(expected)
		return body
	}

	return { send, file, check }
}
