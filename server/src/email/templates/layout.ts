// The one layout every email uses: FoodWise header, content, a button to the page, footer.
// HTML for email clients (tables and inline styles, no external CSS or images) plus a plain text
// version with the same content. Every value is escaped, since product and business names are
// user input.

export type EmailLanguage = "bs" | "en";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailContent {
  lang: EmailLanguage;
  subject: string;
  heading: string;
  // Paragraphs before the details.
  intro: string[];
  details?: { label: string; value: string }[];
  // Paragraphs after the details.
  outro?: string[];
  button: { label: string; url: string };
}

const FOOTER: Record<EmailLanguage, { reason: string; tagline: string }> = {
  bs: {
    reason: "Ovu poruku ste dobili jer imate račun na platformi FoodWise.",
    tagline: "FoodWise – Još vrijedi",
  },
  en: {
    reason: "You received this email because you have a FoodWise account.",
    tagline: "FoodWise – Još vrijedi",
  },
};

const ORANGE = "#ea580c";

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const paragraph = (text: string) =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">${escapeHtml(text)}</p>`;

const detailsTable = (details: { label: string; value: string }[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse;">${details
    .map(
      ({ label, value }) =>
        `<tr><td style="padding:8px 12px 8px 0;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #f3f4f6;">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;

export const renderLayout = (content: EmailContent): RenderedEmail => {
  const footer = FOOTER[content.lang];
  const details = content.details ?? [];
  const outro = content.outro ?? [];

  const html = `<!DOCTYPE html>
<html lang="${content.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="background-color:${ORANGE};padding:20px 24px;font-size:22px;font-weight:700;color:#ffffff;">FoodWise</td></tr>
<tr><td style="padding:28px 24px 8px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:#111827;">${escapeHtml(content.heading)}</h1>
${content.intro.map(paragraph).join("\n")}
${details.length > 0 ? detailsTable(details) : ""}
${outro.map(paragraph).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background-color:${ORANGE};">
<a href="${escapeHtml(content.button.url)}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(content.button.label)}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 24px 24px;border-top:1px solid #f3f4f6;font-size:12px;line-height:18px;color:#6b7280;">
${escapeHtml(footer.reason)}<br>${escapeHtml(footer.tagline)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  const text = [
    "FoodWise",
    "",
    content.heading,
    "",
    ...content.intro.flatMap((line) => [line, ""]),
    ...(details.length > 0 ? [...details.map(({ label, value }) => `${label}: ${value}`), ""] : []),
    ...outro.flatMap((line) => [line, ""]),
    `${content.button.label}: ${content.button.url}`,
    "",
    "--",
    footer.reason,
    footer.tagline,
    "",
  ].join("\n");

  return { subject: content.subject, html, text };
};
