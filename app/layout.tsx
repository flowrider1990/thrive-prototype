import type { Metadata, Viewport } from 'next'
import { APP_NAME } from '@/lib/app'
import { HtmlLang } from '@/lib/i18n'
import { en } from '@/lib/i18n/messages/en'
import { STORAGE_KEY } from '@/lib/person/schema'
import { themeBootstrapScript } from '@/lib/theme'
import './globals.css'

// Static metadata cannot be localized — it is baked in at build time, before any
// browser has said which language it wants. English is the source catalog, so it
// is what goes here; everything a person actually reads is translated.
export const metadata: Metadata = {
  title: APP_NAME,
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
    //
    // `suppressHydrationWarning` is required, not cosmetic: the bootstrap script
    // below sets `data-theme` before React hydrates, so this element genuinely
    // does differ from the HTML the build produced. That difference is the whole
    // point — it is what prevents the flash — and React would otherwise report it
    // as a mismatch. The suppression covers this element's own attributes only,
    // so a real mismatch anywhere else still gets reported.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* First thing in the body and synchronous, so a stored theme is applied
            before anything is painted. Everything else in this app waits for
            mount; this cannot, because waiting is precisely the flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript(STORAGE_KEY) }} />
        <HtmlLang />
        {children}
      </body>
    </html>
  )
}
