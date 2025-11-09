import type React from "react"
import type { Metadata } from "next"
import { Inter, Space_Grotesk } from 'next/font/google'
import "./globals.css"
import { Suspense } from "react"
import Providers from "./providers"

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Monty",
  description: "Real-time options analysis and trading recommendations",
  generator: "v0.app",
  openGraph: {
    title: "Monty",
    description: "Real-time options analysis and trading recommendations",
    images: ['/Monty_logo.png'],
  },
  twitter: {
    card: 'summary',
    title: "Monty",
    description: "Real-time options analysis and trading recommendations",
    images: ['/Monty_logo.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <Suspense fallback={null}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  )
}
