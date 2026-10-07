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

const decodeColumn = (
	contribution: AdapterContributionSnapshot<PostgresPhysicalColumnPayload>,
): Readonly<{
	readonly column: DesiredPostgresColumn
	readonly table: string
}> => {
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
	contributions: readonly AdapterContributionSnapshot<PostgresPhysicalColumnPayload>[],
): readonly DesiredPostgresTable[] => {
	const additions = new Map<string, DesiredPostgresColumn[]>()
	for (const contribution of contributions) {
		const decoded = decodeColumn(contribution)
		const table = tables.find((candidate) => candidate.name === decoded.table)
		if (table === undefined) {
			throw new FrameworkError(
				'PLUGIN_DECLARATION_INVALID',
				`PostgreSQL physical contribution targets unknown table "${decoded.table}".`,
				{
					internalDetails: {
						contributionId: contribution.contributionId,
						pluginId: contribution.pluginId,
						table: decoded.table,
					},
				},
			)
		}
		const existing = [
			...table.columns,
			...(additions.get(decoded.table) ?? []),
		].find((column) => column.name === decoded.column.name)
		if (existing !== undefined) {
			throw new FrameworkError(
				'PLUGIN_CAPABILITY_CONFLICT',
				`PostgreSQL physical column "${decoded.column.name}" is already declared on "${decoded.table}".`,
				{
					internalDetails: {
						column: decoded.column.name,
						contributionId: contribution.contributionId,
						pluginId: contribution.pluginId,
						table: decoded.table,
					},
				},
			)
		}
		const columns = additions.get(decoded.table) ?? []
		columns.push(decoded.column)
		additions.set(decoded.table, columns)
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
