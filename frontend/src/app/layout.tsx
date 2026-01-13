import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PFS Automation',
  description: 'Professional Financial Services Automation Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
