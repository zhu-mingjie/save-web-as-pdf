import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const FORBIDDEN_NAMES = new Set([
  ".git",
  ".DS_Store",
  "Thumbs.db",
  "Desktop.ini",
  "node_modules",
  "__MACOSX"
]);
const FORBIDDEN_TEXT = [
  { label: "localhost", pattern: /localhost/i },
  { label: "127.0.0.1", pattern: /127\.0\.0\.1/ },
  { label: "file URL", pattern: /file:\/\//i },
  { label: "macOS user path", pattern: /\/Users\// },
  { label: "Linux home path", pattern: /\/home\// },
  { label: "Windows drive path", pattern: /[A-Za-z]:\\\\/ }
];
const RUNTIME_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".png", ".svg", ".webp"]);

export async function walkFiles(directory) {
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(directory);
  return files.sort();
}

export async function readManifest(distDirectory) {
  const manifestPath = path.join(distDirectory, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`dist/manifest.json is missing or invalid: ${error.message}`);
  }
  if (manifest.manifest_version !== 3) throw new Error("manifest_version must be 3.");
  if (!/^\d+(?:\.\d+){0,3}$/.test(manifest.version ?? "")) throw new Error("manifest.version is invalid.");
  return manifest;
}

export async function validateDist(distDirectory) {
  const info = await stat(distDirectory).catch(() => null);
  if (!info?.isDirectory()) throw new Error("dist does not exist. Run the build first.");
  const manifest = await readManifest(distDirectory);
  const files = await walkFiles(distDirectory);
  if (files.length === 0) throw new Error("dist is empty.");

  for (const absolute of files) {
    const relative = path.relative(distDirectory, absolute);
    const parts = relative.split(path.sep);
    if (parts.some((part) => FORBIDDEN_NAMES.has(part) || part.startsWith("._"))) {
      throw new Error(`Forbidden release file: ${relative}`);
    }
    if (!RUNTIME_EXTENSIONS.has(path.extname(relative).toLowerCase())) {
      throw new Error(`Non-runtime file in dist: ${relative}`);
    }
    if (/\.(?:ts|map)$/i.test(relative)) throw new Error(`Development artifact in dist: ${relative}`);
    const text = await readFile(absolute, "utf8");
    for (const check of FORBIDDEN_TEXT) {
      if (check.pattern.test(text)) throw new Error(`Found ${check.label} in dist file: ${relative}`);
    }
  }
  return { manifest, files };
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

export async function createZip(distDirectory) {
  const files = await walkFiles(distDirectory);
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosTimestamp();

  for (const absolute of files) {
    const relative = path.relative(distDirectory, absolute).split(path.sep).join("/");
    const name = Buffer.from(relative, "utf8");
    const content = await readFile(absolute);
    const compressed = deflateRawSync(content, { level: 9 });
    const checksum = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, compressed);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function listZipEntries(buffer) {
  const endOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOffset < 0) throw new Error("ZIP end record is missing.");
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let cursor = buffer.readUInt32LE(endOffset + 16);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP central directory is invalid.");
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    entries.push(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function validateZip(buffer, version) {
  if (buffer.length <= 22) throw new Error("Release ZIP is empty.");
  const entries = listZipEntries(buffer);
  if (!entries.includes("manifest.json")) throw new Error("ZIP does not contain manifest.json at its root.");
  if (entries.some((entry) => entry.split("/")[0]?.startsWith("save-web-as-pdf-v"))) {
    throw new Error("ZIP contains an extra version directory above manifest.json.");
  }
  for (const entry of entries) {
    const parts = entry.split("/");
    if (parts.some((part) => FORBIDDEN_NAMES.has(part) || part.startsWith("._"))) {
      throw new Error(`Forbidden ZIP entry: ${entry}`);
    }
    if (/\.(?:ts|map)$/i.test(entry)) throw new Error(`Development artifact in ZIP: ${entry}`);
  }
  const manifestEntry = entries.find((entry) => entry === "manifest.json");
  if (!manifestEntry || !version) throw new Error("ZIP version validation failed.");
  return entries;
}
