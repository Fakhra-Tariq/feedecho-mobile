import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, SHADOWS, SPACING } from '@/constants/theme';
import {
  buildEditingQuizFromAiResponse,
  isPromptInvalid,
  isUsableAiQuizResponse,
} from '@/lib/aiGeneratedQuiz';
import { generateAiQuiz } from '@/lib/hostQuizzes';

const QUESTION_TYPE_OPTIONS = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'trueFalse', label: 'True/false' },
  { value: 'shortAnswer', label: 'Short answer' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const PROMPT_REQUIRED_MSG = 'Please enter a prompt describing what your quiz should cover.';
const GENERATE_FAILED_MSG =
  "Couldn't generate a quiz from that prompt. Try describing a specific topic.";

type Props = {
  visible: boolean;
  onClose: () => void;
  onGenerated: (quiz: any) => void;
};

export function AiQuizGeneratorModal({ visible, onClose, onGenerated }: Props) {
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState('');
  const [questionTypes, setQuestionTypes] = useState(['mcq', 'trueFalse', 'shortAnswer']);
  const [difficulty, setDifficulty] = useState('medium');
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);

  const toggleType = (value: string) => {
    setTypeError(null);
    setQuestionTypes((prev) => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== value);
      }
      return [...prev, value];
    });
  };

  const handleGenerate = async () => {
    if (generating) return;
    if (isPromptInvalid(prompt)) {
      setError(PROMPT_REQUIRED_MSG);
      return;
    }
    if (!questionTypes.length) {
      setTypeError('Please select at least one question type.');
      return;
    }

    const count = Math.min(50, Math.max(1, Number(numberOfQuestions) || 5));
    setNumberOfQuestions(count);
    setGenerating(true);
    setError(null);
    setTypeError(null);

    try {
      const payload = await generateAiQuiz({
        prompt: prompt.trim(),
        questionTypes,
        difficulty,
        numberOfQuestions: count,
      });
      const data = payload?.data;
      if (!payload?.success || data?.error || payload?.error || !isUsableAiQuizResponse(data)) {
        setError(GENERATE_FAILED_MSG);
        return;
      }
      onGenerated(buildEditingQuizFromAiResponse(data));
      onClose();
    } catch {
      setError(GENERATE_FAILED_MSG);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardSafeScreen variant="modal" scroll={false} style={styles.screen}>
        <View
          style={[
            styles.sheetWrap,
            {
              paddingTop: Math.max(insets.top, SPACING[3]),
              paddingBottom: Math.max(insets.bottom, SPACING[3]),
            },
          ]}>
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>AI quiz assistant</Text>
                <Text style={styles.subtitle}>Describe what your quiz should cover.</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={COLORS.iconMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />

            <ScrollView
              style={styles.body}
              contentContainerStyle={[styles.content, { paddingBottom: KEYBOARD_BOTTOM_GAP }]}
              {...KEYBOARD_SCROLL_PROPS}>
              <Text style={styles.label}>Prompt</Text>
              <TextInput
                value={prompt}
                onChangeText={(value) => {
                  setPrompt(value);
                  if (!isPromptInvalid(value)) setError(null);
                }}
                placeholder="e.g. Object-oriented programming: classes, objects, inheritance and polymorphism"
                placeholderTextColor={COLORS.darkTextSecondary}
                multiline
                style={styles.prompt}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Text style={styles.label}>Question type</Text>
              <View style={styles.typeList}>
                {QUESTION_TYPE_OPTIONS.map((option) => {
                  const active = questionTypes.includes(option.value);
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={styles.typeRow}
                      onPress={() => toggleType(option.value)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: active }}>
                      <View style={[styles.checkbox, active && styles.checkboxChecked]}>
                        {active ? (
                          <Ionicons name="checkmark" size={14} color={COLORS.white} />
                        ) : null}
                      </View>
                      <Text style={styles.typeLabel}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {typeError ? <Text style={styles.error}>{typeError}</Text> : null}

              <Text style={styles.label}>Difficulty</Text>
              <View style={styles.chips}>
                {DIFFICULTY_OPTIONS.map((option) => {
                  const active = difficulty === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setDifficulty(option.value)}>
                      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Number of questions</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setNumberOfQuestions((n) => Math.max(1, n - 1))}>
                  <Text style={styles.stepLabel}>-</Text>
                </TouchableOpacity>
                <TextInput
                  value={String(numberOfQuestions)}
                  onChangeText={(value) => {
                    const parsed = Number.parseInt(value, 10);
                    if (!Number.isNaN(parsed)) setNumberOfQuestions(parsed);
                    if (value === '') setNumberOfQuestions(1);
                  }}
                  keyboardType="number-pad"
                  style={styles.countInput}
                />
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setNumberOfQuestions((n) => Math.min(50, n + 1))}>
                  <Text style={styles.stepLabel}>+</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.divider} />
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.generate, generating && styles.disabled]}
                onPress={handleGenerate}
                disabled={generating}>
                {generating ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.generateLabel}>Generate</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardSafeScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  sheetWrap: {
    flex: 1,
    paddingHorizontal: SPACING[4],
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: 'hidden',
    ...SHADOWS.raised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING[3],
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[5],
    paddingBottom: SPACING[4],
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: FONT_WEIGHTS.bold },
  subtitle: {
    marginTop: 4,
    color: COLORS.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
  body: { flex: 1 },
  content: { padding: SPACING[5], gap: SPACING[3] },
  label: { color: COLORS.text, fontWeight: FONT_WEIGHTS.semibold, marginTop: SPACING[2] },
  prompt: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    padding: SPACING[4],
    textAlignVertical: 'top',
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  error: { color: COLORS.dangerText },
  typeList: { gap: SPACING[2] },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    minHeight: 44,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderRadius: 999,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeLabel: { color: COLORS.text, fontWeight: FONT_WEIGHTS.medium, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    backgroundColor: COLORS.white,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipLabel: { color: COLORS.text },
  chipLabelActive: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { color: COLORS.white, fontSize: 22, fontWeight: FONT_WEIGHTS.bold },
  countInput: {
    width: 72,
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    textAlign: 'center',
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  footer: {
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[4],
  },
  generate: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.semibold, fontSize: 16 },
  disabled: { opacity: 0.7 },
});
