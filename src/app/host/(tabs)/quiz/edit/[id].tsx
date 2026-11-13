import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { QuizEditorScreen } from '@/components/QuizEditorScreen';
import { COLORS, FONT_WEIGHTS, SPACING } from '@/constants/theme';
import {
  normalizeQuestionsForEditor,
  normalizeQuizTypeLabel,
} from '@/lib/aiGeneratedQuiz';
import { getQuizById } from '@/lib/hostQuizzes';

export default function EditQuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quiz, setQuiz] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getQuizById(String(id));
        if (cancelled) return;
        const type = normalizeQuizTypeLabel(data.type);
        setQuiz({
          ...data,
          type,
          questions: normalizeQuestionsForEditor(data.questions || [], type),
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load quiz');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (error || !quiz) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error || 'Quiz not found'}</Text>
      </View>
    );
  }

  return <QuizEditorScreen quizType={normalizeQuizTypeLabel(quiz.type)} initialQuiz={quiz} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING[6],
  },
  error: {
    color: COLORS.dangerText,
    fontWeight: FONT_WEIGHTS.medium,
    textAlign: 'center',
  },
});
