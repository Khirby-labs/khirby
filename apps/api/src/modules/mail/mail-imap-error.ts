/** ImapFlow often throws Error with only "Command failed" — pull responseText/command. */
export function formatImapError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as {
    message?: string;
    responseText?: string;
    response?: string;
    executedCommand?: string;
    code?: string;
  };
  const parts = [e.message ?? 'IMAP error'];
  if (e.responseText) parts.push(e.responseText);
  else if (e.response) parts.push(String(e.response));
  if ((e as { reason?: string }).reason) parts.push(String((e as { reason?: string }).reason));
  if (e.executedCommand) parts.push(`cmd=${e.executedCommand}`);
  if (e.code) parts.push(`code=${e.code}`);
  return parts.join(' | ');
}
