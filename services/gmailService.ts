
import { Session } from "@supabase/supabase-js";

export const sendGmail = async (
  session: Session,
  to: string,
  subject: string,
  body: string,
  attachment?: { name: string; data: string; type: string }
) => {
  // Try to get the token from the active session, or fallback to localStorage
  const providerToken = session.provider_token || localStorage.getItem('google_provider_token');

  if (!providerToken) {
    throw new Error("No provider token found. Please sign in with Google again.");
  }

  const mimeMessage = createMimeMessage(to, subject, body, attachment);
  // Encode to Base64URL
  const base64EncodedEmail = btoa(mimeMessage).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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
    // If token expired (401), clear it from storage so app knows next time
    if (response.status === 401) {
        localStorage.removeItem('google_provider_token');
        throw new Error("Google session expired. Please log out and log back in.");
    }
    throw new Error(errorData.error?.message || 'Failed to send email via Gmail API');
  }

  return response.json();
};

const createMimeMessage = (to: string, subject: string, body: string, attachment?: { name: string; data: string; type: string }) => {
  const boundary = "foo_bar_baz";
  const nl = "\r\n";

  let message = "";
  message += `To: ${to}${nl}`;
  message += `Subject: ${subject}${nl}`;
  message += `MIME-Version: 1.0${nl}`;
  message += `Content-Type: multipart/mixed; boundary="${boundary}"${nl}${nl}`;

  // Body
  message += `--${boundary}${nl}`;
  message += `Content-Type: text/plain; charset="UTF-8"${nl}`;
  message += `Content-Transfer-Encoding: 7bit${nl}${nl}`;
  message += `${body}${nl}${nl}`;

  // Attachment
  if (attachment) {
    // Remove data:application/pdf;base64, prefix if present
    const base64Data = attachment.data.split(',')[1] || attachment.data;
    
    message += `--${boundary}${nl}`;
    message += `Content-Type: ${attachment.type}; name="${attachment.name}"${nl}`;
    message += `Content-Description: ${attachment.name}${nl}`;
    message += `Content-Disposition: attachment; filename="${attachment.name}"; size=${base64Data.length}${nl}`;
    message += `Content-Transfer-Encoding: base64${nl}${nl}`;
    message += `${base64Data}${nl}`;
  }

  message += `--${boundary}--`;
  return message;
};
