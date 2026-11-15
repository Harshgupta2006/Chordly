import type { NextConfig } from "next";

// This feature is explicitly local-only; production keeps its existing policy.
const localAudioEnabled = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_ENABLE_AUDIO_ML === "true";
const localAudioUrl = new URL(process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8000");
if (localAudioEnabled && !["localhost", "127.0.0.1"].includes(localAudioUrl.hostname)) {
  throw new Error("Local chord recognition requires a localhost/127.0.0.1 API URL.");
}

const nextConfig: NextConfig = {
  // A5: Explicitly disable client-side source maps in production to protect source code
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // D2: Security headers for all routes
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: localAudioEnabled ? "camera=(), microphone=(self), geolocation=()" : "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https:",
              `connect-src 'self' http://localhost:8000 http://127.0.0.1:8000 https:${localAudioEnabled ? ` ${localAudioUrl.origin}` : ""}`,
              ...(localAudioEnabled ? ["media-src 'self' blob:"] : []),
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
