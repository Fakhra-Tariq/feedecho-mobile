import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrainWordCloud } from '@/components/Host/BrainWordCloud';
import { FONT_WEIGHTS } from '@/constants/theme';
import { isChoiceType, typeLabel, type WordCloudItem } from '@/utils/wordCloud';

type Question = { type?: unknown; prompt?: string; options?: unknown };

type Props = {
  open: boolean;
  onClose: () => void;
  questionIndex: number;
  questionCount: number;
  onPrev: () => void;
  onNext: () => void;
  question: Question | null | undefined;
  items: WordCloudItem[];
  extra: number;
  responseCount: number;
  shortTextMode: 'words' | 'phrases';
  onShortTextModeChange: (mode: 'words' | 'phrases') => void;
  seedKey?: string;
};

function KeepAwakeWhileOpen() {
  useKeepAwake('exit-ticket-word-cloud');
  return null;
}

export function ExitTicketWordCloudPresent({
  open,
  onClose,
  questionIndex,
  questionCount,
  onPrev,
  onNext,
  question,
  items,
  extra,
  responseCount,
  shortTextMode,
  onShortTextModeChange,
  seedKey = '',
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const showChips = !isChoiceType(question?.type);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(Boolean(v));
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => {
      setReduceMotion(Boolean(v));
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return (
    <Modal
      visible={open}
      animationType={reduceMotion ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}>
      {open ? <KeepAwakeWhileOpen /> : null}
      <StatusBar style="light" />
      <View
        style={[
          styles.root,
          {
            paddingTop:
              insets.top > 0
                ? insets.top
                : Platform.OS === 'android'
                  ? RNStatusBar.currentHeight ?? 12
                  : 12,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingLeft: Math.max(insets.left, 8),
            paddingRight: Math.max(insets.right, 8),
          },
        ]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.qTitle} numberOfLines={1}>
              Q{questionIndex + 1} · {typeLabel(question?.type)}
            </Text>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live · {responseCount} responses</Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.exitBtn, pressed && styles.exitBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Exit">
            <Text style={styles.exitLabel}>Exit</Text>
          </Pressable>
        </View>

        {showChips ? (
          <View style={styles.chips}>
            {(
              [
                { id: 'words' as const, label: 'Each word' },
                { id: 'phrases' as const, label: 'Whole answer' },
              ] as const
            ).map((opt) => {
              const active = shortTextMode === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => onShortTextModeChange(opt.id)}
                  style={[styles.chip, active && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: active }}>
                  <Text style={[styles.chipText, active && styles.chipTextOn]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.stage, { maxWidth: Math.max(0, width - 16) }]}>
          {items.length === 0 ? (
            <Text style={styles.empty}>
              No responses yet. The cloud will appear as answers come in.
            </Text>
          ) : (
            <BrainWordCloud
              items={items}
              extra={extra}
              seedKey={seedKey}
              reduceMotion={reduceMotion}
            />
          )}
        </View>

        {questionCount > 1 ? (
          <View style={styles.nav}>
            <Pressable
              onPress={onPrev}
              style={styles.navBtn}
              accessibilityRole="button"
              accessibilityLabel="Previous question">
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={onNext}
              style={styles.navBtn}
              accessibilityRole="button"
              accessibilityLabel="Next question">
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#4A1F3D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  qTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.medium,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  liveText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  exitBtn: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitBtnPressed: { backgroundColor: '#E6D2DF' },
  exitLabel: {
    color: '#4A1F3D',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  chipTextOn: { color: '#4A1F3D', fontWeight: FONT_WEIGHTS.medium },
  stage: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  navBtn: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
