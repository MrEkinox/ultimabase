import { ImageResponse } from 'next/og'

import { BrandMark } from '../../components/brand-mark'

export const alt =
	'UltimaBase — TypeScript schemas, typed data APIs, and composable backend plugins.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** A local, statically rendered share image keeps previews independent of external assets. */
export default function OpenGraphImage() {
	return new ImageResponse(
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				padding: '52px 60px',
				background: '#edf3ff',
				color: '#172135',
				fontFamily: 'sans-serif',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 14,
					fontSize: 27,
					fontWeight: 700,
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 48,
						height: 48,
						borderRadius: 12,
						background: '#2055d6',
						color: '#ffffff',
					}}
				>
					<BrandMark size={34} />
				</div>
				UltimaBase
			</div>
			<div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 45 }}>
				<div style={{ display: 'flex', flexDirection: 'column', width: 585 }}>
					<div style={{ color: '#2055d6', fontSize: 19, marginBottom: 22 }}>
						TYPESCRIPT BACKEND FRAMEWORK
					</div>
					<div
						style={{
							fontSize: 63,
							lineHeight: 1.05,
							letterSpacing: -3,
							fontWeight: 700,
						}}
					>
						Your data model.
					</div>
					<div
						style={{
							color: '#2055d6',
							fontSize: 63,
							lineHeight: 1.05,
							letterSpacing: -3,
							fontWeight: 700,
							marginTop: 8,
						}}
					>
						A working backend.
					</div>
					<div
						style={{
							fontSize: 23,
							color: '#596477',
							lineHeight: 1.5,
							marginTop: 26,
						}}
					>
						Typed data APIs. Composable plugins.
					</div>
				</div>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						width: 410,
						padding: 30,
						border: '1px solid #cfdaee',
						borderRadius: 16,
						background: '#ffffff',
						boxShadow: '8px 8px 0 #dce6ff',
					}}
				>
					<div style={{ color: '#596477', fontSize: 18, marginBottom: 25 }}>
						Article · Schema
					</div>
					{[
						['title', 'string'],
						['published', 'boolean | null'],
					].map(([field, type]) => (
						<div
							key={field}
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								fontSize: 19,
								padding: '16px 0',
								borderTop: '1px solid #dce2ed',
							}}
						>
							<span>{field}</span>
							<span style={{ color: '#2055d6' }}>{type}</span>
						</div>
					))}
					<div
						style={{
							display: 'flex',
							marginTop: 22,
							fontSize: 19,
							color: '#2055d6',
						}}
					>
						Schema → typed operations
					</div>
				</div>
			</div>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					color: '#596477',
					fontSize: 18,
				}}
			>
				<span>Open source · Apache-2.0</span>
				<span>Pre-release</span>
			</div>
		</div>,
		size,
	)
}
