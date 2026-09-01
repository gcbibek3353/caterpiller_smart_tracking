/** Shared plain-HTML wrapper — steps.md §10 says template literals are fine; no @react-email needed for a 24h build. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
  <body style="font-family: system-ui, sans-serif; background: #f4f4f5; margin: 0; padding: 24px; color: #18181b;">
    <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e4e4e7;">
      <div style="background: #111827; color: #fff; padding: 16px 24px; font-weight: 600;">Smart Rental Tracking</div>
      <div style="padding: 24px;">${bodyHtml}</div>
      <div style="padding: 16px 24px; font-size: 12px; color: #71717a; border-top: 1px solid #e4e4e7;">
        This is an automated message from the rental platform.
      </div>
    </div>
  </body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function row(label: string, value: string): string {
  return `<tr>
    <td style="padding: 4px 12px 4px 0; color: #71717a; white-space: nowrap;">${escapeHtml(label)}</td>
    <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(value)}</td>
  </tr>`;
}

export function table(rows: string): string {
  return `<table style="border-collapse: collapse; margin: 12px 0;">${rows}</table>`;
}
