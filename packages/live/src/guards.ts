// What the client reads from a server, checked before it is used.
import type { LiveMessage } from './apply.ts'

export const isRecord = (
	value: unknown,
): value is { readonly [key: string]: unknown } =>
	typeof value === 'object' && value !== null

export const isMessage = (value: unknown): value is LiveMessage =>
	isRecord(value) &&
	typeof value['revision'] === 'number' &&
	(value['changes'] === undefined || Array.isArray(value['changes']))
