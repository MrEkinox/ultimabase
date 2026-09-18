import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ReactNode } from 'react'

import { BrandMark } from '../../components/brand-mark'

export const alt =
	'UltimaBase — your TypeScript data model and plugins become typed data APIs.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const blue = '#2055d6'
const ink = '#172135'
const muted = '#526079'
const soft = '#edf3ff'
const line = '#d6dfef'

function Chip({ label, accent = false }: { label: string; accent?: boolean }) {
	return (
		<span
			style={{
				background: accent ? soft : '#f9fafc',
				border: accent ? '1px dashed #a9bef0' : `1px solid ${line}`,
				borderRadius: 5,
				color: accent ? blue : muted,
				display: 'flex',
				fontFamily: 'monospace',
				fontSize: 16,
				padding: '6px 10px',
			}}
		>
			{label}
		</span>
	)
}

function EquationCard({
	icon,
	labels,
	title,
}: {
	icon: ReactNode
	labels: readonly string[]
	title: string
}) {
	return (
		<div
			style={{
				background: '#ffffff',
				border: '1px solid #adc2f0',
				borderRadius: 12,
				boxShadow: '0 5px 0 #dae5fa',
				color: ink,
				display: 'flex',
				flexDirection: 'column',
				padding: '21px 22px',
				width: '100%',
			}}
		>
			<div
				style={{
					alignItems: 'center',
					display: 'flex',
					fontSize: 23,
					fontWeight: 600,
					gap: 12,
				}}
			>
				<span style={{ color: blue, display: 'flex' }}>{icon}</span>
				{title}
			</div>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					gap: 8,
					marginTop: 16,
				}}
			>
				{labels.map((label) => (
					<Chip key={label} accent={label === '+ Your own'} label={label} />
				))}
			</div>
		</div>
	)
}

/** Render the share card from bundled font files so its weights survive static generation. */
export default async function OpenGraphImage() {
	const fontDirectory = join(process.cwd(), 'assets', 'share-image')
	const [regular, semibold] = await Promise.all([
		readFile(join(fontDirectory, 'Inter-Regular.ttf')),
		readFile(join(fontDirectory, 'Inter-SemiBold.ttf')),
	])

	return new ImageResponse(
		<div
			style={{
				background: soft,
				color: ink,
				display: 'flex',
				flexDirection: 'column',
				fontFamily: 'Inter',
				height: '100%',
				overflow: 'hidden',
				padding: '42px 52px',
				position: 'relative',
				width: '100%',
			}}
		>
			<div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
				<div
					style={{
						alignItems: 'center',
						background: blue,
						borderRadius: 7,
						color: '#ffffff',
						display: 'flex',
						height: 40,
						justifyContent: 'center',
						width: 40,
					}}
				>
					<BrandMark size={29} />
				</div>
				<span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.6 }}>
					UltimaBase
				</span>
			</div>
			<div
				style={{
					alignItems: 'center',
					display: 'flex',
					flex: 1,
					gap: 52,
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', width: 610 }}>
					<div
						style={{
							color: blue,
							fontFamily: 'monospace',
							fontSize: 17,
							letterSpacing: 1.7,
							marginBottom: 27,
						}}
					>
						TypeScript backend framework
					</div>
					<div
						style={{
							fontSize: 68,
							fontWeight: 600,
							letterSpacing: -4.4,
							lineHeight: 1.02,
						}}
					>
						Your data model.
					</div>
					<div
						style={{
							color: blue,
							fontSize: 68,
							fontWeight: 600,
							letterSpacing: -4.4,
							lineHeight: 1.02,
						}}
					>
						A working backend.
					</div>
					<div
						style={{
							color: muted,
							display: 'flex',
							flexDirection: 'column',
							fontSize: 22,
							lineHeight: 1.4,
							marginTop: 27,
						}}
					>
						<span>Define schemas in TypeScript. Query with typed APIs.</span>
						<span>Extend your backend with plugins.</span>
					</div>
					<div
						style={{
							alignItems: 'center',
							color: muted,
							display: 'flex',
							fontSize: 17,
							gap: 10,
							marginTop: 36,
						}}
					>
						<span
							style={{
								background: blue,
								borderRadius: '50%',
								height: 6,
								width: 6,
							}}
						/>
						Open source · Pre-release{' '}
						<span style={{ color: '#9aaccb' }}>/</span> Node.js 24+
					</div>
				</div>
				<div
					style={{
						alignItems: 'center',
						color: blue,
						display: 'flex',
						flexDirection: 'column',
						width: 420,
					}}
				>
					<div
						style={{
							fontFamily: 'monospace',
							fontSize: 15,
							letterSpacing: 1.6,
							marginBottom: 17,
						}}
					>
						YOUR APPLICATION
					</div>
					<EquationCard
						icon={<span style={{ fontFamily: 'monospace' }}>{'{ }'}</span>}
						labels={['Article', 'Author', '…']}
						title="Your schemas"
					/>
					<div
						style={{
							alignItems: 'center',
							display: 'flex',
							fontFamily: 'monospace',
							fontSize: 24,
							height: 42,
							justifyContent: 'center',
						}}
					>
						+
					</div>
					<EquationCard
						icon={
							<svg
								fill="none"
								height="20"
								stroke={blue}
								strokeWidth="1.7"
								viewBox="0 0 24 24"
								width="20"
							>
								<rect height="8" rx="1" width="8" x="3" y="3" />
								<rect height="8" rx="1" width="8" x="13" y="13" />
								<path d="M13 7h5a2 2 0 0 1 2 2v2M7 13v5a2 2 0 0 0 2 2h2" />
							</svg>
						}
						labels={['PostgreSQL', 'REST', 'GraphQL', 'Hooks', '+ Your own']}
						title="Your plugins"
					/>
					<div
						style={{
							display: 'flex',
							fontSize: 20,
							fontWeight: 600,
							gap: 9,
							marginTop: 17,
						}}
					>
						↓ <span>Typed data APIs</span>
					</div>
				</div>
			</div>
		</div>,
		{
			...size,
			fonts: [
				{ name: 'Inter', data: regular, weight: 400, style: 'normal' },
				{ name: 'Inter', data: semibold, weight: 600, style: 'normal' },
			],
		},
	)
}
