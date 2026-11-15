// Course materials (slides, textbooks, handouts): pull out their text so the AI
// can quote the relevant parts. Only the text is kept; it lives on this computer.

const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');

const EXTS = ['pdf', 'pptx', 'docx', 'txt', 'md', 'markdown'];
const CHUNK = 1500;

// Minimal ZIP reader (PPTX and DOCX are ZIP files of XML).
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is damaged or not a real Office document.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files.set(name, () => (method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: 64 * 1024 * 1024 }) : raw));
  }
  return files;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m));

// Text runs from Office XML, one line per paragraph.
function xmlText(xml, tag) {
  return xml.split(new RegExp(`</${tag.split(':')[0]}:p>`)).map((para) => {
    const runs = [];
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g');
    let m;
    while ((m = re.exec(para))) runs.push(decode(m[1]));
    return runs.join('');
  }).filter((l) => l.trim()).join('\n');
}

async function pages(file, ext) {
  const buf = await fsp.readFile(file);
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise;
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      out.push({ loc: `p. ${i}`, text: tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('') });
    }
    await doc.destroy();
    return out;
  }
  if (ext === 'pptx') {
    const zip = unzip(buf);
    return [...zip.keys()].map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)).filter(Boolean)
      .sort((a, b) => a[1] - b[1])
      .map((m) => ({ loc: `slide ${m[1]}`, text: xmlText(zip.get(m[0])().toString('utf8'), 'a:t') }));
  }
  if (ext === 'docx') {
    const doc = unzip(buf).get('word/document.xml');
    if (!doc) throw new Error('This Word file has no text.');
    return [{ loc: '', text: xmlText(doc().toString('utf8'), 'w:t') }];
  }
  return [{ loc: '', text: buf.toString('utf8') }];
}

// Split into ~1500 character passages, keeping page or slide numbers for citing.
function chunk(list) {
  const out = [];
  for (const { loc, text } of list) {
    const clean = text.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    for (let i = 0; i < clean.length; i += CHUNK) {
      let end = Math.min(clean.length, i + CHUNK);
      const stop = clean.lastIndexOf('\n', end);
      if (end < clean.length && stop > i + CHUNK / 2) end = stop;
      out.push({ loc, text: clean.slice(i, end).trim() });
      i = end - CHUNK;
    }
  }
  return out.filter((c) => c.text);
}

async function extract(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!EXTS.includes(ext)) throw new Error(`${path.basename(file)}: only PDF, PowerPoint (.pptx), Word (.docx) and text files are supported.`);
  const chunks = chunk(await pages(file, ext));
  if (!chunks.length) throw new Error(`${path.basename(file)} has no readable text. Scanned pages (images of text) are not supported.`);
  return chunks;
}

module.exports = { extract, unzip, chunk, EXTS };
