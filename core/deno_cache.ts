import * as path from "path";
import { URL } from "url";
import crypto from "crypto";

import { getDenoDepsDir } from "./deno";
import { HashMeta } from "./hash_meta";
import { pathExistsSync } from "./util";

export interface DenoCacheModule {
  filepath: string;
  url: URL;
  resolveModule(moduleName: string): DenoCacheModule | void;
}

export class CacheModule implements DenoCacheModule {
  static create(filepath: string): DenoCacheModule | void {
    const DENO_DEPS_DIR = getDenoDepsDir();
    // if not a Deno deps module
    if (filepath.indexOf(DENO_DEPS_DIR) !== 0) {
      return;
    }

    const hash = path.basename(filepath);
    const originDir = path.dirname(filepath);
    const metaFilepath = path.join(originDir, `${hash}.metadata.json`);

    const meta = HashMeta.create(metaFilepath);

    if (!meta) {
      return;
    }

    return new CacheModule(filepath, meta.url);
  }

  constructor(public filepath: string, public url: URL) {}
  /**
   * Resolve module in this cache file
   * @param moduleName The module name is for unix style
   */
  resolveModule(moduleName: string): DenoCacheModule | void {
    // eg. import "/npm:tough-cookie@3?dew"
    if (moduleName.indexOf("/") === 0) {
      const hash = crypto
        .createHash("sha256")
        .update(moduleName)
        .digest("hex");

      const moduleCacheFilepath = path.join(path.dirname(this.filepath), hash);

      if (!pathExistsSync(moduleCacheFilepath)) {
        return;
      }

      const moduleMetaFilepath = path.join(
        moduleCacheFilepath + ".metadata.json"
      );

      const meta = HashMeta.create(moduleMetaFilepath);

      if (!meta) {
        return;
      }

      return CacheModule.create(moduleCacheFilepath);
    }
    // eg. import "./sub/mod.ts"
    else if (moduleName.indexOf(".") === 0) {
      const targetUrlPath = path.posix.resolve(
        path.posix.dirname(this.url.pathname),
        moduleName
      );

      const hash = crypto
        .createHash("sha256")
        .update(targetUrlPath)
        .digest("hex");

      const targetFilepath = path.join(path.dirname(this.filepath), hash);

      return CacheModule.create(targetFilepath);
    }
    // eg import "https://example.com/demo/mod.ts"
    else if (/http?s:\/\//.test(moduleName)) {
      let url: URL;
      try {
        url = new URL(moduleName);
      } catch {
        return;
      }
      const targetOriginDir = path.join(
        getDenoDepsDir(),
        url.protocol.replace(/:$/, ""), // https: -> https
        url.hostname
      );

      // TODO: remove calculate hash. use `deno info` instead
      const hash = crypto
        .createHash("sha256")
        .update(url.pathname + url.search)
        .digest("hex");

      const hashMeta = HashMeta.create(
        path.join(targetOriginDir, `${hash}.metadata.json`)
      );

      if (!hashMeta) {
        return;
      }

      return CacheModule.create(path.join(targetOriginDir, hash));
    }
  }
}
