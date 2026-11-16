// Run the browser's TypeScript ranker in offline evaluation and regression tests.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

export function loadTypeScript(filename, globals = {}) {
  const modules = new Map();
  function load(resolved) {
    if (modules.has(resolved)) return modules.get(resolved).exports;
    if (resolved.endsWith(".json")) return JSON.parse(fs.readFileSync(resolved, "utf8"));
    const module = { exports: {} };
    modules.set(resolved, module);
    const compiled = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText;
    const require = relative => {
      if (!relative.startsWith(".")) throw new Error(`Unexpected offline import ${relative}`);
      let dependency = path.resolve(path.dirname(resolved), relative);
      if (!path.extname(dependency)) dependency += ".ts";
      return load(dependency);
    };
    vm.runInNewContext(compiled, { module, exports: module.exports, require, console, Date, Event, ...globals }, { filename: resolved });
    return module.exports;
  }
  return load(path.resolve(filename));
}
