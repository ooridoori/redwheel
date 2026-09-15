import type { MetadataRoute } from 'next'

/**
 * Keeps the hosted demo out of search engines.
 *
 * The plan is built from an interview brief, so the link is meant to be shared
 * directly rather than found. `robots.txt` only asks politely, which is why the
 * root layout also sends `noindex` as a meta tag.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  }
}
