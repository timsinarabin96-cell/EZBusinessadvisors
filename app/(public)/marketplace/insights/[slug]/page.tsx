import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPostBySlug, listPublishedPosts } from '@/lib/blog'

// Insights article detail — rendered from the blog engine (audit Part C #1).
// Server component; revalidates so newly published posts appear without redeploy.

export const revalidate = 60

export async function generateStaticParams() {
  const posts = await listPublishedPosts()
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return {}
  return {
    title: `${post.title} — Insights`,
    description: post.excerpt,
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await getPostBySlug(slug)
  if (!article || !article.published) notFound()

  return (
    <main style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 80px' }}>
        <Link href="/marketplace/insights" style={{ color: '#0e7490', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
          ← All insights
        </Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
          <span style={{ padding: '4px 10px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{article.category}</span>
          <span style={{ fontSize: 13, color: '#7b8794' }}>{new Date(article.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} · {article.read} read</span>
        </div>
        <h1 style={{ fontSize: 36, color: '#102a43', lineHeight: 1.25, margin: '16px 0 8px', fontFamily: 'Georgia, serif' }}>{article.title}</h1>
        <div style={{ height: 3, width: 64, background: '#c9a84c', margin: '20px 0 28px' }} />
        {article.sections.map(([heading, body]) => (
          <section key={heading} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 21, color: '#102a43', margin: '0 0 10px', fontFamily: 'Georgia, serif' }}>{heading}</h2>
            <p style={{ color: '#3d4a5c', fontSize: 16, lineHeight: 1.75, margin: 0 }}>{body}</p>
          </section>
        ))}
        <div style={{ marginTop: 36, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '24px 26px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 14px', color: '#52606d', fontSize: 14.5 }}>Put this into practice — get a free, confidential valuation.</p>
          <Link href="/marketplace/sell" style={{ background: '#0e7490', color: '#fff', padding: '11px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Get your free valuation →
          </Link>
        </div>
      </article>
    </main>
  )
}
