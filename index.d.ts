// Based on the type definitions for extract-zip 1.6
// Definitions by: Mizunashi Mana <https://github.com/mizunashi-mana>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/e69b58e/types/extract-zip/index.d.ts

import { Entry, ZipFile } from 'yauzl';

declare namespace extract {
    interface Options {
        /** The path to the directory where the extracted files are written */
        dir: string;
        /** Directory Mode (permissions), defaults to `0o755` */
        defaultDirMode?: number;
        /** File Mode (permissions), defaults to `0o644` */
        defaultFileMode?: number;
        /**
         * If present, will be called with (entry, zipfile),
         * entry is every entry from the zip file forwarded
         * from the entry event from yauzl. zipfile is the
         * yauzl instance
         */
        onEntry?: (entry: Entry, zipfile: ZipFile) => void;
    }
}

declare function extract(
  zipPath: string,
  opts: extract.Options,
): Promise<void>;

export = extract;
