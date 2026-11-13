import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardSafeScreen } from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { getQuizEditorTypeParam } from '@/lib/aiGeneratedQuiz';
import {
  COPY_PASTE_PLACEHOLDERS,
  ensureQuestionIds,
  parsePastedQuizContent,
} from '@/lib/copyPasteQuiz';
import { getQuizTypeMismatchError } from '@/lib/detectQuizContentType';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';

const QUESTION_TYPES = [
  { title: 'Multiple Choice', emoji: '🔘' },
  { title: 'True / False', emoji: '✓' },
  { title: 'Short Answer', emoji: '📝' },
  { title: 'Mixed Type', emoji: '🎯' },
] as const;

export default function CopyPasteQuizScreen() {
  const insets = useSafeAreaInsets();
  const [selectedType, setSelectedType] = useState('Multiple Choice');
  const [pastedContent, setPastedContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');

  const goBack = () => router.back();
  const createEnabled = Boolean(pastedContent.trim()) && !isCreating;
  const placeholder =
    COPY_PASTE_PLACEHOLDERS[selectedType] || 'Paste your quiz content here...';

  const onCreateQuiz = async () => {
    if (!pastedContent.trim()) {
      setErrorDetail('Please paste some content before creating a quiz.');
      return;
    }

    const mismatchError = getQuizTypeMismatchError(pastedContent, selectedType, 'pasted');
    if (mismatchError) {
      setErrorDetail(mismatchError);
      return;
    }

    setIsCreating(true);
    setErrorDetail('');

    try {
      const parsedQuestions = parsePastedQuizContent(pastedContent, selectedType);

      if (parsedQuestions.length === 0) {
        setErrorDetail(
          'Could not parse any questions from the pasted content. Please check the format and try again.'
        );
        setIsCreating(false);
        return;
      }

      const quiz = {
        id: Date.now(),
        title: `Copy & Paste Quiz - ${selectedType}`,
        type: selectedType,
        questions: ensureQuestionIds(parsedQuestions),
        questionCount: parsedQuestions.length,
        createdDate: new Date().toISOString(),
        status: 'Draft',
        launched: false,
        isFromPaste: true,
      };

      await AsyncStorage.setItem('editingQuiz', JSON.stringify(quiz));
      router.push(`/host/quiz/create/${getQuizEditorTypeParam(selectedType)}` as Href);
    } catch {
      setErrorDetail('An error occurred while creating the quiz. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <KeyboardSafeScreen
      scroll={false}
      style={[
        styles.screen,
        { paddingBottom: TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 8) },
      ]}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerBadge}>
              <Ionicons name="document-text-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.headerTitle}>Create Quiz by Copy & Paste</Text>
          </View>
          <Pressable
            onPress={goBack}
            hitSlop={8}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={COLORS.iconMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}>
          <Text style={styles.label}>Select Question Type</Text>
          <View style={styles.typeGrid}>
            {QUESTION_TYPES.map((type) => {
              const selected = selectedType === type.title;
              return (
                <Pressable
                  key={type.title}
                  onPress={() => setSelectedType(type.title)}
                  style={[styles.typeCard, selected && styles.typeCardOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}>
                  <Text style={styles.typeEmoji}>{type.emoji}</Text>
                  <Text style={styles.typeLabel}>{type.title}</Text>
                  {selected ? (
                    <View style={styles.typeTick}>
                      <Ionicons name="checkmark" size={10} color={COLORS.white} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Paste Content</Text>
          <TextInput
            value={pastedContent}
            onChangeText={(value) => {
              setPastedContent(value);
              if (errorDetail) setErrorDetail('');
            }}
            placeholder={placeholder}
            placeholderTextColor={COLORS.iconMuted}
            multiline
            textAlignVertical="top"
            scrollEnabled
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.textarea}
            accessibilityLabel="Paste Content"
          />
          <Text style={styles.hint}>Follow the format shown in the placeholder for best results</Text>

          {errorDetail ? <Text style={styles.errorText}>{errorDetail}</Text> : null}

          {pastedContent.trim() ? (
            <View style={styles.detectedBox}>
              <Ionicons name="alert-circle" size={20} color="#2563EB" />
              <View style={styles.detectedCopy}>
                <Text style={styles.detectedTitle}>Content Detected</Text>
                <Text style={styles.detectedBody}>
                  Your content will be parsed as {selectedType} questions. Review and edit the
                  generated quiz after creation.
                </Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={goBack} style={styles.cancelBtn} accessibilityRole="button">
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onCreateQuiz}
            disabled={!createEnabled}
            style={[styles.createBtn, !createEnabled && styles.createBtnDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !createEnabled }}>
            {isCreating ? (
              <>
                <ActivityIndicator color={COLORS.white} size="small" />
                <Text style={styles.createLabel}>Creating...</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color={COLORS.white} />
                <Text style={styles.createLabel}>Create Quiz</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING[4],
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    ...SHADOWS.raised,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[4],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    gap: SPACING[3],
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    minWidth: 0,
  },
  headerBadge: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: SPACING[5],
    paddingBottom: SPACING[6],
  },
  label: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    marginBottom: SPACING[3],
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[3],
    marginBottom: SPACING[6],
  },
  typeCard: {
    width: '47%',
    flexGrow: 0,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
    paddingVertical: SPACING[4],
    paddingHorizontal: SPACING[3],
    alignItems: 'center',
    minHeight: 96,
  },
  typeCardOn: {
    borderWidth: 3,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.blush,
    ...SHADOWS.raised,
  },
  typeEmoji: {
    fontSize: 24,
    marginBottom: SPACING[2],
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    textAlign: 'center',
  },
  typeTick: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textarea: {
    minHeight: 256,
    maxHeight: 256,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    backgroundColor: COLORS.white,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  hint: {
    marginTop: SPACING[2],
    fontSize: 12,
    color: COLORS.darkTextSecondary,
  },
  errorText: {
    marginTop: SPACING[3],
    fontSize: 13,
    color: COLORS.dangerText,
  },
  detectedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[3],
    marginTop: SPACING[4],
    padding: SPACING[4],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  detectedCopy: { flex: 1 },
  detectedTitle: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#1E3A8A',
  },
  detectedBody: {
    fontSize: 12,
    color: '#1D4ED8',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[4],
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    backgroundColor: COLORS.mutedSoft,
    gap: SPACING[3],
  },
  cancelBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING[2],
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[6],
    minHeight: 44,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createLabel: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 15,
  },
});
