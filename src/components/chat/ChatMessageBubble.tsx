import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatResourceCard } from '@/components/chat/ChatResourceCard';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import type { ChatMessage } from '@/lib/anonymousChat';

/** Fixed `h:mm A` (e.g. 1:39 AM) — not device locale. */
export function formatChatMessageTime(timestamp?: string) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hour24 = date.getHours();
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minutes} ${period}`;
}

function writingDirectionFor(label: string): 'ltr' | 'rtl' | undefined {
  const first = String(label || '').match(/[^\s]/)?.[0];
  if (!first) return undefined;
  return /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.test(first) ? 'rtl' : 'ltr';
}

type Props = {
  message: ChatMessage;
  isOwn: boolean;
  label: string;
  showStudentDot?: boolean;
  namedSender?: boolean;
  isGuest?: boolean;
  onDownloadResource?: (message: ChatMessage) => Promise<void> | void;
};

function ChatMessageBubbleInner({
  message,
  isOwn,
  label,
  showStudentDot = false,
  namedSender = false,
  isGuest = false,
  onDownloadResource,
}: Props) {
  const text = message?.content || message?.message || '';
  const isHidden = Boolean(message?.isHidden);
  const isAnswered = Boolean(message?.isAnswered);
  const isResource = message?.type === 'resource';

  return (
    <View style={[styles.row, isOwn ? styles.rowEnd : styles.rowStart]}>
      <View style={styles.bubbleWrap}>
        <View
          style={[
            styles.labelRow,
            isOwn ? styles.rowEnd : styles.rowStart,
          ]}>
          {showStudentDot ? <View style={styles.dot} /> : null}
          <Text
            style={[
              styles.label,
              namedSender && styles.labelNamed,
              { writingDirection: writingDirectionFor(label) },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail">
            {label}
          </Text>
        </View>

        {isResource ? (
          <ChatResourceCard
            message={message}
            onDownload={onDownloadResource}
            isGuest={isGuest}
          />
        ) : (
          <View
            style={[
              styles.bubble,
              isOwn ? styles.bubbleOwn : styles.bubbleOther,
              !isOwn && isHidden && styles.bubbleHidden,
              !isOwn && isAnswered && styles.bubbleAnswered,
            ]}>
            <Text style={[styles.text, isOwn && styles.textOwn, isHidden && styles.textHidden]}>
              {text}
            </Text>
          </View>
        )}

        <View style={[styles.metaRow, isOwn ? styles.rowEnd : styles.rowStart]}>
          <Text style={styles.time}>{formatChatMessageTime(message?.timestamp)}</Text>
          {isAnswered && !isOwn ? <Text style={styles.answered}>✓ Answered</Text> : null}
        </View>
      </View>
    </View>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleInner);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: SPACING[3] },
  rowStart: { justifyContent: 'flex-start' },
  rowEnd: { justifyContent: 'flex-end' },
  bubbleWrap: { maxWidth: '80%', minWidth: 0 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    maxWidth: '100%',
    minWidth: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.mutedPurple,
    flexShrink: 0,
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.darkTextSecondary,
  },
  labelNamed: {
    color: '#6B3A5C',
    fontWeight: FONT_WEIGHTS.medium,
  },
  bubble: {
    paddingHorizontal: SPACING[4],
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleOwn: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: 'rgba(109,65,95,0.1)',
    borderBottomLeftRadius: 6,
  },
  bubbleHidden: {
    backgroundColor: 'rgba(244,241,236,0.6)',
  },
  bubbleAnswered: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.successBorder,
  },
  text: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  textOwn: { color: COLORS.white },
  textHidden: { textDecorationLine: 'line-through', color: COLORS.darkTextSecondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  time: { fontSize: 11, color: COLORS.darkTextSecondary },
  answered: { fontSize: 11, color: COLORS.successAccent, fontWeight: FONT_WEIGHTS.medium },
});
