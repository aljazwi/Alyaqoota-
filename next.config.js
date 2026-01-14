/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // إزالة appDir و serverActions
  i18n: {
    locales: ['ar'],
    defaultLocale: 'ar',
  },
  // إزالة إعدادات PWA
}

module.exports = nextConfig
