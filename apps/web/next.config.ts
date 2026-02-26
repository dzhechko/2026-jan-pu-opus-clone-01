import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@clipmaker/db', '@clipmaker/types', '@clipmaker/queue', '@clipmaker/config', '@clipmaker/s3'],
  experimental: {
    serverActions: {
      bodySizeLimit: '4gb',
    },
    middlewareClientMaxBodySize: '4gb',
  },
};

export default nextConfig;
