import { defineStore } from './session-state';
import { ref } from 'vue';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import { useToastStore } from './toast.store';
import { i18n } from '../i18n';
import type {
  MailboxPublic,
  MailboxGetResponse,
  EmailThreadSummary,
  EmailThreadDetail,
  PaginatedThreads,
} from '@khirby/types';

const t = (key: string) => i18n.global.t(key as never);

function failMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export const useMailStore = defineStore('mail', () => {
  const mailbox = ref<MailboxPublic | null>(null);
  const googleOAuthConfigured = ref(false);
  const secretsKeyConfigured = ref(false);
  const mailboxLoading = ref(false);
  const mailboxError = ref('');
  const testStatus = ref<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const testError = ref('');

  const threads = ref<EmailThreadSummary[]>([]);
  const threadsTotal = ref(0);
  const threadsPage = ref(1);
  const threadsPageSize = ref(20);
  const threadsLoading = ref(false);
  const threadsError = ref('');
  /** Last listThreads filters — used to refresh after SSE mail events. */
  const lastListOpts = ref<{
    contactId?: string;
    leadId?: string;
    page?: number;
    pageSize?: number;
  } | null>(null);

  const threadDetails = ref<Record<string, EmailThreadDetail>>({});
  const threadLoading = ref<Record<string, boolean>>({});

  async function fetchMailbox() {
    mailboxLoading.value = true;
    mailboxError.value = '';
    try {
      const res = await apiGet<MailboxGetResponse>('/api/mail/mailbox');
      mailbox.value = res.mailbox;
      googleOAuthConfigured.value = res.googleOAuthConfigured;
      secretsKeyConfigured.value = res.secretsKeyConfigured;
    } catch (e: unknown) {
      mailboxError.value = failMessage(e, t('mail.errors.loadMailbox'));
    } finally {
      mailboxLoading.value = false;
    }
  }

  async function saveMailbox(
    payload: Partial<MailboxPublic> & {
      imapPassword?: string;
      smtpPassword?: string;
    },
  ) {
    const toast = useToastStore();
    mailboxLoading.value = true;
    mailboxError.value = '';
    try {
      mailbox.value = await apiPut<MailboxPublic>('/api/mail/mailbox', payload);
      toast.success(t('mail.toast.mailboxSaved'));
    } catch (e: unknown) {
      const msg = failMessage(e, t('mail.errors.saveMailbox'));
      mailboxError.value = msg;
      toast.error(msg);
      throw new Error(msg);
    } finally {
      mailboxLoading.value = false;
    }
  }

  async function startGoogleOAuth() {
    const toast = useToastStore();
    try {
      const res = await apiGet<{ url: string }>('/api/mail/mailbox/oauth/google/start');
      window.location.href = res.url;
    } catch (e: unknown) {
      const msg = failMessage(e, t('mail.errors.googleOAuth'));
      toast.error(msg);
      throw new Error(msg);
    }
  }

  async function disconnectGoogleOAuth() {
    const toast = useToastStore();
    mailboxLoading.value = true;
    try {
      mailbox.value = await apiPost<MailboxPublic | null>(
        '/api/mail/mailbox/oauth/google/disconnect',
        {},
      );
      toast.success(t('mail.toast.googleDisconnected'));
    } catch (e: unknown) {
      const msg = failMessage(e, t('mail.errors.googleDisconnect'));
      toast.error(msg);
      throw new Error(msg);
    } finally {
      mailboxLoading.value = false;
    }
  }

  async function testMailbox() {
    testStatus.value = 'testing';
    testError.value = '';
    try {
      await apiPost<{ imap: boolean; smtp: boolean }>('/api/mail/mailbox/test', {});
      testStatus.value = 'ok';
    } catch (e: unknown) {
      testStatus.value = 'error';
      testError.value = failMessage(e, t('mail.errors.testFailed'));
    }
  }

  async function listThreads(
    opts: {
      contactId?: string;
      leadId?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    lastListOpts.value = { ...opts };
    threadsLoading.value = true;
    threadsError.value = '';
    try {
      const params = new URLSearchParams();
      if (opts.contactId) params.set('contactId', opts.contactId);
      if (opts.leadId) params.set('leadId', opts.leadId);
      params.set('page', String(opts.page ?? 1));
      params.set('pageSize', String(opts.pageSize ?? 20));

      const res = await apiGet<PaginatedThreads>(`/api/mail/threads?${params}`);
      threads.value = res.items;
      threadsTotal.value = res.total;
      threadsPage.value = res.page;
      threadsPageSize.value = res.pageSize;
    } catch (e: unknown) {
      threadsError.value = failMessage(e, t('mail.errors.loadThreads'));
    } finally {
      threadsLoading.value = false;
    }
  }

  async function getThread(id: string) {
    threadLoading.value = { ...threadLoading.value, [id]: true };
    try {
      const detail = await apiGet<EmailThreadDetail>(`/api/mail/threads/${id}`);
      threadDetails.value = { ...threadDetails.value, [id]: detail };
      return detail;
    } catch (e: unknown) {
      throw new Error(failMessage(e, t('mail.errors.loadThread')));
    } finally {
      threadLoading.value = { ...threadLoading.value, [id]: false };
    }
  }

  async function createThread(payload: {
    contactId?: string;
    leadId?: string;
    subject: string;
    bodyText: string;
  }) {
    const toast = useToastStore();
    try {
      const result = await apiPost<{ threadId: string; messageId: string }>(
        '/api/mail/threads',
        payload,
      );
      toast.success(t('mail.toast.sent'));
      return await getThread(result.threadId);
    } catch (e: unknown) {
      const msg = failMessage(e, t('mail.errors.send'));
      toast.error(msg);
      throw new Error(msg);
    }
  }

  async function replyToThread(threadId: string, bodyText: string) {
    const toast = useToastStore();
    try {
      await apiPost<{ messageId: string }>(`/api/mail/threads/${threadId}/reply`, { bodyText });
      toast.success(t('mail.toast.sent'));
      return await getThread(threadId);
    } catch (e: unknown) {
      const msg = failMessage(e, t('mail.errors.send'));
      toast.error(msg);
      throw new Error(msg);
    }
  }

  async function deleteThread(threadId: string) {
    const toast = useToastStore();
    try {
      const result = await apiDelete<{ leadId: string | null }>(`/api/mail/threads/${threadId}`);

      const { [threadId]: _removed, ...rest } = threadDetails.value;
      threadDetails.value = rest;
      threads.value = threads.value.filter((th) => th.id !== threadId);
      threadsTotal.value = Math.max(0, threadsTotal.value - 1);

      toast.success(t('mail.toast.deleted'));
      return result;
    } catch (e: unknown) {
      const msg = failMessage(e, t('mail.errors.delete'));
      toast.error(msg);
      throw new Error(msg);
    }
  }

  /** Create contact+lead from an unknown-sender thread and refresh list/detail caches. */
  async function captureAsLead(
    threadId: string,
    payload: {
      email: string;
      name?: string;
      title?: string;
      value?: string;
      priority?: string;
      stageId?: string;
      ownerId?: string;
    },
  ) {
    const toast = useToastStore();
    try {
      const detail = await apiPost<EmailThreadDetail>(
        `/api/mail/threads/${threadId}/capture-as-lead`,
        payload,
      );
      threadDetails.value = { ...threadDetails.value, [threadId]: detail };
      const idx = threads.value.findIndex((th) => th.id === threadId);
      if (idx >= 0) {
        const next = [...threads.value];
        next[idx] = {
          ...next[idx],
          contactId: detail.contactId,
          contactEmail: detail.contactEmail,
          contactName: detail.contactName,
          leadId: detail.leadId,
          leadTitle: detail.leadTitle,
        };
        threads.value = next;
      }
      toast.success(t('mail.toast.captured'));
      return detail;
    } catch (e: unknown) {
      const msg = failMessage(e, t('mail.errors.capture'));
      toast.error(msg);
      throw new Error(msg);
    }
  }

  /** Reconcile list + open thread caches after SSE email.sent / email.received / email.deleted. */
  async function onMailEvent(data: { threadId?: string; threadDeleted?: boolean }) {
    if (data.threadDeleted && data.threadId) {
      const { [data.threadId]: _removed, ...rest } = threadDetails.value;
      threadDetails.value = rest;
      threads.value = threads.value.filter((th) => th.id !== data.threadId);
      threadsTotal.value = Math.max(0, threadsTotal.value - 1);
    }

    if (lastListOpts.value) {
      await listThreads({
        ...lastListOpts.value,
        page: lastListOpts.value.page ?? threadsPage.value,
        pageSize: lastListOpts.value.pageSize ?? threadsPageSize.value,
      });
    }
    const ids = new Set(Object.keys(threadDetails.value));
    if (data.threadId && !data.threadDeleted) ids.add(data.threadId);
    await Promise.all([...ids].map((id) => getThread(id).catch(() => undefined)));
  }

  return {
    mailbox,
    googleOAuthConfigured,
    secretsKeyConfigured,
    mailboxLoading,
    mailboxError,
    testStatus,
    testError,
    threads,
    threadsTotal,
    threadsPage,
    threadsPageSize,
    threadsLoading,
    threadsError,
    lastListOpts,
    threadDetails,
    threadLoading,
    fetchMailbox,
    saveMailbox,
    startGoogleOAuth,
    disconnectGoogleOAuth,
    testMailbox,
    listThreads,
    getThread,
    createThread,
    replyToThread,
    deleteThread,
    captureAsLead,
    onMailEvent,
  };
});
