import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://www.safrotravel.com';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/company/', '/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
