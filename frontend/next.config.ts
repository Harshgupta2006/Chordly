import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
const localAudioEnabled = isDevelopment && process.env.NEXT_PUBLIC_ENABLE_AUDIO_ML === "true";
const localAudioUrl = new URL(localAudioEnabled ? process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8100" : "http://127.0.0.1:8100");
if (localAudioEnabled && !["localhost", "127.0.0.1"].includes(localAudioUrl.hostname)) {
  throw new Error("Local chord recognition requires a localhost/127.0.0.1 API URL.");
}

// Public environment variables are compiled into browser JavaScript.
for (const [name, value] of Object.entries(process.env)) {
  if (value && /^NEXT_PUBLIC_.*(?:SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|CREDENTIAL)/i.test(name)) {
    throw new Error(`Remove secret-bearing public environment variable: ${name}`);
  }
}
const remoteApi = process.env.NEXT_PUBLIC_API_URL?.trim();
let remoteOrigin = "";
if (remoteApi) {
  const url = new URL(remoteApi);
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (!isLocal && url.protocol !== "https:")) {
    throw new Error("NEXT_PUBLIC_API_URL must be an HTTPS URL without credentials, query or fragment.");
  }
  if (!isLocal) remoteOrigin = ` ${url.origin}`;
}

const nextConfig: NextConfig = {
  // A5: Explicitly disable client-side source maps in production to protect source code
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
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
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https:",
              `connect-src 'self'${remoteOrigin}${isDevelopment ? " ws: wss: http://localhost:8000 http://127.0.0.1:8000" : ""}${localAudioEnabled ? ` ${localAudioUrl.origin}` : ""}`,
              "media-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
