import { useEffect, useMemo, useState } from 'react';
import { get, ref as dbRef } from 'firebase/database';

import { db } from '../../firebaseConfig';
import type { ActivityItem } from '@/lib/studentsActivity';

/** Module cache shared by Home and Progress. Empty string = fetched, no usable title. */
const titleCache = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();
const cacheListeners = new Set<() => void>();
let loggedShape = false;

function notifyTitleCache() {
  cacheListeners.forEach((fn) => fn());
}

function visibleTitle(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null' || text === '—') return '';
  return text;
}

export function isGenericExitTicketTitle(value: unknown) {
  const text = visibleTitle(value);
  return !text || text === 'Exit Ticket';
}

export function activityTicketId(item: ActivityItem) {
  return String(item.ticketId || '').trim();
}

export function resolveExitTicketActivityTitle(
  item: ActivityItem,
  titles: Record<string, string> = {}
) {
  if (item.type !== 'exitTicket') return visibleTitle(item.title);
  const own =
    visibleTitle(item.title) || visibleTitle((item as { ticketTitle?: unknown }).ticketTitle);
  if (own && own !== 'Exit Ticket') return own;
  const ticketId = activityTicketId(item);
  const fetched = ticketId ? visibleTitle(titles[ticketId] ?? titleCache.get(ticketId)) : '';
  return fetched || 'Exit Ticket';
}

/** Seed the shared cache at submit so Home and Progress show the snapshot immediately. */
export function rememberExitTicketTitle(ticketId: string, title: unknown) {
  const id = String(ticketId || '').trim();
  const text = visibleTitle(title);
  if (!id || !text) return;
  titleCache.set(id, text);
  notifyTitleCache();
}

function uniqueTicketIdsNeedingTitle(items: ActivityItem[]) {
  const ids: string[] = [];
  items.forEach((item) => {
    if (item.type !== 'exitTicket') return;
    if (!isGenericExitTicketTitle(item.title)) return;
    const id = activityTicketId(item);
    if (!id || ids.includes(id)) return;
    ids.push(id);
  });
  return ids;
}

async function readTicketTitle(ticketId: string) {
  const snap = await get(dbRef(db, `exit_tickets/${ticketId}`));
  if (!snap.exists()) return '';
  return visibleTitle((snap.val() as { title?: unknown } | null)?.title);
}

/**
 * Display-only titles for exit-ticket activity rows.
 * One RTDB get per unique ticket id; no listeners; shared module cache.
 */
export function useExitTicketActivityTitles(items: ActivityItem[]) {
  const [version, setVersion] = useState(0);
  const idsKey = uniqueTicketIdsNeedingTitle(items).join(',');

  useEffect(() => {
    const onChange = () => setVersion((n) => n + 1);
    cacheListeners.add(onChange);
    return () => {
      cacheListeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (__DEV__ && !loggedShape) {
      const sample = items.find((item) => item.type === 'exitTicket');
      if (sample) {
        loggedShape = true;
        console.log('[ExitTicket activity record]', {
          keys: Object.keys(sample),
          ticketId: sample.ticketId,
          title: sample.title,
          type: sample.type,
          id: sample.id,
        });
      }
    }
  }, [items]);

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',').filter(Boolean) : [];
    ids.forEach((ticketId) => {
      if (titleCache.has(ticketId) || inflight.has(ticketId)) return;
      const request = readTicketTitle(ticketId)
        .then((title) => {
          titleCache.set(ticketId, title);
        })
        .catch(() => {
          titleCache.set(ticketId, '');
        })
        .finally(() => {
          inflight.delete(ticketId);
          notifyTitleCache();
        });
      inflight.set(ticketId, request);
    });
  }, [idsKey]);

  return useMemo(() => {
    const out: Record<string, string> = {};
    titleCache.forEach((title, id) => {
      out[id] = title;
    });
    return out;
  }, [version, idsKey]);
}
