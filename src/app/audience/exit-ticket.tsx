import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { showAlert } from '@/components/feedback';
import { cleanErrorMessage } from '@/lib/activeActivity';
import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useLeaveActivity } from '@/lib/audienceHomeNavigation';
import {
  getExitTicketByCode,
  LIKERT_OPTIONS,
  submitExitTicketResponse,
  type ExitTicket,
} from '@/lib/hostExitTickets';

const SESSION_CODE_KEY = 'sessionCode';
const STUDENT_NAME_KEY = 'studentName';
const MAX_CHARS = 500;

export default function AudienceExitTicketScreen() {
  const { profile } = useAuth();
  const { leave } = useLeaveActivity();
  const params = useLocalSearchParams<{ code?: string }>();
  const [joinCode, setJoinCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [ticket, setTicket] = useState<ExitTicket | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const fromParam = String(params.code || '')
        .trim()
        .toUpperCase();
      if (fromParam) {
        setJoinCode(fromParam);
        setCodeInput(fromParam);
        return;
      }
      const stored = await AsyncStorage.getItem(SESSION_CODE_KEY);
      if (stored) {
        const normalized = stored.trim().toUpperCase();
        setJoinCode(normalized);
        setCodeInput(normalized);
      }
    })();
  }, [params.code]);

  useEffect(() => {
    if (!joinCode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getExitTicketByCode(joinCode);
        if (cancelled) return;
        if (!response.success || !response.data) {
          throw new Error(response.error || 'Invalid or inactive Exit Ticket code');
        }
        setTicket(response.data);
        const initial: Record<number, string> = {};
        response.data.questions?.forEach((_, index) => {
          initial[index] = '';
        });
        setAnswers(initial);
      } catch (err) {
        if (!cancelled) {
          setTicket(null);
          setError(err instanceof Error ? err.message : 'Failed to load exit ticket');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  const setAnswer = (index: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [index]: value }));
  };

  const onJoin = () => {
    const normalized = codeInput.trim().toUpperCase();
    if (normalized.length !== 6) {
      setError('Enter a 6-character code');
      return;
    }
    setJoinCode(normalized);
  };

  const onSubmit = async () => {
    if (!ticket || submitting) return;
    const studentName =
      (await AsyncStorage.getItem(STUDENT_NAME_KEY))?.trim() || profile?.name?.trim() || '';
    if (!studentName) {
      showAlert({
        type: 'warning',
        title: 'Name required',
        message: 'Join the session with your name first.',
        primary: { label: 'Close' },
      });
      router.replace('/join' as Href);
      return;
    }

    const unanswered = ticket.questions?.filter((_, index) => !answers[index]?.trim());
    if (unanswered?.length) {
      showAlert({
        type: 'warning',
        title: 'Incomplete',
        message: 'Answer all questions.',
        primary: { label: 'Close' },
      });
      return;
    }

    setSubmitting(true);
    try {
      const formattedAnswers = (ticket.questions || []).map((_, index) => ({
        questionIndex: index,
        answer: answers[index].trim(),
      }));
      const result = await submitExitTicketResponse(ticket.id, {
        ticketId: ticket.id,
        studentName,
        answers: formattedAnswers,
        ...(profile?.uid ? { studentUid: profile.uid } : {}),
        ...(profile?.email ? { studentEmail: profile.email } : {}),
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit response');
      }
      setSubmitted(true);
    } catch (err) {
      showAlert({
        type: 'error',
        title: 'Submit failed',
        message: cleanErrorMessage(err, 'Try again'),
        primary: { label: 'Close' },
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.centered}>
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark" size={32} color={COLORS.successAccent} />
          </View>
          <Text style={styles.successTitle}>Response Submitted!</Text>
          <Text style={styles.successBody}>
            Thank you for completing the exit ticket. Your response has been recorded.
          </Text>
          <TouchableOpacity
            style={styles.successButton}
            onPress={leave}
            accessibilityRole="button"
            accessibilityLabel="Back to Home">
            <Ionicons name="arrow-back" size={20} color={COLORS.white} />
            <Text style={styles.primaryLabel}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!joinCode || (!ticket && !loading && error)) {
    return (
      <KeyboardSafeScreen scroll={false} style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.heading}>Join Exit Ticket</Text>
          <Text style={styles.hint}>Enter the code shared by your host</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            value={codeInput}
            onChangeText={(value) =>
              setCodeInput(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
            }
            maxLength={6}
            autoCapitalize="characters"
            placeholder="6-character code"
            placeholderTextColor={COLORS.darkTextSecondary}
            style={styles.codeInput}
          />
          <TouchableOpacity style={styles.primary} onPress={onJoin}>
            <Text style={styles.primaryLabel}>Open Exit Ticket</Text>
          </TouchableOpacity>
        </View>
      </KeyboardSafeScreen>
    );
  }

  if (loading || !ticket) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.hint}>Loading exit ticket...</Text>
      </View>
    );
  }

  return (
    <KeyboardSafeScreen scroll={false} style={styles.screen}>
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[styles.content, { paddingBottom: SPACING[16] + KEYBOARD_BOTTOM_GAP }]}>
        <Text style={styles.heading}>{ticket.title || 'Exit Ticket'}</Text>
        <Text style={styles.hint}>
          {(profile?.name || 'Audience').trim()}
        </Text>

        {(ticket.questions || []).map((question, index) => {
          const answer = answers[index] || '';
          return (
            <View key={index} style={styles.card}>
              <Text style={styles.qLabel}>Question {index + 1}</Text>
              <Text style={styles.prompt}>{question.prompt}</Text>
              {renderInput(question, answer, (value) => setAnswer(index, value))}
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.primary, submitting && styles.disabled]}
          onPress={onSubmit}
          disabled={submitting}>
          <Text style={styles.primaryLabel}>
            {submitting ? 'Submitting...' : 'Submit Response'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardSafeScreen>
  );
}

function renderInput(
  question: { type?: string; options?: string[] },
  answer: string,
  onChange: (value: string) => void
) {
  if (question.type === 'likert') {
    return (
      <View style={styles.options}>
        <Text style={styles.fieldLabel}>Rate your agreement:</Text>
        {LIKERT_OPTIONS.map((option) => (
          <Choice
            key={option}
            label={option}
            selected={answer === option}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
    );
  }
  if (question.type === 'multiple_choice') {
    return (
      <View style={styles.options}>
        <Text style={styles.fieldLabel}>Choose your answer:</Text>
        {(question.options || []).map((option) => (
          <Choice
            key={option}
            label={option}
            selected={answer === option}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
    );
  }
  if (question.type === 'true_false') {
    return (
      <View style={styles.options}>
        <Text style={styles.fieldLabel}>Select your answer:</Text>
        {['True', 'False'].map((option) => (
          <Choice
            key={option}
            label={option}
            selected={answer === option}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.fieldLabel}>Your response:</Text>
      <TextInput
        value={answer}
        onChangeText={(value) => onChange(value.slice(0, MAX_CHARS))}
        placeholder="Enter your response here..."
        placeholderTextColor={COLORS.darkTextSecondary}
        multiline
        maxLength={MAX_CHARS}
        style={styles.textarea}
      />
      <Text style={styles.charCount}>
        {answer.length}/{MAX_CHARS} characters
      </Text>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.choice, selected && styles.choiceOn]} onPress={onPress}>
      <View style={[styles.radio, selected && styles.radioOn]} />
      <Text style={[styles.choiceLabel, selected && styles.choiceLabelOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING[6],
    backgroundColor: COLORS.background,
    gap: SPACING[3],
  },
  content: { padding: SPACING[4], paddingBottom: SPACING[16], gap: SPACING[3] },
  heading: { color: COLORS.text, fontSize: 24, fontWeight: FONT_WEIGHTS.bold },
  hint: { color: COLORS.darkTextSecondary },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[4],
    gap: SPACING[3],
  },
  qLabel: { color: COLORS.darkTextSecondary, fontSize: 13 },
  prompt: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 24,
  },
  fieldLabel: { color: COLORS.text, fontWeight: FONT_WEIGHTS.medium, marginBottom: SPACING[2] },
  textarea: {
    minHeight: 120,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: SPACING[4],
    textAlignVertical: 'top',
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  charCount: { marginTop: SPACING[2], color: COLORS.darkTextSecondary, fontSize: 12 },
  options: { gap: SPACING[2] },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING[3],
  },
  choiceOn: { borderColor: COLORS.primary, backgroundColor: COLORS.blush },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  radioOn: { backgroundColor: COLORS.primary },
  choiceLabel: { color: COLORS.text, flex: 1 },
  choiceLabelOn: { fontWeight: FONT_WEIGHTS.semibold },
  primary: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: COLORS.white, fontWeight: FONT_WEIGHTS.bold },
  disabled: { opacity: 0.6 },
  successCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(109, 65, 95, 0.1)',
    padding: SPACING[8],
    alignItems: 'center',
    gap: SPACING[4],
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
  },
  successTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
  },
  successBody: {
    color: COLORS.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING[2],
  },
  successButton: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[6],
  },
  error: {
    color: COLORS.warningText,
    backgroundColor: COLORS.warningSoft,
    borderColor: COLORS.warningBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: SPACING[3],
  },
  codeInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    minHeight: 52,
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 2,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
});
