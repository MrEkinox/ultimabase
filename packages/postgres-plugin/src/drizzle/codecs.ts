import { nodePgCodecs } from 'drizzle-orm/node-postgres'
import type { PgCodecs } from 'drizzle-orm/pg-core/codecs'

import {
	normalizePostgresDriverLocalDateTime,
	normalizePostgresDriverTime,
	normalizePostgresDriverZonedDateTime,
} from '../schema/value-codec.js'

/** Extends native node-postgres codecs only where Schema requires canonical text. */
export const postgresDrizzleCodecs: PgCodecs = {
	...nodePgCodecs,
	time: {
		...nodePgCodecs.time,
		normalize: normalizePostgresDriverTime,
		normalizeInJson: normalizePostgresDriverTime,
	},
	'timestamp:string': {
		...nodePgCodecs['timestamp:string'],
		normalize: normalizePostgresDriverLocalDateTime,
		normalizeInJson: normalizePostgresDriverLocalDateTime,
	},
	'timestamptz:string': {
		...nodePgCodecs['timestamptz:string'],
		normalize: normalizePostgresDriverZonedDateTime,
		normalizeInJson: normalizePostgresDriverZonedDateTime,
	},
}
