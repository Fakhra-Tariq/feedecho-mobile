import { useLocalSearchParams } from 'expo-router';

import { QuizEditorScreen } from '@/components/QuizEditorScreen';
import { quizTypeFromParam } from '@/lib/aiGeneratedQuiz';

export default function CreateQuizScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const quizType = quizTypeFromParam(String(type || 'mixed-type'));
  return (
    <QuizEditorScreen
      quizType={quizType}
      showAiGenerator={quizType !== 'Mixed Type'}
    />
  );
}
