/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://my.clett.ai https://*.webflow.io",
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
