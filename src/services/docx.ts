// ═══════════════════════════════════════════════════════════
//  Minimal .docx (Word / Google Docs) writer — zero dependencies.
//
//  A .docx is a ZIP archive of XML parts. We write it "store only"
//  (no compression), which Word, Google Docs and LibreOffice all
//  accept, and we keep the part set small but complete:
//
//    [Content_Types].xml · _rels/.rels · word/document.xml
//    word/_rels/document.xml.rels · word/styles.xml
//    docProps/core.xml · docProps/app.xml
//
//  Google Docs opens/imports .docx natively, so a file produced here
//  can be sent to Drive/Docs through the Android share sheet and saved
//  as a Google Doc without any Google Cloud setup.
// ═══════════════════════════════════════════════════════════

export interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export interface DocBlock {
  /** Paragraph role. `bullet` is rendered with a • prefix + indent. */
  type: 'title' | 'subtitle' | 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'bullet' | 'quote';
  runs: DocRun[];
}

// ─── Small helpers ─────────────────────────────────────────

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // strip control chars that make Word reject the document
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

// ─── CRC32 (required by the ZIP central directory) ─────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── Store-only ZIP writer ─────────────────────────────────

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  u16(value: number) {
    this.push(new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF]));
  }

  u32(value: number) {
    this.push(new Uint8Array([
      value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF,
    ]));
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }
}

/** DOS date/time pair used by ZIP entries. */
function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: d };
}

interface ZipEntry { nameBytes: Uint8Array; data: Uint8Array; crc: number; offset: number }

function zipArchive(files: { name: string; data: Uint8Array }[], modified = new Date()): Uint8Array {
  const { time, date } = dosDateTime(modified);
  const out = new ByteWriter();
  const entries: ZipEntry[] = [];

  for (const file of files) {
    const nameBytes = utf8(file.name);
    const crc = crc32(file.data);
    const offset = out.length;

    // Local file header
    out.u32(0x04034B50);
    out.u16(20);          // version needed
    out.u16(0x0800);      // UTF-8 names
    out.u16(0);           // method: store
    out.u16(time);
    out.u16(date);
    out.u32(crc);
    out.u32(file.data.length);
    out.u32(file.data.length);
    out.u16(nameBytes.length);
    out.u16(0);           // extra field length
    out.push(nameBytes);
    out.push(file.data);

    entries.push({ nameBytes, data: file.data, crc, offset });
  }

  const centralStart = out.length;
  for (const entry of entries) {
    out.u32(0x02014B50);
    out.u16(20);          // version made by
    out.u16(20);          // version needed
    out.u16(0x0800);
    out.u16(0);
    out.u16(time);
    out.u16(date);
    out.u32(entry.crc);
    out.u32(entry.data.length);
    out.u32(entry.data.length);
    out.u16(entry.nameBytes.length);
    out.u16(0);           // extra
    out.u16(0);           // comment
    out.u16(0);           // disk
    out.u16(0);           // internal attrs
    out.u32(0);           // external attrs
    out.u32(entry.offset);
    out.push(entry.nameBytes);
  }
  const centralSize = out.length - centralStart;

  // End of central directory
  out.u32(0x06054B50);
  out.u16(0);
  out.u16(0);
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(centralSize);
  out.u32(centralStart);
  out.u16(0);
  return out.bytes();
}

// ─── WordprocessingML ──────────────────────────────────────

function runsToXml(runs: DocRun[]): string {
  if (runs.length === 0) return '';
  return runs.map(run => {
    const props = [
      run.bold ? '<w:b/>' : '',
      run.italic ? '<w:i/>' : '',
      run.underline ? '<w:u w:val="single"/>' : '',
      run.strike ? '<w:strike/>' : '',
    ].join('');
    const text = run.text ? `<w:t xml:space="preserve">${xmlEscape(run.text)}</w:t>` : '';
    return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${text}</w:r>`;
  }).join('');
}

function blockToXml(block: DocBlock): string {
  const style =
    block.type === 'title' ? 'Title'
      : block.type === 'subtitle' ? 'Subtitle'
        : block.type === 'heading1' ? 'Heading1'
          : block.type === 'heading2' ? 'Heading2'
            : block.type === 'heading3' ? 'Heading3'
              : block.type === 'quote' ? 'Quote'
                : '';

  const props = [
    style ? `<w:pStyle w:val="${style}"/>` : '',
    // Bullets are drawn with a prefix + hanging indent: keeps the file
    // valid without pulling in a numbering part.
    block.type === 'bullet' ? '<w:ind w:left="720" w:hanging="360"/>' : '',
  ].join('');

  const runs = block.type === 'bullet'
    ? [{ text: '• ' }, ...block.runs]
    : block.runs;

  const body = runsToXml(runs);
  if (!props && !body) return '<w:p/>';
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${body}</w:p>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="808080"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="320" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>
</w:styles>`;

function documentXml(blocks: DocBlock[]): string {
  const body = blocks.map(blockToXml).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body></w:document>`;
}

function coreXml(title: string, created: Date): string {
  const stamp = created.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEscape(title)}</dc:title>
<dc:creator>VoiceDiary Pro</dc:creator>
<cp:lastModifiedBy>VoiceDiary Pro</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>
</cp:coreProperties>`;
}

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>VoiceDiary Pro</Application>
</Properties>`;

/**
 * Build a .docx file (as bytes) from structured blocks.
 * Opens natively in Word and imports into Google Docs as a real Doc.
 */
export function buildDocx(blocks: DocBlock[], options: { title?: string; created?: Date } = {}): Uint8Array {
  const created = options.created ?? new Date();
  const title = options.title ?? 'VoiceDiary';
  return zipArchive([
    { name: '[Content_Types].xml', data: utf8(CONTENT_TYPES) },
    { name: '_rels/.rels', data: utf8(ROOT_RELS) },
    { name: 'word/document.xml', data: utf8(documentXml(blocks)) },
    { name: 'word/_rels/document.xml.rels', data: utf8(DOCUMENT_RELS) },
    { name: 'word/styles.xml', data: utf8(STYLES) },
    { name: 'docProps/core.xml', data: utf8(coreXml(title, created)) },
    { name: 'docProps/app.xml', data: utf8(APP_XML) },
  ], created);
}
