import process from 'node:process'

/** Reads a secret from the environment; secrets never live in source code. */
export const readSecret = (name: string): string => {
	const value = process.env[name]
	if (value === undefined || value === '') {
		throw new TypeError(`Set ${name} to a private random value`)
	}
	return value
}
