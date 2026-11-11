import { useEffect } from 'react';

const DEFAULT_SITE_URL = import.meta.env.VITE_SITE_URL || 'https://www.timbercraftsawmill.com';
const DEFAULT_IMAGE = '/images/hero-banner.jpg';

export default function SeoMeta({
  title,
  description,
  path = '/',
  image = DEFAULT_IMAGE,
  type = 'website'
}) {
  const fullTitle = title ? `${title} | TimberCraft Saw Mill` : 'TimberCraft Saw Mill';
  const canonicalPath = path.startsWith('/') ? path : `/${path}`;
  const canonicalUrl = `${DEFAULT_SITE_URL}${canonicalPath}`;

  useEffect(() => {
    document.title = fullTitle;

    const setMetaTag = (selector, attr, value, attrValue) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, attrValue);
        document.head.appendChild(element);
      }
      element.setAttribute('content', value);
    };

    setMetaTag('meta[name="description"]', 'name', description || 'TimberCraft Saw Mill provides timber, custom cutting and mill work for builders and trade clients.', 'description');
    setMetaTag('meta[property="og:title"]', 'property', fullTitle, 'og:title');
    setMetaTag('meta[property="og:description"]', 'property', description || 'TimberCraft Saw Mill provides timber, custom cutting and mill work for builders and trade clients.', 'og:description');
    setMetaTag('meta[property="og:type"]', 'property', type, 'og:type');
    setMetaTag('meta[property="og:url"]', 'property', canonicalUrl, 'og:url');
    setMetaTag('meta[property="og:image"]', 'property', `${DEFAULT_SITE_URL}${image}`, 'og:image');
    setMetaTag('meta[name="twitter:card"]', 'name', 'summary_large_image', 'twitter:card');
    setMetaTag('meta[name="twitter:title"]', 'name', fullTitle, 'twitter:title');
    setMetaTag('meta[name="twitter:description"]', 'name', description || 'TimberCraft Saw Mill provides timber, custom cutting and mill work for builders and trade clients.', 'twitter:description');
    setMetaTag('meta[name="twitter:image"]', 'name', `${DEFAULT_SITE_URL}${image}`, 'twitter:image');

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);
  }, [canonicalUrl, description, fullTitle, image, type]);

  return null;
}
