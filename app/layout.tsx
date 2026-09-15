import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Redwheel — Build Plan',
  description:
    'Weeks-of-supply build planning for Redwheel Cycles: master data, a capacity-constrained allocation engine, and the reasoning behind every number.',
  // This is an interview exercise built on someone else's brief, so the hosted
  // copy stays out of search results. Share the URL directly instead.
  robots: { index: false, follow: false, nocache: true },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  )
}
