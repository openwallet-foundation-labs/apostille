const path = require('path')
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {

  },
  // Use webpack instead of Turbopack (Next.js 16 default) due to custom webpack config
  turbopack: {},
  output: 'standalone',
  // Proxy API requests to backend for same-origin cookies (required for httpOnly refresh tokens)
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

    // Skip rewrites if using runtime placeholder (Docker build) or invalid URL
    if (backendUrl.startsWith('__') || !backendUrl.startsWith('http')) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      // Proxy .well-known endpoints to backend (for DID resolution, IACA certs, etc.)
      {
        source: '/.well-known/:path*',
        destination: `${backendUrl}/.well-known/:path*`,
      },
      // WebSocket connections should be handled directly by the client
      // to the backend URL since Next.js rewrites don't support ws:// protocol
    ];
  },
  // Silence monorepo root inference warning during Docker builds
  outputFileTracingRoot: path.join(__dirname, '../..'),
  env: {
    NEXT_PUBLIC_COMPANY_NAME: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Apostille',
    NEXT_PUBLIC_COMPANY_LOGO_URL: process.env.NEXT_PUBLIC_COMPANY_LOGO_URL || '/logo.png',
  },
  serverExternalPackages: [
    "jsonpath",
    "rdf-canonize",
    "rdf-canonize-native",
    "@digitalcredentials/jsonld",
    "@digitalcredentials/rdf-canonize"
  ],
  transpilePackages: ['@tailwindcss/postcss'],
  webpack: (config, { isServer, webpack }) => {

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: isServer ? false : require.resolve('crypto-browserify'),
      stream: isServer ? false : require.resolve('stream-browserify'),
      http: false,
      https: false,
      zlib: false,
      path: false,
      os: false,
      util: require.resolve('util/'),
      events: require.resolve('events/'),
      url: require.resolve('url/'),
      querystring: require.resolve('querystring-es3'),
      buffer: require.resolve('buffer/'),
    };
    
    if (!isServer) {

      config.resolve.fallback = {
        ...config.resolve.fallback,
        process: require.resolve('process/browser'),
      };
    }
    

    if (webpack && webpack.ProvidePlugin) {
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );
    }
    
    return config;
  },
};

module.exports = nextConfig; 
