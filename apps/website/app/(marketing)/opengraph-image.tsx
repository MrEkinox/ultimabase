import { ImageResponse } from 'next/og'
import type { ReactNode } from 'react'

import { BrandMark } from '../../components/brand-mark'

export const alt =
	'UltimaBase — your TypeScript data model and plugins become typed data APIs.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const blue = '#a9c6ff'
const ink = '#f3f6ff'
const muted = '#adb8ca'

function Chip({ label, accent = false }: { label: string; accent?: boolean }) {
	return (
		<span
			style={{
				background: accent ? '#15233c' : '#090c12',
				border: accent ? '1px solid #385483' : '1px solid #323d4f',
				borderRadius: 5,
				color: accent ? blue : muted,
				display: 'flex',
				fontFamily: 'monospace',
				fontSize: 14,
				padding: '6px 9px',
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
				background: '#12151b',
				border: '1px solid #485875',
				borderRadius: 12,
				boxShadow: '0 5px 0 #1b2a47',
				color: ink,
				display: 'flex',
				flexDirection: 'column',
				padding: '20px 22px',
				width: '100%',
			}}
		>
			<div
				style={{
					alignItems: 'center',
					display: 'flex',
					fontSize: 21,
					fontWeight: 700,
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

/** Mirror the hero's dark palette, coordinate field, and schema/plugin model. */
export default function OpenGraphImage() {
	return new ImageResponse(
		<div
			style={{
				background: '#0b101a',
				color: ink,
				display: 'flex',
				flexDirection: 'column',
				fontFamily: 'sans-serif',
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
						color: '#0b101a',
						display: 'flex',
						height: 40,
						justifyContent: 'center',
						width: 40,
					}}
				>
					<BrandMark size={29} />
				</div>
				<span style={{ fontSize: 23, fontWeight: 700, letterSpacing: -0.6 }}>
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
							fontSize: 16,
							letterSpacing: 1.7,
							marginBottom: 27,
						}}
					>
						TypeScript backend framework
					</div>
					<div
						style={{
							fontSize: 68,
							fontWeight: 700,
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
							fontWeight: 700,
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
							fontSize: 23,
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
							fontSize: 15,
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
						<span style={{ color: '#485875' }}>/</span> Node.js 24+
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
							fontSize: 13,
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
							fontSize: 19,
							fontWeight: 650,
							gap: 9,
							marginTop: 17,
						}}
					>
						↓ <span>Typed data APIs</span>
					</div>
				</div>
			</div>
		</div>,
		size,
	)
}
