/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy the public manifest/service worker from /public; the PWA manifest is
  // linked from the root layout. Keep config minimal for the skeleton.
  // We render only plain <img>, never next/image (ADR-0095), so the
  // /_next/image optimizer is dead surface; disabling it removes its whole
  // advisory class (e.g. GHSA-2xp9 AVIF RCE via sharp).
  images: { unoptimized: true },
};

module.exports = nextConfig;
