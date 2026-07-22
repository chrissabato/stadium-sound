import React from 'react'
import qrcode from 'qrcode-generator'

// @types/qrcode-generator only declares the string-output methods
// (createSvgTag/createTableTag/createImageTag). The library itself also
// exposes the raw module matrix — https://github.com/kazuhikoarase/qrcode-generator
// — which we use instead so the QR renders as real SVG elements rather than
// a string blob pushed through dangerouslySetInnerHTML.
interface QrMatrix {
  getModuleCount(): number
  isDark(row: number, col: number): boolean
}

export function QrCode({ value, size = 96 }: { value: string; size?: number }) {
  const qr = qrcode(0, 'M') as ReturnType<typeof qrcode> & QrMatrix
  qr.addData(value)
  qr.make()

  const count = qr.getModuleCount()
  const cell = size / count
  const rects: React.ReactNode[] = []
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        rects.push(<rect key={`${row}-${col}`} x={col * cell} y={row * cell} width={cell} height={cell} />)
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ background: '#fff', borderRadius: 4, flexShrink: 0 }}
    >
      {rects}
    </svg>
  )
}
