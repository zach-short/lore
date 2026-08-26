/* Minimal RFC 4180 reader for Letterboxd export CSVs: quoted fields may hold
   commas, doubled quotes, and newlines (film titles do all three). Returns one
   record per row keyed by the header row, like Python's csv.DictReader. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitRows(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (!rows.length) return [];
  const [header, ...body] = rows;
  return body
    .filter((row) => row.length > 1 || (row[0] ?? "").trim() !== "")
    .map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, i) => {
        record[key] = row[i] ?? "";
      });
      return record;
    });
}

function splitRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
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
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
