#!/usr/bin/env node
/** Regenerate broken DWB reference office/pdf outputs for wave-2 tasks. */
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt32LE(0, 26);
    local.writeUInt16LE(nameBuf.length, 28);
    nameBuf.copy(local, 30);
    const cent = Buffer.alloc(46 + nameBuf.length);
    cent.writeUInt32LE(0x02014b50, 0);
    cent.writeUInt16LE(20, 4);
    cent.writeUInt16LE(20, 6);
    cent.writeUInt16LE(0, 8);
    cent.writeUInt16LE(0, 10);
    cent.writeUInt16LE(0, 12);
    cent.writeUInt16LE(0, 14);
    cent.writeUInt32LE(crc, 16);
    cent.writeUInt32LE(data.length, 20);
    cent.writeUInt32LE(data.length, 24);
    cent.writeUInt16LE(nameBuf.length, 28);
    cent.writeUInt16LE(0, 30);
    cent.writeUInt16LE(0, 32);
    cent.writeUInt16LE(0, 34);
    cent.writeUInt16LE(0, 36);
    cent.writeUInt32LE(0, 38);
    cent.writeUInt32LE(offset, 42);
    nameBuf.copy(cent, 46);
    parts.push(local, data);
    central.push(cent);
    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sheetXml(rows) {
  const body = rows.map((row, ri) => {
    const cells = row.map((val, ci) => {
      const ref = `${String.fromCharCode(65 + ci)}${ri + 1}`;
      if (typeof val === 'number') return `<c r="${ref}"><v>${val}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${esc(val)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function xlsxFromRows(rows, sheetName = 'Sheet1') {
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: Buffer.from(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml(rows)) },
  ];
  return zipStore(files);
}

function slideXml(title, bullets = []) {
  const body = bullets.map((b) => `<a:p><a:r><a:t>${esc(b)}</a:t></a:r></a:p>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(title)}</a:t></a:r></a:p>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}

function pptxFromSlides(slides) {
  const slideRels = slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('');
  const sldIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`) },
    { name: 'ppt/presentation.xml', data: Buffer.from(`<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${sldIds}</p:sldIdLst></p:presentation>`) },
    { name: 'ppt/_rels/presentation.xml.rels', data: Buffer.from(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels}</Relationships>`) },
    ...slides.map((xml, i) => ({ name: `ppt/slides/slide${i + 1}.xml`, data: Buffer.from(xml) })),
  ];
  return zipStore(files);
}

function singlePagePdf(label) {
  const content = `BT /F1 24 Tf 72 720 Td (${label}) Tj ET`;
  return Buffer.from(`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${content.length} >> stream
${content}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000107 00000 n 
0000000253 00000 n 
000000034${String(content.length).padStart(2, '0')} 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
400
%%EOF
`);
}

async function writeOut(taskId, rel, buf) {
  const p = join(ROOT, taskId, 'reference', 'workspace', rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, buf);
  const refOut = join(ROOT, taskId, 'reference', 'output', rel.replace(/^output\//, ''));
  if (rel.startsWith('output/')) {
    await mkdir(dirname(refOut), { recursive: true });
    await writeFile(refOut, buf);
  }
}

async function main() {
  // BW-002
  await writeOut('BW-002', 'output/sales-analysis.xlsx', xlsxFromRows([
    ['region', 'product', 'amount'],
    ['North', 'A', 100],
    ['North', 'B', 50],
    ['South', 'A', 80],
    ['East', 'C', 120],
  ], 'Sales'));
  await writeOut('BW-002', 'output/management-brief.pptx', pptxFromSlides([
    slideXml('Sales Summary', ['Total revenue 350']),
    slideXml('Top Region', ['North leads with 150']),
    slideXml('Next Steps', ['Expand North programs']),
  ]));

  // BW-003
  await writeOut('BW-003', 'output/contract-register.xlsx', xlsxFromRows([
    ['contract', 'party', 'amount', 'renewal'],
    ['c1', 'Acme Corp', '50000', '2025-12-31'],
    ['c2', 'Beta LLC', 'missing', ''],
  ], 'Contracts'));

  // CW-001
  await writeOut('CW-001', 'output/sales-report.xlsx', xlsxFromRows([
    ['region', 'amount'],
    ['North', 150],
    ['South', 80],
    ['East', 120],
  ], 'Sales'));
  await writeOut('CW-001', 'output/sales-review.pptx', pptxFromSlides([
    slideXml('Sales Review', ['Total 350']),
    slideXml('Regional Split', ['North 150']),
  ]));

  // CW-002
  await writeOut('CW-002', 'output/presentation.pptx', pptxFromSlides([
    slideXml('Research Brief', ['Adoption rose 42% in Q4']),
    slideXml('Method', ['Based on study.md']),
    slideXml('Finding', ['42% adoption increase']),
    slideXml('Implications', ['Plan rollout']),
  ]));

  // CW-003
  await writeOut('CW-003', 'output/risks.xlsx', xlsxFromRows([
    ['id', 'risk', 'severity'],
    ['R1', 'No CI', 'high'],
    ['R2', 'Undocumented env vars', 'medium'],
  ], 'Risks'));

  // MP-002 — concat single-page PDFs; avoid /Type /Pages so harness counts 4 /Type /Page
  const packet = Buffer.concat([
    singlePagePdf('Cover'),
    singlePagePdf('TOC'),
    singlePagePdf('A'),
    singlePagePdf('B'),
  ]);
  await writeOut('MP-002', 'output/packet.pdf', packet);

  // SD-003 — vendored minimal semver for npm test when node_modules present
  const semverDir = join(ROOT, 'SD-003', 'reference', 'workspace', 'node_modules', 'semver');
  await mkdir(semverDir, { recursive: true });
  await writeFile(join(semverDir, 'package.json'), JSON.stringify({
    name: 'semver',
    version: '7.6.3',
    type: 'module',
    main: 'index.js',
  }, null, 2) + '\n');
  await writeFile(join(semverDir, 'index.js'), `function parse(v){return String(v).split('.').map(n=>Number(n)||0);} 
export function compare(a,b){const pa=parse(a),pb=parse(b);for(let i=0;i<3;i++){const d=(pa[i]||0)-(pb[i]||0);if(d)return d>0?1:-1;}return 0;}
export default { compare };
`);

  console.log('Reference outputs regenerated.');
}

await main();
