import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityCreatedModal } from '@/components/ActivityCreatedModal';
import { AiQuizGeneratorModal } from '@/components/AiQuizGeneratorModal';
import { showAlert } from '@/components/feedback';
import { cleanErrorMessage } from '@/lib/activeActivity';
import { CreateSessionModal } from '@/components/CreateSessionModal';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { useHostSessions } from '@/context/HostSessionContext';
import { getQuizEditorTypeParam } from '@/lib/aiGeneratedQuiz';
import { getSessionActivityLabel } from '@/lib/sessionActivityLabel';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';

const HOW_IT_WORKS_STEPS = [
  'Build your quiz (AI, blank, import, or copy-paste)',
  "Choose Save as Draft (to launch later) or Launch (to send it live now)",
  "Launching requires an active session — create one first if you don't have one.",
] as const;

const LAUNCH_OPTIONS = [
  {
    key: 'ai',
    title: 'AI Quiz Generator',
    description: 'Draft questions from a topic in seconds.',
    icon: 'sparkles-outline' as const,
  },
  {
    key: 'blank',
    title: 'Blank Quiz',
    description: 'Start fresh with your own structure and settings.',
    icon: 'clipboard-outline' as const,
  },
  {
    key: 'import',
    title: 'Import Quiz',
    description: 'Upload docs or spreadsheets to convert content.',
    icon: 'cloud-upload-outline' as const,
  },
  {
    key: 'paste',
    title: 'Copy-Paste Quiz',
    description: "Paste raw questions and we'll organize them.",
    icon: 'pencil-outline' as const,
  },
] as const;

const QUESTION_TYPES = [
  { key: 'multiple-choice', title: 'Multiple Choice', icon: 'list-outline' as const },
  { key: 'true-false', title: 'True / False', icon: 'swap-horizontal-outline' as const },
  { key: 'short-answer', title: 'Short Answer', icon: 'create-outline' as const },
] as const;

const HERO_PLUM = '#6D415F';
const HERO_BROWN = '#3A2E2A';
const CARD_BORDER = 'rgba(109, 65, 95, 0.15)';
const BANNER_BORDER = 'rgba(109, 65, 95, 0.2)';
const BANNER_BG = '#F1E5EB';

export default function QuizHubScreen() {
  const insets = useSafeAreaInsets();
  const { activeSession, createSession, quizzes } = useHostSessions();

  const [showAi, setShowAi] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showStructure, setShowStructure] = useState(false);
  const [showQuestionType, setShowQuestionType] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('Multiple Choice');
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [createdCode, setCreatedCode] = useState('');

  const isActive = Boolean(activeSession);
  const sessionCode = String(activeSession?.sessionCode || '')
    .trim()
    .toUpperCase();
  const activityLabel = getSessionActivityLabel(activeSession?.currentActivity, quizzes);

  const onCreateSession = useCallback(async () => {
    if (!sessionName.trim()) {
      showAlert({
        type: 'warning',
        title: 'Session name required',
        message: 'Enter a session name.',
        primary: { label: 'Close' },
      });
      return;
    }
    setCreatingSession(true);
    try {
      const session = await createSession(sessionName.trim());
      setShowCreateSession(false);
      setSessionName('');
      setCreatedCode(session.sessionCode);
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Could not create session',
        message: cleanErrorMessage(error, 'Failed to create session'),
        primary: { label: 'Close' },
      });
    } finally {
      setCreatingSession(false);
    }
  }, [createSession, sessionName]);

  const onSelectOption = (key: (typeof LAUNCH_OPTIONS)[number]['key']) => {
    if (key === 'ai') {
      setShowAi(true);
      return;
    }
    if (key === 'blank') {
      setShowStructure(true);
      return;
    }
    if (key === 'import') {
      router.push('/host/quiz/import' as Href);
      return;
    }
    if (key === 'paste') {
      router.push('/host/quiz/copy-paste' as Href);
    }
  };

  const onStructureSelect = (structure: 'single-type' | 'mixed-type') => {
    setShowStructure(false);
    if (structure === 'mixed-type') {
      router.push('/host/quiz/create/mixed-type' as Href);
      return;
    }
    setSelectedType('Multiple Choice');
    setShowQuestionType(true);
  };

  const onQuestionTypeContinue = () => {
    setShowQuestionType(false);
    if (selectedType === 'Multiple Choice') {
      router.push('/host/quiz/create/multiple-choice' as Href);
    } else if (selectedType === 'True / False') {
      router.push('/host/quiz/create/true-false' as Href);
    } else if (selectedType === 'Short Answer') {
      router.push('/host/quiz/create/short-answer' as Href);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_CONTENT_HEIGHT + insets.bottom + SPACING[8] },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Session banner — same conditions as Web SessionLaunchBanner */}
        <View style={styles.banner} accessibilityRole="text">
          {isActive ? (
            <>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
              <Text style={styles.bannerText}>
                Launching to session:{' '}
                <Text style={styles.bannerCode}>{sessionCode || '—'}</Text>
                {' · '}
                {activityLabel}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="warning-outline" size={16} color={COLORS.primary} />
              <Text style={styles.bannerText}>
                {"You'll need an active session to launch this. "}
                <Text
                  style={styles.bannerLink}
                  onPress={() => setShowCreateSession(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Create Session">
                  Create Session
                </Text>
              </Text>
            </>
          )}
        </View>

        {/* Hero — Web PageHeaderCard colors */}
        <View style={styles.hero}>
          <View style={styles.heroBrownWash} pointerEvents="none" />
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>Create a New Quiz</Text>
            <Pressable
              onPress={() => setShowHowItWorks(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.howItWorks, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="How it works">
              <Ionicons name="help-circle-outline" size={16} color="rgba(255,255,255,0.9)" />
              <Text style={styles.howItWorksText}>How it works</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </View>
          <Text style={styles.heroSubtitle}>{"Choose how you'd like to build your next quiz"}</Text>
        </View>

        {/* 2×2 option grid */}
        <View style={styles.grid}>
          {[0, 1].map((row) => (
            <View key={row} style={styles.gridRow}>
              {LAUNCH_OPTIONS.slice(row * 2, row * 2 + 2).map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => onSelectOption(option.key)}
                  style={({ pressed }) => [styles.optionCard, pressed && styles.optionPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.title}, Create`}>
                  <View style={styles.optionIcon}>
                    <Ionicons name={option.icon} size={20} color={COLORS.white} />
                  </View>
                  <Text style={styles.optionTitle}>{option.title}</Text>
                  <Text style={styles.optionDesc}>{option.description}</Text>
                  <View style={styles.optionCtaWrap}>
                    <View style={styles.optionCta}>
                      <Text style={styles.optionCtaLabel}>Create</Text>
                      <Ionicons name="arrow-forward" size={14} color={COLORS.white} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <AiQuizGeneratorModal
        visible={showAi}
        onClose={() => setShowAi(false)}
        onGenerated={async (quiz) => {
          await AsyncStorage.setItem('editingQuiz', JSON.stringify(quiz));
          setShowAi(false);
          router.push(`/host/quiz/create/${getQuizEditorTypeParam(quiz.type)}` as Href);
        }}
      />

      {/* How it works — Web InfoRecap modal */}
      <Modal
        visible={showHowItWorks}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHowItWorks(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowHowItWorks(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="help-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.modalTitle}>How this works</Text>
              </View>
              <Pressable
                onPress={() => setShowHowItWorks(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={COLORS.iconMuted} />
              </Pressable>
            </View>
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <Text key={step} style={styles.stepLine}>
                {index + 1}. {step}
              </Text>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Blank Quiz — structure (Web QuizStructureModal) */}
      <Modal
        visible={showStructure}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStructure(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowStructure(false)}>
          <Pressable style={styles.modalCardWide} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.structureHeading}>Choose Quiz Structure</Text>
            <Text style={styles.structureSub}>Select how you want to structure your quiz</Text>
            <Pressable
              style={({ pressed }) => [styles.structureOption, pressed && styles.pressed]}
              onPress={() => onStructureSelect('single-type')}
              accessibilityRole="button"
              accessibilityLabel="Single-type quiz">
              <View style={styles.structureIcon}>
                <Ionicons name="document-text-outline" size={28} color={COLORS.white} />
              </View>
              <View style={styles.structureCopy}>
                <Text style={styles.structureTitle}>Single-type quiz</Text>
                <Text style={styles.structureDesc}>
                  Create a quiz with only one question type (MCQ, True/False, Short Answer, or Long
                  Answer)
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={COLORS.primary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.structureOption, pressed && styles.pressed]}
              onPress={() => onStructureSelect('mixed-type')}
              accessibilityRole="button"
              accessibilityLabel="Mixed-type quiz">
              <View style={styles.structureIcon}>
                <Ionicons name="layers-outline" size={28} color={COLORS.white} />
              </View>
              <View style={styles.structureCopy}>
                <Text style={styles.structureTitle}>Mixed-type quiz</Text>
                <Text style={styles.structureDesc}>
                  Create a quiz with multiple question types in the same quiz
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={COLORS.primary} />
            </Pressable>
            <Pressable
              onPress={() => setShowStructure(false)}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel">
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Blank single-type — question type (Web QuestionTypeModal) */}
      <Modal
        visible={showQuestionType}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuestionType(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowQuestionType(false)}>
          <Pressable style={styles.modalCardWide} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.structureHeading}>Choose Question Type</Text>
            <Text style={styles.structureSub}>Select one question type to continue</Text>
            <View style={styles.typeGrid}>
              {QUESTION_TYPES.map((type) => {
                const selected = selectedType === type.title;
                return (
                  <Pressable
                    key={type.key}
                    onPress={() => setSelectedType(type.title)}
                    style={[styles.typeCard, selected && styles.typeCardSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={type.title}>
                    <Ionicons
                      name={type.icon}
                      size={26}
                      color={selected ? COLORS.primary : COLORS.inkSecondary}
                    />
                    <Text style={styles.typeTitle}>{type.title}</Text>
                    {selected ? (
                      <View style={styles.typeCheck}>
                        <Ionicons name="checkmark" size={12} color={COLORS.white} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.typeActions}>
              <Pressable
                onPress={() => setShowQuestionType(false)}
                style={styles.cancelBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel">
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onQuestionTypeContinue}
                style={({ pressed }) => [styles.continueBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Continue">
                <Text style={styles.continueLabel}>Continue</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <CreateSessionModal
        visible={showCreateSession}
        title="Create Session"
        value={sessionName}
        onChangeText={setSessionName}
        onCancel={() => {
          setShowCreateSession(false);
          setSessionName('');
        }}
        onSubmit={onCreateSession}
        submitting={creatingSession}
      />

      <ActivityCreatedModal
        visible={Boolean(createdCode)}
        title="Session Created!"
        code={createdCode}
        onClose={() => setCreatedCode('')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    gap: SPACING[4],
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: BANNER_BG,
    borderWidth: 1,
    borderColor: BANNER_BORDER,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
  },
  bannerText: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: FONT_WEIGHTS.regular,
  },
  bannerCode: {
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 1,
  },
  bannerLink: {
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#6D415F',
    textDecorationLine: 'underline',
  },
  hero: {
    backgroundColor: HERO_PLUM,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(109, 65, 95, 0.3)',
    padding: SPACING[5],
    overflow: 'hidden',
    ...SHADOWS.raised,
  },
  heroBrownWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HERO_BROWN,
    opacity: 0.35,
    left: '35%',
    top: '25%',
  },
  heroTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING[3],
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: FONT_WEIGHTS.bold,
  },
  howItWorks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
  },
  howItWorksText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.medium,
  },
  heroSubtitle: {
    marginTop: SPACING[1],
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    gap: 10,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  optionCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 12,
    backgroundColor: '#F8F3F6',
    ...SHADOWS.card,
  },
  optionPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
  },
  optionTitle: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  optionDesc: {
    color: COLORS.darkTextSecondary,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  optionCtaWrap: {
    marginTop: 12,
  },
  optionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    minHeight: 44,
    paddingHorizontal: SPACING[3],
  },
  optionCtaLabel: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  pressed: { opacity: 0.85 },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SPACING[4],
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[5],
    ...SHADOWS.raised,
  },
  modalCardWide: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: SPACING[6],
    ...SHADOWS.raised,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: SPACING[4],
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  stepLine: {
    fontSize: 14,
    lineHeight: 22,
    color: '#5A4A55',
    marginBottom: SPACING[2],
  },
  structureHeading: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING[1],
  },
  structureSub: {
    fontSize: 13,
    color: COLORS.darkTextSecondary,
    textAlign: 'center',
    marginBottom: SPACING[5],
  },
  structureOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    borderWidth: 2,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    marginBottom: SPACING[3],
    backgroundColor: COLORS.surfaceMuted,
    minHeight: 44,
  },
  structureIcon: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  structureCopy: { flex: 1, minWidth: 0 },
  structureTitle: {
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    marginBottom: 4,
  },
  structureDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.darkTextSecondary,
  },
  cancelBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[4],
  },
  cancelLabel: {
    color: COLORS.darkTextSecondary,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 15,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: SPACING[2],
    marginBottom: SPACING[5],
  },
  typeCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.divider,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING[4],
    paddingHorizontal: SPACING[2],
    backgroundColor: COLORS.surfaceMuted,
    minHeight: 100,
  },
  typeCardSelected: {
    borderColor: 'rgba(109, 65, 95, 0.4)',
    backgroundColor: 'rgba(109, 65, 95, 0.08)',
  },
  typeTitle: {
    marginTop: SPACING[2],
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
    textAlign: 'center',
  },
  typeCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[3],
  },
  continueBtn: {
    backgroundColor: '#6D415F',
    borderRadius: RADIUS.full,
    minHeight: 44,
    paddingHorizontal: SPACING[8],
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueLabel: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 15,
  },
});
