/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // ファイルアップロードサイズ制限を拡張
    bodyParser: {
      sizeLimit: '500mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Disable cache completely to prevent EIO and ENOENT errors
    config.cache = false;
    
    // ws のネイティブ依存を無効化
    config.resolve.fallback = {
      ...config.resolve.fallback,
      bufferutil: false,
      'utf-8-validate': false,
    };
    return config;
  },
  env: {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_SPREADSHEET_TEMPLATE_ID: process.env.GOOGLE_SPREADSHEET_TEMPLATE_ID,
    EMAIL_TEST_MODE: process.env.EMAIL_TEST_MODE,
    EMAIL_TEST_ADDRESSES: process.env.EMAIL_TEST_ADDRESSES,
  },
};

module.exports = nextConfig;