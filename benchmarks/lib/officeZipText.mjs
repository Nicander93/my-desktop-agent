/**
 * OOXML (.xlsx/.pptx) 常是 Deflate 压缩的 ZIP；直接 Buffer.toString 搜不到 XML。
 * 解压各 .xml 条目拼成文本，供 harness 做 includes / 正则。
 */
import { inflateRawSync } from 'node:zlib';

export function zipXmlText(buf) {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let out = buffer.toString('latin1');
  let offset = 0;
  while (offset + 30 < buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const start = offset + 30 + nameLen + extraLen;
    const data = buffer.subarray(start, start + compSize);
    let raw = data;
    if (method === 8) {
      try {
        raw = inflateRawSync(data);
      } catch {
        raw = data;
      }
    }
    if (/\.xml$/i.test(name) || /\.rels$/i.test(name)) {
      out += `\n${raw.toString('utf8')}`;
    }
    offset = start + compSize;
  }
  return out;
}
