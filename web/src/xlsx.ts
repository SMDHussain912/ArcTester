function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return Math.max(0, index - 1);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Read the first worksheet from a normal .xlsx workbook and convert it to CSV. */
export async function xlsxToCsv(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const minEocd = Math.max(0, bytes.length - 65_557);
  let eocd = -1;

  for (let offset = bytes.length - 22; offset >= minEocd; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }

  if (eocd < 0) {
    throw new Error("This file is not a valid .xlsx workbook.");
  }

  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries = new Map<
    string,
    { method: number; compressedSize: number; localOffset: number }
  >();

  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("The Excel workbook directory is damaged.");
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(
      bytes.slice(cursor + 46, cursor + 46 + nameLength)
    );

    entries.set(name, { method, compressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  async function readEntry(name: string): Promise<string | null> {
    const entry = entries.get(name);
    if (!entry) return null;

    const local = entry.localOffset;
    if (view.getUint32(local, true) !== 0x04034b50) {
      throw new Error("An Excel workbook entry is damaged.");
    }

    const nameLength = view.getUint16(local + 26, true);
    const extraLength = view.getUint16(local + 28, true);
    const start = local + 30 + nameLength + extraLength;
    const compressed = buffer.slice(start, start + entry.compressedSize);
    let decoded: ArrayBuffer;

    if (entry.method === 0) {
      decoded = compressed;
    } else if (entry.method === 8) {
      const stream = new Blob([compressed])
        .stream()
        .pipeThrough(
          new DecompressionStream("deflate-raw" as CompressionFormat)
        );
      decoded = await new Response(stream).arrayBuffer();
    } else {
      throw new Error(
        "This Excel workbook uses an unsupported compression method."
      );
    }

    return new TextDecoder().decode(decoded);
  }

  const sheetXml = await readEntry("xl/worksheets/sheet1.xml");
  if (!sheetXml) {
    throw new Error("No first worksheet was found in this Excel workbook.");
  }

  const sharedXml = await readEntry("xl/sharedStrings.xml");
  const parser = new DOMParser();
  const sheet = parser.parseFromString(sheetXml, "application/xml");
  if (sheet.querySelector("parsererror")) {
    throw new Error("The first worksheet XML is invalid.");
  }

  const shared = sharedXml ? parser.parseFromString(sharedXml, "application/xml") : null;
  const sharedStrings = shared
    ? Array.from(shared.getElementsByTagName("si")).map((item) =>
        Array.from(item.getElementsByTagName("t"))
          .map((node) => node.textContent ?? "")
          .join("")
      )
    : [];
  const rows = Array.from(
    sheet.getElementsByTagName("sheetData")[0]?.getElementsByTagName("row") ?? []
  );

  const csvRows = rows.map((row) => {
    const cells: string[] = [];

    for (const cell of Array.from(row.getElementsByTagName("c"))) {
      const reference = cell.getAttribute("r") ?? "";
      const index = columnIndex(reference);
      const type = cell.getAttribute("t");
      const value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      let text = value;

      if (type === "s") {
        text = sharedStrings[Number(value)] ?? "";
      } else if (type === "inlineStr") {
        text = Array.from(cell.getElementsByTagName("t"))
          .map((node) => node.textContent ?? "")
          .join("");
      }

      cells[index] = text;
    }

    return cells.map((value) => csvCell(value ?? "")).join(",");
  });

  return csvRows.join("\n");
}
