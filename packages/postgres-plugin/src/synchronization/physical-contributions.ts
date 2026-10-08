import { FrameworkError } from '@ultimabase/core'
import type { AdapterContributionSnapshot } from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	isPostgresPhysicalColumnType,
	type PostgresPhysicalColumnPayload,
} from '../adapter-capabilities.js'
import type {
	DesiredPostgresColumn,
	DesiredPostgresTable,
} from './contracts.js'

type PhysicalContribution =
	AdapterContributionSnapshot<PostgresPhysicalColumnPayload>

/** Revalidates bridge metadata before it reaches PostgreSQL DDL. */
const decodeColumn = (
	contribution: PhysicalContribution,
): Readonly<{ column: DesiredPostgresColumn; table: string }> => {
	const payload: unknown = contribution.payload
	if (
		contribution.protocolVersion !== 1 ||
		!isPlainRecord(payload) ||
		payload.kind !== 'column' ||
		typeof payload.table !== 'string' ||
		!isPlainRecord(payload.column) ||
		typeof payload.column.name !== 'string' ||
		!isPostgresPhysicalColumnType(payload.column.type) ||
		typeof payload.column.nullable !== 'boolean'
	) {
		throw new FrameworkError(
			'PLUGIN_PROTOCOL_INCOMPATIBLE',
			`PostgreSQL physical contribution "${contribution.contributionId}" is incompatible.`,
			{
				internalDetails: {
					contributionId: contribution.contributionId,
					pluginId: contribution.pluginId,
					protocolVersion: contribution.protocolVersion,
				},
			},
		)
	}
	return immutableRecord({
		column: immutableRecord({
			name: payload.column.name,
			nullable: payload.column.nullable,
			primary: false,
			type: payload.column.type,
		}),
		table: payload.table,
	})
}

/** Merges bridge-owned physical columns without modifying the logical schema graph. */
export const applyPostgresPhysicalContributions = (
	tables: readonly DesiredPostgresTable[],
	contributions: readonly PhysicalContribution[],
): readonly DesiredPostgresTable[] => {
	const additions = new Map<string, DesiredPostgresColumn[]>()
	for (const contribution of contributions) {
		const { column, table: tableName } = decodeColumn(contribution)
		const table = tables.find(({ name }) => name === tableName)
		const details = {
			contributionId: contribution.contributionId,
			pluginId: contribution.pluginId,
			table: tableName,
		}
		if (table === undefined) {
			throw new FrameworkError(
				'PLUGIN_DECLARATION_INVALID',
				`PostgreSQL physical contribution targets unknown table "${tableName}".`,
				{ internalDetails: details },
			)
		}
		const added = additions.get(tableName) ?? []
		if ([...table.columns, ...added].some(({ name }) => name === column.name)) {
			throw new FrameworkError(
				'PLUGIN_CAPABILITY_CONFLICT',
				`PostgreSQL physical column "${column.name}" is already declared on "${tableName}".`,
				{ internalDetails: { column: column.name, ...details } },
			)
		}
		additions.set(tableName, [...added, column])
	}

	return immutableArray(
		tables.map((table) => {
			const columns = additions.get(table.name)
			return columns === undefined
				? table
				: immutableRecord({
						...table,
						columns: immutableArray([...table.columns, ...columns]),
					})
		}),
	)
}
