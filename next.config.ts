// next.config.ts
import withPWA from 'next-pwa';

const config = withPWA({
  pwa: {
    dest: 'public',
    // إزالة التعطيل في وضع التطوير
    disable: false, // تم التعديل هنا
    register: true,
    skipWaiting: true,
    runtimeCaching: [
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|json)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 يوم
          },
        },
      },
      {
        urlPattern: /\/api\/transactions/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-data',
          networkTimeoutSeconds: 10,
        },
      },
    ],
  },
  // إعدادات Next.js الأخرى
  reactStrictMode: true,
  swcMinify: true,
});

export default config;
