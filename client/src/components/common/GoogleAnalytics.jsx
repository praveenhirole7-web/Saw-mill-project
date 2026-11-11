import { useEffect } from 'react';

export default function GoogleAnalytics() {
  const gaId = import.meta.env.VITE_GA_ID;

  useEffect(() => {
    if (!gaId || typeof window === 'undefined') return undefined;

    const scriptId = 'gtag-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(script);
    }

    window.dataLayer = window.dataLayer || [];
    const gtag = (...args) => {
      window.dataLayer.push(args);
    };
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', gaId, { anonymize_ip: true, send_page_view: true });

    return undefined;
  }, [gaId]);

  return null;
}
