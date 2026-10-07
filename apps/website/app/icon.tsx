import { ImageResponse } from 'next/og'

import { BrandMark } from '../components/brand-mark'

export const size = { height: 48, width: 48 }
export const contentType = 'image/png'

export default function Icon() {
	return new ImageResponse(
		<div
			style={{
				alignItems: 'center',
				background: '#151918',
				color: '#ff7652',
				display: 'flex',
				height: '100%',
				justifyContent: 'center',
				width: '100%',
			}}
		>
			<BrandMark size={34} />
		</div>,
		{ ...size },
	)
}
