#!/usr/bin/env node
/**
 * Refresh the bundled engine (engine/latex-math.wasm) and its pin (engine.json).
 *
 *   node scripts/update-engine.mjs v0.2.0            # from a latex-math-wasi release
 *   node scripts/update-engine.mjs --local ../latex-math-wasi   # build a checkout
 *
 * Release mode downloads latex-math-<v>-browser.wasm, provenance.json and
 * SHA256SUMS with `gh release download` (the repository may be private),
 * verifies the module against SHA256SUMS, and records tag + revision.
 * Local mode builds the wasm32-unknown-unknown module inside the checkout's
 * `nix develop` shell and records the checkout's HEAD; the pin then says so.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const REPO = "wspringer/latex-math-wasi";
const ENGINE = "engine/latex-math.wasm";
const sha256 = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();

let [mode, arg] = process.argv.slice(2);
if (!mode) {
  console.error("usage: update-engine.mjs <tag>|latest | --local <checkout>");
  process.exit(2);
}
if (mode === "latest") {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`no latest release on ${REPO} (${res.status})`);
  mode = (await res.json()).tag_name;
  console.log(`latest release: ${mode}`);
}

let pin;
if (mode === "--local") {
  const checkout = path.resolve(arg ?? "../latex-math-wasi");
  run("nix", ["develop", "-c", "cargo", "build", "--release", "-p", "latex-math-wasm", "--target", "wasm32-unknown-unknown"], checkout);
  await copyFile(path.join(checkout, "target/wasm32-unknown-unknown/release/latex_math_wasm.wasm"), ENGINE);
  const cargo = await readFile(path.join(checkout, "Cargo.toml"), "utf8");
  pin = {
    repository: REPO,
    version: /^version\s*=\s*"([^"]+)"/m.exec(cargo)[1],
    revision: run("git", ["rev-parse", "HEAD"], checkout),
    tag: null,
    file: ENGINE,
    sha256: await sha256(ENGINE),
    vendoredEngine: {
      from: "https://github.com/KenyC/ReX",
      revision: (await readFile(path.join(checkout, "crates/core/REX-UPSTREAM"), "utf8")).trim(),
    },
    builtBy: `scripts/update-engine.mjs --local (${run("git", ["status", "--porcelain"], checkout) ? "dirty" : "clean"} checkout)`,
  };
} else {
  const tag = mode;
  const version = tag.replace(/^v/, "");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "latex-math-engine-"));
  const asset = `latex-math-${version}-browser.wasm`;
  run("gh", ["release", "download", tag, "--repo", REPO, "--dir", tmp, "--pattern", asset, "--pattern", "provenance.json", "--pattern", "SHA256SUMS"]);
  const sums = await readFile(path.join(tmp, "SHA256SUMS"), "utf8");
  const expected = new RegExp(`^([0-9a-f]{64})\\s+\\*?${asset.replace(/[.]/g, "\\.")}$`, "m").exec(sums)?.[1];
  const actual = await sha256(path.join(tmp, asset));
  if (!expected || expected !== actual) throw new Error(`${asset}: sha256 ${actual} does not match SHA256SUMS`);
  await copyFile(path.join(tmp, asset), ENGINE);
  await copyFile(path.join(tmp, "provenance.json"), "engine/provenance.json");
  const prov = JSON.parse(await readFile(path.join(tmp, "provenance.json"), "utf8"));
  pin = {
    repository: REPO,
    version,
    revision: prov.revision,
    tag,
    file: ENGINE,
    sha256: actual,
    vendoredEngine: { from: prov.engine.vendoredFrom, revision: prov.engine.revision },
    builtBy: `scripts/update-engine.mjs ${tag}`,
  };
}
await writeFile("engine.json", `${JSON.stringify(pin, null, 2)}\n`);
console.log(`engine.json: ${pin.version} @ ${pin.revision.slice(0, 7)} (${pin.tag ?? "local"}), sha256 ${pin.sha256.slice(0, 12)}…`);
