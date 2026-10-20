// Tiny RFC-4180-style CSV parser. No new libraries: Node has no built-in CSV
// reader, and the file is small enough that a hand-rolled parser (quotes,
// escaped "" quotes, commas/newlines inside quotes) is clearer than a dep.

export type CsvTable = { headers: string[]; rows: string[][] };

export function parseCsv(content: string): CsvTable {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Skip blank lines (empty or whitespace-only): all cells blank + field blank.
    if (field.trim() === "" && row.every((cell) => cell.trim() === "")) {
      row = [];
      field = "";
      return;
    }
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // ignore; \n handles the break
    } else {
      field += ch;
    }
  }
  // Flush the last line even without a trailing newline.
  if (field !== "" || row.length > 0) pushRow();
  if (inQuotes) throw new Error("Unclosed quote in CSV.");

  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...data] = rows;
  return { headers: headers.map((h) => h.trim()), rows: data };
}
