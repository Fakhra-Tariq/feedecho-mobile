import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams, useNavigation, type Href } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudienceActivityHeader } from '@/components/Audience/AudienceActivityHeader';
import { AudiencePostActivityHomeButton } from '@/components/Audience/AudiencePostActivityHomeButton';
import { GuestProgressLoginBanner } from '@/components/Audience/GuestProgressLoginBanner';
import { showAlert } from '@/components/feedback';
import { StudentAccountButton } from '@/components/HostProfileButton';
import { cleanErrorMessage } from '@/lib/activeActivity';
import {
  KEYBOARD_BOTTOM_GAP,
  KEYBOARD_SCROLL_PROPS,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useLeaveActivity } from '@/lib/audienceHomeNavigation';
import { isCodeJoinGuest } from '@/lib/guestSession';
import { ApiError } from '@/lib/api';
import {
  getExitTicketByCode,
  LIKERT_OPTIONS,
  startExitTicketAttempt,
  submitExitTicketResponse,
  type ExitTicket,
} from '@/lib/hostExitTickets';
import { rememberExitTicketTitle } from '@/lib/useExitTicketActivityTitles';
import {
  getMyParticipation,
  hasGuestSubmitted,
  markExitTicketParticipated,
  markGuestExitTicketSubmitted,
  rememberExitTicketAttempt,
} from '@/lib/studentParticipation';

const SESSION_CODE_KEY = 'sessionCode';
const STUDENT_NAME_KEY = 'studentName';
const MAX_CHARS = 500;

export default function AudienceExitTicketScreen() {
  const { profile, user, isHost } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { leave } = useLeaveActivity();
  const params = useLocalSearchParams<{
    code?: string;
    alreadySubmitted?: string;
    alreadyAttemptedOnDevice?: string;
  }>();
  const alreadySubmittedParam = String(params.alreadySubmitted || '') === '1';
  const alreadyAttemptedOnDeviceParam = String(params.alreadyAttemptedOnDevice || '') === '1';
  const isLoggedInStudent = Boolean(profile?.uid && !profile?.guest);
  const isGuest = Boolean(profile?.guest) && !isLoggedInStudent;
  /** Header identity: code-join guest, never a Firebase-signed-in student (public join included). */
  const isHeaderGuest = isCodeJoinGuest({
    profileGuest: profile?.guest,
    isHost,
    firebaseUid: user?.uid,
  });
  const [joinCode, setJoinCode] = useState('');
  const [guestHeaderName, setGuestHeaderName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [ticket, setTicket] = useState<ExitTicket | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(alreadyAttemptedOnDeviceParam);
  const [guestBlockedOnDevice, setGuestBlockedOnDevice] = useState(alreadyAttemptedOnDeviceParam);
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
        if (alreadyAttemptedOnDeviceParam && !isLoggedInStudent) {
          setGuestBlockedOnDevice(true);
          setSubmitted(true);
        } else if (alreadySubmittedParam && isLoggedInStudent) {
          setSubmitted(true);
        } else if (isLoggedInStudent && response.data.id) {
          const part = await getMyParticipation(
            'exitTicket',
            response.data.id,
            String(profile?.uid || ''),
            { email: profile?.email, name: profile?.name }
          );
          if (!cancelled && part.status === 'submitted') {
            setSubmitted(true);
          }
        } else if (!isLoggedInStudent && response.data.id) {
          const joinedName =
            (await AsyncStorage.getItem(STUDENT_NAME_KEY))?.trim() ||
            String(profile?.name || '').trim();
          if (joinedName) {
            try {
              const start = await startExitTicketAttempt(response.data.id, {
                studentName: joinedName,
              });
              if (start?.attemptId) {
                await rememberExitTicketAttempt(response.data.id, start.attemptId);
              }
            } catch (startErr) {
              if (
                startErr instanceof ApiError &&
                (startErr.data as { code?: string } | null)?.code === 'ALREADY_ATTEMPTED'
              ) {
                if (!cancelled) {
                  setGuestBlockedOnDevice(true);
                  setSubmitted(true);
                }
              }
            }
          }
        }
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
  }, [
    joinCode,
    alreadySubmittedParam,
    alreadyAttemptedOnDeviceParam,
    isLoggedInStudent,
    profile?.uid,
    profile?.email,
    profile?.name,
  ]);

  useEffect(() => {
    if (!isHeaderGuest) return;
    let cancelled = false;
    (async () => {
      const stored = (await AsyncStorage.getItem(STUDENT_NAME_KEY))?.trim() || '';
      if (!cancelled) {
        setGuestHeaderName(stored || String(profile?.name || '').trim());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHeaderGuest, profile?.name]);

  const ticketTitle = String(ticket?.title || '').trim();
  const activityHeader = (
    <AudienceActivityHeader
      activityLabel="Exit Ticket"
      title={ticketTitle || 'Exit Ticket'}
      participantName={
        isHeaderGuest ? guestHeaderName : String(profile?.name || '').trim()
      }
      isLoggedIn={!isHeaderGuest && isLoggedInStudent}
      rightSlot={isHeaderGuest ? undefined : <StudentAccountButton />}
    />
  );

  useLayoutEffect(() => {
    const hideNativeHeader = submitted || Boolean(ticket);
    if (hideNativeHeader) {
      navigation.setOptions({
        headerShown: false,
        headerBackVisible: false,
        headerLeft: () => null,
        headerRight: () => null,
      });
      return;
    }
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Exit Ticket',
      headerTitleAlign: 'left',
      headerRight: isHeaderGuest ? () => null : () => <StudentAccountButton />,
    });
  }, [isHeaderGuest, navigation, submitted, ticket]);

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
    if (!ticket || submitting || submitted) return;
    if (isLoggedInStudent && profile?.uid) {
      const part = await getMyParticipation('exitTicket', ticket.id, String(profile.uid), {
        email: profile.email,
        name: profile.name,
      });
      if (part.status === 'submitted') {
        setSubmitted(true);
        return;
      }
    }
    const studentName =
      (await AsyncStorage.getItem(STUDENT_NAME_KEY))?.trim() || profile?.name?.trim() || '';
    if (isGuest && studentName) {
      try {
        if (await hasGuestSubmitted('exitTicket', ticket.id, studentName)) {
          setGuestBlockedOnDevice(true);
          setSubmitted(true);
          return;
        }
      } catch (checkErr) {
        console.warn('[guest submit check] network error, allowing submit', checkErr);
      }
    }
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
      const ticketTitle = String(ticket.title || '').trim();
      const result = await submitExitTicketResponse(ticket.id, {
        ticketId: ticket.id,
        studentName,
        answers: formattedAnswers,
        ...(ticketTitle ? { ticketTitle } : {}),
        ...(profile?.uid ? { studentUid: profile.uid } : {}),
        ...(profile?.email ? { studentEmail: profile.email } : {}),
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to submit response');
      }
      if (ticketTitle) rememberExitTicketTitle(ticket.id, ticketTitle);
      if (isLoggedInStudent && profile?.uid) {
        await markExitTicketParticipated(String(profile.uid), ticket.id);
      } else if (isGuest && studentName) {
        await markGuestExitTicketSubmitted(ticket.id, studentName);
      }
      setSubmitted(true);
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.data as { code?: string } | null)?.code === 'ALREADY_ATTEMPTED'
      ) {
        setGuestBlockedOnDevice(true);
        setSubmitted(true);
        return;
      }
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
      <View style={styles.screen}>
        {activityHeader}
        <View style={styles.centered}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={32} color={COLORS.successAccent} />
            </View>
            <Text style={styles.successTitle}>Response Submitted!</Text>
            <Text style={styles.successBody}>
              Thank you for completing the exit ticket. Your response has been recorded.
            </Text>
            <AudiencePostActivityHomeButton
              onPress={leave}
              style={styles.successButton}
              labelStyle={styles.primaryLabel}
              icon
            />
          </View>
        </View>
      </View>
    );
  }

  if (!joinCode || (!ticket && !loading && error)) {
    return (
      <KeyboardSafeScreen style={styles.screen}>
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
      {activityHeader}
      <GuestProgressLoginBanner visible={isGuest} />
      <ScrollView
        {...KEYBOARD_SCROLL_PROPS}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 16 + KEYBOARD_BOTTOM_GAP },
        ]}>
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
          disabled={submitting || submitted}>
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
  content: {
    paddingHorizontal: SPACING[4],
    paddingTop: 12,
    paddingBottom: SPACING[16],
    gap: SPACING[3],
  },
  guestNavSafe: {
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  guestNav: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  guestNavCenter: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestNavRight: {
    flexShrink: 0,
    maxWidth: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  guestNavName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    color: '#2B1F27',
    writingDirection: 'auto',
  },
  studentNavLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  studentNavBack: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 4,
  },
  navBrand: {
    flexShrink: 0,
    color: COLORS.header,
    fontSize: 17,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  navTitle: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#2B1F27',
    textAlign: 'center',
    writingDirection: 'auto',
  },
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
