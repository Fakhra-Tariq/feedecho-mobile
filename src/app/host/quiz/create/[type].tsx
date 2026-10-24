import { useLocalSearchParams } from 'expo-router';

import { QuizEditorScreen } from '@/components/QuizEditorScreen';
import { quizTypeFromParam } from '@/lib/aiGeneratedQuiz';

export default function CreateQuizScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  return <QuizEditorScreen quizType={quizTypeFromParam(String(type || 'mixed-type'))} />;
}
