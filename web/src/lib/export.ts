// Local exports: tamper-evident CSV and printable documents (the print dialog saves to PDF). Nothing leaves the browser.

export function csvString(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Last line of every export: `# veilpay-export k=v · … · sha256=<hex>`. The hash covers every line above it,
 * so a reader verifies by dropping the last line and hashing the rest.
 */
export async function csvWithFooter(rows: string[][], meta: Record<string, string>): Promise<string> {
  const body = csvString(rows)
  const kv = Object.entries({ ...meta, rows: String(rows.length - 1) }).map(([k, v]) => `${k}=${v}`).join(' · ')
  return `${body}\n${csvString([[`# veilpay-export ${kv} · sha256=${await sha256Hex(body)}`]])}`
}

/** Returns true when the footer hash matches the body (used by tests and anyone auditing a file). */
export async function verifyCsv(csv: string): Promise<boolean> {
  const cut = csv.lastIndexOf('\n')
  const hash = csv.slice(cut + 1).match(/sha256=([0-9a-f]{64})/)?.[1]
  return hash !== undefined && hash === (await sha256Hex(csv.slice(0, cut)))
}

export async function downloadCsv(filename: string, rows: string[][], meta: Record<string, string>) {
  const url = URL.createObjectURL(new Blob([await csvWithFooter(rows, meta)], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type PrintDoc = {
  kind: string // "Payslip", "Payroll receipt"
  title: string // org or employee name
  amount: string
  fields: [string, string][]
  footnote: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Opens a print-ready page styled like a sealed letter; the browser's print dialog can save it as PDF. */
export function printDocument(doc: PrintDoc) {
  const win = window.open('', '_blank', 'noopener=no,width=820,height=1000')
  if (!win) throw new Error('allow pop-ups to print this document')
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.kind)} · ${esc(doc.title)}</title>
<style>
  @page { margin: 22mm }
  body { font: 14px/1.5 "Schibsted Grotesk", system-ui, sans-serif; color: #131b26; max-width: 640px; margin: 48px auto; padding: 0 24px }
  .seal { width: 44px; height: 44px; border-radius: 50%; background: #de3f20; display: grid; place-items: center; color: #0c121a; font: italic 600 22px "Newsreader Variable", Newsreader, Georgia, serif }
  .kind { font: 11px/1 "IBM Plex Mono", monospace; letter-spacing: .18em; text-transform: uppercase; color: #5b646f; margin-top: 28px }
  h1 { font: 500 34px/1.1 "Newsreader Variable", Newsreader, Georgia, serif; margin: 8px 0 0 }
  .amount { font: 500 40px/1 "IBM Plex Mono", monospace; margin: 28px 0 8px }
  table { width: 100%; border-collapse: collapse; margin-top: 28px }
  td { padding: 10px 0; border-top: 1px solid #dadfdf; vertical-align: top }
  td:first-child { color: #5b646f; width: 34% }
  td:last-child { font-family: "IBM Plex Mono", monospace; font-size: 12.5px; word-break: break-all }
  .foot { margin-top: 36px; font-size: 12px; color: #5b646f }
</style></head><body>
<div class="seal">V</div>
<div class="kind">${esc(doc.kind)}</div>
<h1>${esc(doc.title)}</h1>
<div class="amount">${esc(doc.amount)}</div>
<table>${doc.fields.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p class="foot">${esc(doc.footnote)}</p>
<script>window.onload = () => window.print()</script>
</body></html>`)
  win.document.close()
}
