
import { Session } from "@supabase/supabase-js";

// Helper to chunk base64 string into 76-character lines for MIME compliance
const chunkSubstr = (str: string, size: number) => {
  const numChunks = Math.ceil(str.length / size);
  const chunks = new Array(numChunks);
  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substring(o, o + size);
  }
  return chunks;
};

export const sendGmail = async (
  session: Session,
  to: string,
  subject: string,
  body: string,
  attachment: { name: string; data: string; type: string } | undefined,
  accessToken?: string,
  htmlBody?: string // NEW: Optional HTML body
) => {
  // Use provided token, or fallback to session/localStorage for legacy support
  const providerToken = accessToken || session.provider_token || localStorage.getItem('google_provider_token');

  if (!providerToken) {
    throw new Error("No provider token found. Please sign in with Google again.");
  }

  const mimeMessage = createMimeMessage(to, subject, body, attachment, htmlBody);
  // Encode to Base64URL with Unicode support
  const base64EncodedEmail = btoa(unescape(encodeURIComponent(mimeMessage))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: base64EncodedEmail
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    const errorMessage = errorData.error?.message || 'Failed to send email via Gmail API';

    // If token expired (401) or has insufficient scopes (403), throw specific error to trigger re-auth
    if (response.status === 401) {
      localStorage.removeItem('google_provider_token');
      throw new Error("GMAIL_AUTH_ERROR: Session expired");
    }
    if (response.status === 403 && (errorMessage.includes('scope') || errorMessage.includes('permission'))) {
      throw new Error("GMAIL_AUTH_ERROR: Insufficient permissions");
    }

    throw new Error(errorMessage);
  }

  return response.json();
};

const createMimeMessage = (to: string, subject: string, body: string, attachment?: { name: string; data: string; type: string }, htmlBody?: string) => {
  const boundary = "foo_bar_baz";
  const nl = "\r\n";

  let message = "";
  message += `To: ${to}${nl}`;
  message += `Subject: ${subject}${nl}`;
  message += `MIME-Version: 1.0${nl}`;
  message += `Content-Type: multipart/mixed; boundary="${boundary}"${nl}${nl}`;

  // If HTML body is provided, create multipart/alternative for both plain text and HTML
  if (htmlBody) {
    const altBoundary = "alt_boundary";
    message += `--${boundary}${nl}`;
    message += `Content-Type: multipart/alternative; boundary="${altBoundary}"${nl}${nl}`;

    // Plain text version
    message += `--${altBoundary}${nl}`;
    message += `Content-Type: text/plain; charset="UTF-8"${nl}`;
    message += `Content-Transfer-Encoding: 7bit${nl}${nl}`;
    message += `${body}${nl}${nl}`;

    // HTML version
    message += `--${altBoundary}${nl}`;
    message += `Content-Type: text/html; charset="UTF-8"${nl}`;
    message += `Content-Transfer-Encoding: 7bit${nl}${nl}`;
    message += `${htmlBody}${nl}${nl}`;

    message += `--${altBoundary}--${nl}`;
  } else {
    // Plain text only (legacy behavior)
    message += `--${boundary}${nl}`;
    message += `Content-Type: text/plain; charset="UTF-8"${nl}`;
    message += `Content-Transfer-Encoding: 7bit${nl}${nl}`;
    message += `${body}${nl}${nl}`;
  }

  // Attachment
  if (attachment) {
    // Remove data:application/pdf;base64, prefix if present to get raw base64
    const base64Data = attachment.data.split(',')[1] || attachment.data;

    // Split into 76-char lines
    const chunkedData = chunkSubstr(base64Data, 76).join(nl);

    message += `--${boundary}${nl}`;
    message += `Content-Type: ${attachment.type}; name="${attachment.name}"${nl}`;
    message += `Content-Description: ${attachment.name}${nl}`;
    message += `Content-Disposition: attachment; filename="${attachment.name}"${nl}`;
    message += `Content-Transfer-Encoding: base64${nl}${nl}`;
    message += `${chunkedData}${nl}`;
  }

  message += `--${boundary}--`;
  return message;
};
