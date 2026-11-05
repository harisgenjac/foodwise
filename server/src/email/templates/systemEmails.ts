import { renderLayout, type EmailLanguage } from "./layout.js";
import { InvalidEmailDataError, type EmailTemplate } from "./types.js";

// System emails: sent whatever the user's email notifications switch says (`system: true`), and
// without the footer link to it. Their data holds the raw one-time token, which the queue removes
// from the row once the email is finished (sent, failed or skipped).

export interface TokenEmailData {
  token: string;
}

const parseToken = (data: unknown, template: string): TokenEmailData => {
  const value = data as Partial<TokenEmailData> | null;
  if (!value || typeof value.token !== "string" || value.token.length === 0) {
    throw new InvalidEmailDataError(template);
  }
  return { token: value.token };
};

const link = (appUrl: string, page: string, token: string) => `${appUrl}${page}?token=${encodeURIComponent(token)}`;

const RESET_COPY: Record<EmailLanguage, { subject: string; intro: string; outro: string[]; button: string }> = {
  bs: {
    subject: "Postavite novu lozinku",
    intro: "Neko je zatražio novu lozinku za vaš FoodWise račun. Kliknite dugme da postavite novu lozinku.",
    outro: [
      "Link vrijedi 1 sat i može se iskoristiti jednom.",
      "Ako niste vi zatražili novu lozinku, zanemarite ovaj email; vaša lozinka ostaje ista.",
    ],
    button: "Postavi novu lozinku",
  },
  en: {
    subject: "Set a new password",
    intro: "Someone asked for a new password for your FoodWise account. Click the button to set a new password.",
    outro: [
      "The link is valid for 1 hour and can be used once.",
      "If you did not ask for a new password, ignore this email; your password stays the same.",
    ],
    button: "Set a new password",
  },
};

const INVITATION_COPY: Record<EmailLanguage, { subject: string; intro: string; outro: string[]; button: string }> = {
  bs: {
    subject: "Pozivnica za FoodWise",
    intro:
      "Administrator platforme FoodWise vam je otvorio račun. Kliknite dugme da postavite svoju lozinku, a zatim popunite profil.",
    outro: [
      "Link vrijedi 72 sata i može se iskoristiti jednom. Ako je istekao, zatražite novi od administratora ili na stranici za prijavu (Zaboravili ste lozinku?).",
      "Ako ne očekujete ovaj email, zanemarite ga.",
    ],
    button: "Postavi lozinku",
  },
  en: {
    subject: "Your FoodWise invitation",
    intro:
      "The FoodWise platform administrator opened an account for you. Click the button to set your password, then fill in your profile.",
    outro: [
      "The link is valid for 72 hours and can be used once. If it has expired, ask the administrator for a new one or use Forgot password? on the login page.",
      "If you did not expect this email, ignore it.",
    ],
    button: "Set your password",
  },
};

export const PASSWORD_RESET_PAGE = "/reset-password";
export const INVITATION_PAGE = "/set-password";

export const SYSTEM_TEMPLATES: Record<string, EmailTemplate> = {
  PASSWORD_RESET: {
    system: true,
    render: (data, lang, appUrl) => {
      const { token } = parseToken(data, "PASSWORD_RESET");
      const copy = RESET_COPY[lang];
      return renderLayout({
        lang,
        subject: copy.subject,
        heading: copy.subject,
        intro: [copy.intro],
        outro: copy.outro,
        button: { label: copy.button, url: link(appUrl, PASSWORD_RESET_PAGE, token) },
      });
    },
  },
  INVITATION: {
    system: true,
    render: (data, lang, appUrl) => {
      const { token } = parseToken(data, "INVITATION");
      const copy = INVITATION_COPY[lang];
      return renderLayout({
        lang,
        subject: copy.subject,
        heading: copy.subject,
        intro: [copy.intro],
        outro: copy.outro,
        button: { label: copy.button, url: link(appUrl, INVITATION_PAGE, token) },
      });
    },
  },
};
