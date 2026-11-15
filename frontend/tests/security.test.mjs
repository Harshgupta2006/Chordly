import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function config(env) {
  const sandbox = { exports: {}, process: { env }, URL };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports.default;
}

test("production CSP restricts connections and disallows eval and embedded objects", async () => {
  const settings = config({ NODE_ENV: "production" });
  const headers = Object.fromEntries((await settings.headers())[0].headers.map(({ key, value }) => [key, value]));
  const csp = headers["Content-Security-Policy"];
  assert.doesNotMatch(csp, /unsafe-eval|localhost|127\.0\.0\.1/);
  assert.match(csp, /connect-src 'self';/);
  for (const value of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"]) assert.ok(csp.includes(value));
  assert.match(headers["Permissions-Policy"], /microphone=\(self\)/);
  assert.match(csp, /media-src 'self' blob:/);
  assert.equal(settings.productionBrowserSourceMaps, false);
  assert.equal(settings.poweredByHeader, false);
});

test("development permits loopback audio and dev tooling", async () => {
  const settings = config({ NODE_ENV: "development", NEXT_PUBLIC_ENABLE_AUDIO_ML: "true", NEXT_PUBLIC_ML_API_URL: "http://127.0.0.1:8100" });
  const csp = (await settings.headers())[0].headers.find(h => h.key === "Content-Security-Policy").value;
  assert.match(csp, /http:\/\/127\.0\.0\.1:8100/);
  assert.match(csp, /unsafe-eval/);
  assert.throws(() => config({ NODE_ENV: "development", NEXT_PUBLIC_ENABLE_AUDIO_ML: "true", NEXT_PUBLIC_ML_API_URL: "https://other.example" }), /localhost/);
});

test("public secrets and credential URLs fail without echoing values", () => {
  assert.throws(() => config({ NODE_ENV: "production", NEXT_PUBLIC_API_KEY: "sensitive-value" }), error => error.message.includes("NEXT_PUBLIC_API_KEY") && !error.message.includes("sensitive-value"));
  for (const url of ["https://user:password@api.example", "https://api.example?token=private", "http://api.example"]) {
    assert.throws(() => config({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: url }), /HTTPS URL without credentials/);
  }
});
