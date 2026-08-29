/**
 * Font profiles: which OpenType MATH font(s) a formula is set in. A profile
 * is one font file for every math level, or a distinct optical-size cut per
 * level (Minion Math: Subhead / Regular / Caption / Tiny). Profiles come
 * from a JSON config the user points the server at; `stix2` (STIX Two
 * Math, OFL, bundled) is always available and the default when nothing
 * else is configured. Font files never leave the machine: their bytes go
 * into the wasm engine and come back only as subsetted glyphs in a PDF.
 */
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { packageRoot } from "./engine.js";

export const LEVELS = ["display", "text", "script", "scriptscript"] as const;
export type Level = (typeof LEVELS)[number];

/** One profile in the config: a single file, or a file per level. */
export type ProfileSpec = string | Partial<Record<Level, string>>;

export interface FontConfig {
  /** Profile used when a request names none. Defaults to `stix2`. */
  default?: string;
  fonts?: Record<string, ProfileSpec>;
}

export interface FontProfile {
  name: string;
  /** Distinct font files, absolute paths. */
  files: string[];
  /** Index into `files` per level. */
  levels: [number, number, number, number];
  /** File per level, for display. */
  cuts: Record<Level, string>;
  bundled: boolean;
}

export const BUNDLED_PROFILE = "stix2";

function expandHome(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

/**
 * Turns a spec into a profile. Missing levels fall back: display → text,
 * script → text, scriptscript → script. `text` (or `display`) is required.
 */
export function resolveProfile(name: string, spec: ProfileSpec, baseDir: string): FontProfile {
  const abs = (p: string) => path.resolve(baseDir, expandHome(p));
  let cuts: Record<Level, string>;
  if (typeof spec === "string") {
    const f = abs(spec);
    cuts = { display: f, text: f, script: f, scriptscript: f };
  } else {
    const text = spec.text ?? spec.display;
    if (!text) {
      throw new Error(`font profile ${JSON.stringify(name)} needs at least "text" (or "display")`);
    }
    const display = spec.display ?? text;
    const script = spec.script ?? text;
    const scriptscript = spec.scriptscript ?? script;
    cuts = {
      display: abs(display),
      text: abs(text),
      script: abs(script),
      scriptscript: abs(scriptscript),
    };
  }
  const files: string[] = [];
  const index = (f: string) => {
    let i = files.indexOf(f);
    if (i < 0) {
      files.push(f);
      i = files.length - 1;
    }
    return i;
  };
  const levels: [number, number, number, number] = [
    index(cuts.display),
    index(cuts.text),
    index(cuts.script),
    index(cuts.scriptscript),
  ];
  return { name, files, levels, cuts, bundled: false };
}

export function bundledProfile(): FontProfile {
  const f = path.join(packageRoot(), "fonts", "STIXTwoMath-Regular.otf");
  return {
    name: BUNDLED_PROFILE,
    files: [f],
    levels: [0, 0, 0, 0],
    cuts: { display: f, text: f, script: f, scriptscript: f },
    bundled: true,
  };
}

export class FontCatalog {
  private readonly cache = new Map<string, Promise<Uint8Array>>();

  constructor(
    readonly profiles: Map<string, FontProfile>,
    readonly defaultName: string,
    readonly configPath: string | null,
  ) {}

  /** Bundled font only. */
  static builtin(): FontCatalog {
    const p = bundledProfile();
    return new FontCatalog(new Map([[p.name, p]]), p.name, null);
  }

  /** Bundled font plus the profiles in a config file. */
  static async fromConfig(configPath: string): Promise<FontCatalog> {
    const file = path.resolve(expandHome(configPath));
    const config = JSON.parse(await readFile(file, "utf8")) as FontConfig;
    const profiles = new Map<string, FontProfile>();
    const bundled = bundledProfile();
    profiles.set(bundled.name, bundled);
    for (const [name, spec] of Object.entries(config.fonts ?? {})) {
      profiles.set(name, resolveProfile(name, spec, path.dirname(file)));
    }
    const defaultName = config.default ?? bundled.name;
    if (!profiles.has(defaultName)) {
      throw new Error(`${file}: default font ${JSON.stringify(defaultName)} is not defined`);
    }
    return new FontCatalog(profiles, defaultName, file);
  }

  resolve(name?: string): FontProfile {
    const wanted = name ?? this.defaultName;
    const profile = this.profiles.get(wanted);
    if (!profile) {
      const known = [...this.profiles.keys()].join(", ");
      throw new Error(`unknown font ${JSON.stringify(wanted)}; known: ${known}`);
    }
    return profile;
  }

  /** The profile's font files, read once and cached for the server's lifetime. */
  async bytes(profile: FontProfile): Promise<Uint8Array[]> {
    return Promise.all(
      profile.files.map((f) => {
        let p = this.cache.get(f);
        if (!p) {
          p = readFile(f).then(
            (b) => new Uint8Array(b),
            (e: NodeJS.ErrnoException) => {
              this.cache.delete(f);
              throw new Error(`font ${JSON.stringify(profile.name)}: cannot read ${f}: ${e.message}`);
            },
          );
          this.cache.set(f, p);
        }
        return p;
      }),
    );
  }

  /** Which files of a profile exist on disk — for `list_fonts`. */
  async check(profile: FontProfile): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    for (const f of profile.files) {
      out[f] = await access(f).then(
        () => true,
        () => false,
      );
    }
    return out;
  }
}
