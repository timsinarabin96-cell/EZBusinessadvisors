import { headers } from 'next/headers'
import PublicNav from '@/components/public/PublicNav'
import PublicFooter from '@/components/public/PublicFooter'
import GuideBot from '@/components/public/GuideBot'
import { resolveAgencyThemeByHost } from '@/lib/agencyTheme'

/** Shared layout for the public marketplace routes.
 *  White-label aware: when a request arrives on an agency's custom domain (or
 *  platform subdomain), the agency's brand (name, logo, colors, fonts) is
 *  applied to the whole site via CSS variables + the nav brand block. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers()
  const host = hdrs.get('host') || null
  const brand = await resolveAgencyThemeByHost(host)

  const cssVars = brand?.cssVars || {}
  const cssText = Object.entries(cssVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ')

  return (
    <>
      <style>{`:root { ${cssText} }`}</style>
      <PublicNav
        brand={
          brand
            ? { name: brand.agencyName, logo: brand.logoUrl, primary: brand.theme.primary_color, accent: brand.theme.accent_color }
            : undefined
        }
      />
      <main>{children}</main>
      <PublicFooter />
      <GuideBot />
    </>
  )
}
