/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Vercel 빌드 시 TypeScript 오류를 무시 (개발 중에는 여전히 표시됨)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Vercel 빌드 시 ESLint 오류를 무시
    ignoreDuringBuilds: true,
  },
};
module.exports = nextConfig;
