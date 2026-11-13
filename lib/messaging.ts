/**
 * Messages sent from the contractor's OWN phone and accounts (competitor gaps #7 and #9): no SMS provider, no bill.
 *  - "Text": an `sms:` link that opens the phone's messaging app with the message filled in.
 *  - "WhatsApp": a `https://wa.me/<number>?text=` link (wa.me picks the chat when the number is international).
 *  - Review request after payment: the same short, neutral request for every client (Google's review policy does not
 *    allow asking only the happy ones, offering rewards, or filtering who gets the link).
 * Pure functions; tested by scripts/payments-qa.ts.
 */

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

/** Digits with a single leading "+" kept (what `sms:` and `tel:` accept); '' when there is no usable number. */
export const smsNumber = (phone: unknown): string => {
    const raw = str(phone);
    let digits = raw.replace(/\D/g, '');
    let plus = raw.startsWith('+');
    if (!plus && digits.startsWith('00')) { digits = digits.slice(2); plus = true; }
    if (digits.length < 3) return '';
    return `${plus ? '+' : ''}${digits}`;
};

/**
 * The number in the international digits-only form wa.me needs, or null when it can't be known for sure:
 * "+44 7700 900123" → 447700900123, "0044…" → 44…, "(555) 201-3344" → 15552013344 (North American numbers never start
 * with 0 or 1), "1 555 201 3344" → 15552013344. A national number with a trunk "0" (e.g. "06 12 34 56 78") has no
 * country code, so null: WhatsApp then lets the user pick the chat.
 */
export const whatsappNumber = (phone: unknown): string | null => {
    const raw = str(phone);
    if (!raw) return null;
    let digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? digits : null;
    if (digits.startsWith('00')) {
        digits = digits.slice(2);
        return digits.length >= 8 && digits.length <= 15 ? digits : null;
    }
    if (digits.length === 11 && digits.startsWith('1') && /^[2-9]/.test(digits.slice(1))) return digits;
    if (digits.length === 10 && /^[2-9]/.test(digits)) return `1${digits}`;
    return null;
};

/** Opens the phone's own messaging app with `body` filled in (`?&body=` works on both iOS and Android). */
export const smsHref = (phone: unknown, body: string): string => `sms:${smsNumber(phone)}?&body=${encodeURIComponent(body)}`;

/** Opens WhatsApp (app or web) with `text` filled in, in the client's chat when the number is international. */
export const whatsappHref = (phone: unknown, text: string): string => `https://wa.me/${whatsappNumber(phone) ?? ''}?text=${encodeURIComponent(text)}`;

export const firstName = (name: unknown): string => str(name).split(/\s+/)[0] || '';

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/**
 * Short message for a text / WhatsApp: "Hi Jane, here is invoice INV-1 ($1,250.00) from Acme: <link>" plus an
 * optional pay line on its own line.
 */
export const shortShareMessage = (o: {
    docType: string;
    number?: string;
    total?: string;
    clientName?: string;
    company?: string;
    link?: string;
    payLine?: string;
}): string => {
    const noun = str(o.docType).toLowerCase() || 'document';
    const hi = firstName(o.clientName) ? `Hi ${firstName(o.clientName)}, ` : 'Hi, ';
    const what = `${article(noun)} ${noun}${str(o.number) ? ` ${str(o.number)}` : ''}${str(o.total) ? ` (${str(o.total)})` : ''}`;
    const from = str(o.company) ? ` from ${str(o.company)}` : '';
    const lead = /^(estimate|change order)$/.test(noun) && str(o.link)
        ? `${hi}here is ${what}${from}. You can review and approve it here: ${str(o.link)}`
        : `${hi}here is ${what}${from}${str(o.link) ? `: ${str(o.link)}` : '.'}`;
    return [lead, str(o.payLine)].filter(Boolean).join('\n');
};

/** Portal link message (Clients → portal card). */
export const portalShareMessage = (o: { clientName?: string; company?: string; link: string }): string =>
    `Hi${firstName(o.clientName) ? ` ${firstName(o.clientName)}` : ''}, you can view, download and sign your documents${str(o.company) ? ` from ${str(o.company)}` : ''} anytime here: ${str(o.link)}`;

export interface ReviewRequest {
    subject: string;
    /** email body (plain text) */
    body: string;
    /** one-paragraph version for a text / WhatsApp */
    text: string;
}

/**
 * The review request sent after payment. Neutral wording for every client (no "were you happy?" filter, no reward),
 * which is what Google's review policies require.
 */
export const reviewRequestMessage = (o: { clientName?: string; company?: string; senderName?: string; reviewLink: string }): ReviewRequest => {
    const first = firstName(o.clientName);
    const company = str(o.company) || str(o.senderName) || 'us';
    const sign = [str(o.senderName), str(o.company) && str(o.company) !== str(o.senderName) ? str(o.company) : ''].filter(Boolean).join('\n');
    const link = str(o.reviewLink);
    return {
        subject: `Thank you from ${company}`,
        body: `Hi${first ? ` ${first}` : ''},\n\nThank you for choosing ${company}. We really appreciate your business.\n\nIf you have a minute, would you share your experience in a Google review? It helps other people in the area find us:\n${link}\n\nThank you,${sign ? `\n${sign}` : ''}`,
        text: `Hi${first ? ` ${first}` : ''}, thank you for choosing ${company}! If you have a minute, would you share your experience in a Google review? ${link}`,
    };
};
