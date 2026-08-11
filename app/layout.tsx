import type { Metadata, Viewport } from 'next'
import { HtmlLang } from '@/lib/i18n'
import { en } from '@/lib/i18n/messages/en'
import './globals.css'

// Static metadata cannot be localized — it is baked in at build time, before any
// browser has said which language it wants. English is the source catalog, so it
// is what goes here; everything a person actually reads is translated.
export const metadata: Metadata = {
  title: en.app.name,
  description: en.app.description,
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#17171a' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // `lang` starts at the build-time guess and is corrected on mount by
    // <HtmlLang />, which is the only honest option without a server.
    <html lang="en">
      <body>
        <HtmlLang />
        {children}
      </body>
    </html>
  )
}
