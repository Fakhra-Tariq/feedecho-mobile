// @ts-nocheck
/**
 * SHARED SCORING UTILITY
 * Ensures identical scoring logic across Quiz Library and Space Race modes
 */

const normalizeString = (value) => (value ?? '').toString().toLowerCase().trim();

const normalizeBooleanLike = (value) => {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return normalizeString(value);
};

/** Stable question key — survives shuffle; never use display index alone. */
export const getStableQuestionId = (question, index = 0) => {
  if (question?.id !== undefined && question?.id !== null && String(question.id).trim() !== '') {
    return String(question.id);
  }
  if (question?.questionId !== undefined && question?.questionId !== null) {
    return String(question.questionId);
  }
  return `q-${index}`;
};

const isLegacyIndexKey = (key) => {
  if (!/^\d+$/.test(String(key))) return false;
  const parsed = Number.parseInt(key, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 200;
};

const normalizeQuizType = (quizType, question) => {
  const raw = normalizeString(question?.type || quizType);
  if (raw === 'multiple-choice' || raw === 'multiple choice') return 'multiple choice';
  if (raw === 'true-false' || raw === 'true / false' || raw === 'true/false') return 'true/false';
  if (raw === 'short-answer' || raw === 'short answer') return 'short answer';
  if (raw === 'long-answer' || raw === 'long answer') return 'long answer';
  return raw;
};

export const getCorrectOptionIndex = (question) => {
  if (!question) return null;
  if (Number.isInteger(question.correctAnswer)) return question.correctAnswer;
  if (typeof question.correctAnswer === 'string') {
    const parsed = parseInt(question.correctAnswer, 10);
    if (!Number.isNaN(parsed) && question.options?.[parsed] !== undefined) return parsed;
  }
  if (Array.isArray(question.options)) {
    const flaggedIndex = question.options.findIndex((opt) => opt?.isCorrect === true);
    if (flaggedIndex >= 0) return flaggedIndex;
    if (typeof question.correctAnswer === 'string') {
      const target = normalizeString(question.correctAnswer);
      const matchedIndex = question.options.findIndex((opt) => {
        const text = typeof opt === 'string' ? opt : opt?.text;
        return normalizeString(text) === target;
      });
      if (matchedIndex >= 0) return matchedIndex;
    }
  }
  return null;
};

/** Read a student's answer for one question from object or array submission payloads. */
export const extractSubmissionAnswer = (answers, index, question) => {
  if (answers == null) return null;

  const questionId = question ? getStableQuestionId(question, index) : null;

  if (Array.isArray(answers)) {
    const entry =
      answers.find((ans, i) => {
        if (!ans || typeof ans !== 'object') return i === index;
        if (questionId != null && ans.questionId != null && String(ans.questionId) === questionId) {
          return true;
        }
        if (Number.isInteger(ans.questionIndex) && ans.questionIndex === index) return true;
        if (question?.id != null && String(ans.questionId) === String(question.id)) return true;
        return i === index;
      }) ?? null;
    if (entry == null) return null;
    if (typeof entry === 'object' && entry.answer != null) return entry.answer;
    return entry;
  }

  let raw = null;
  if (questionId != null) {
    raw = answers[questionId] ?? answers[String(questionId)] ?? null;
  }
  if (raw == null) {
    raw =
      answers[index] ??
      answers[String(index)] ??
      (question?.id != null ? answers[question.id] ?? answers[String(question.id)] : null) ??
      null;
  }
  if (raw && typeof raw === 'object' && raw.answer != null) {
    raw = raw.answer;
  }
  return raw;
};

/** Normalize in-session answer map to stable questionId keys for submit/storage. */
export const normalizeAnswersByQuestionId = (questions, answersMap = {}) => {
  const normalized = {};
  if (!Array.isArray(questions)) return normalized;

  questions.forEach((question, index) => {
    const questionId = getStableQuestionId(question, index);
    const answer =
      answersMap[questionId] ??
      answersMap[String(questionId)] ??
      answersMap[index] ??
      answersMap[String(index)] ??
      null;

    if (answer != null && String(answer).trim() !== '') {
      normalized[questionId] = answer;
    }
  });

  return normalized;
};

export const normalizeQuestionForScoring = (question, quizType) => {
  if (!question) return question;
  const normalized = { ...question };
  const questionType = normalizeQuizType(quizType, question);

  if (questionType === 'multiple choice' && Array.isArray(normalized.options)) {
    const correctIdx = getCorrectOptionIndex(normalized);
    if (Number.isInteger(correctIdx) && correctIdx >= 0) {
      normalized.options = normalized.options.map((opt, idx) => {
        if (typeof opt === 'string') {
          return { id: String.fromCharCode(97 + idx), text: opt, isCorrect: idx === correctIdx };
        }
        return { ...opt, isCorrect: idx === correctIdx };
      });
    }
  }

  return normalized;
};

export const normalizeQuestionsForScoring = (questions, quizType) =>
  ensureUniqueQuestionIds(
    (questions || []).map((question) => normalizeQuestionForScoring(question, quizType))
  );

/**
 * Deterministic unique ids — must match server ensureUniqueQuestionIds
 * (first keep id if unique, else q-${index}).
 */
const ensureUniqueQuestionIds = (questions) => {
  const list = Array.isArray(questions) ? questions.filter(Boolean) : [];
  const seen = new Set();
  return list.map((question, index) => {
    const raw = question?.id ?? question?.questionId;
    const candidate =
      raw !== undefined && raw !== null && String(raw).trim() !== ''
        ? String(raw)
        : null;
    let id = candidate;
    if (!id || seen.has(id)) {
      id = `q-${index}`;
    }
    seen.add(id);
    return { ...question, id };
  });
};

const getSelectedOptionIndex = (question, response) => {
  if (!question || !response) return null;
  if (Number.isInteger(response.selectedOptionIndex)) return response.selectedOptionIndex;
  const answerText = normalizeString(response.answer);
  if (answerText === '') return null;
  if (Array.isArray(question.options)) {
    const matchedIndex = question.options.findIndex((opt) => {
      const text = typeof opt === 'string' ? opt : opt?.text;
      return normalizeString(text) === answerText;
    });
    if (matchedIndex >= 0) return matchedIndex;
  }
  const parsed = parseInt(answerText, 10);
  if (!Number.isNaN(parsed) && Array.isArray(question.options)) return parsed;
  return null;
};

const normalizeResponses = (responses) => {
  const list = [];
  if (Array.isArray(responses)) {
    responses.forEach((item, index) => {
      if (item && typeof item === 'object') {
        list.push({
          questionId: item.questionId ?? item.questionID ?? item.qid ?? null,
          questionIndex: Number.isInteger(item.questionIndex) ? item.questionIndex : index,
          answer: item.answer ?? item.selectedAnswer ?? item.response ?? item.value ?? '',
          selectedOptionIndex: Number.isInteger(item.selectedOptionIndex) ? item.selectedOptionIndex : null
        });
      } else {
        list.push({
          questionId: null,
          questionIndex: index,
          answer: item,
          selectedOptionIndex: null
        });
      }
    });
  } else if (responses && typeof responses === 'object') {
    Object.keys(responses).forEach((key) => {
      const legacyIndex = isLegacyIndexKey(key);
      list.push({
        questionId: legacyIndex ? null : String(key),
        questionIndex: legacyIndex ? Number.parseInt(key, 10) : null,
        answer: responses[key],
        selectedOptionIndex: null,
      });
    });
  }
  return list;
};

const scoreQuestion = (question, response, quizType, totalQuestions) => {
  const normalizedType = normalizeQuizType(quizType, question);
  let isCorrect = false;
  let correctOptionIndex = null;
  let selectedOptionIndex = null;

  // Calculate dynamic points per question based on total questions (out of 100)
  const pointsPerQuestion = totalQuestions > 0 ? 100 / totalQuestions : 10;

  try {
    if (normalizedType === 'multiple choice') {
      correctOptionIndex = getCorrectOptionIndex(question);
      selectedOptionIndex = getSelectedOptionIndex(question, response);
      
      console.log('🔍 Multiple Choice Scoring:', {
        correctOptionIndex,
        selectedOptionIndex,
        questionOptions: question.options,
        studentAnswer: response?.answer
      });
      
      // Primary check: compare indices
      isCorrect =
        Number.isInteger(correctOptionIndex) &&
        Number.isInteger(selectedOptionIndex) &&
        correctOptionIndex === selectedOptionIndex;
      
      // Fallback: if indices don't match, try text comparison
      if (!isCorrect && response?.answer && question?.options) {
        const studentAnswer = normalizeString(response.answer);
        const correctOption = question.options[correctOptionIndex];
        if (correctOption) {
          const correctText = normalizeString(typeof correctOption === 'string' ? correctOption : correctOption?.text);
          // Check if student answer matches correct option text
          if (studentAnswer === correctText) {
            isCorrect = true;
            console.log('✅ Matched by text comparison');
          }
          // Check if student answer is a number that matches the correct index
          else if (!isNaN(response.answer)) {
            const studentIndex = parseInt(response.answer);
            if (studentIndex === correctOptionIndex) {
              isCorrect = true;
              console.log('✅ Matched by index comparison');
            }
          }
        }
      }

      console.log('📊 Multiple Choice Result:', { isCorrect, correctOptionIndex, selectedOptionIndex });
    } else if (normalizedType === 'true/false') {
      const correctAnswer = normalizeBooleanLike(question?.correctAnswer);
      const studentAnswer = normalizeBooleanLike(response?.answer);
      
      console.log('🔍 True/False Scoring:', {
        correctAnswer,
        studentAnswer,
        questionCorrectAnswer: question?.correctAnswer,
        responseAnswer: response?.answer
      });
      
      isCorrect = correctAnswer !== '' && studentAnswer !== '' && correctAnswer === studentAnswer;
      
      console.log('📊 True/False Result:', { isCorrect });
    } else if (normalizedType === 'short answer') {
      const correctRaw = question?.sampleAnswer || question?.correctAnswer;
      const studentAnswer = normalizeString(response?.answer);
      // Exact match only after case/trim normalize — no substring / partial credit
      const accepted = String(correctRaw ?? '')
        .split(/[,;]/)
        .map((part) => normalizeString(part))
        .filter(Boolean);
      const primary = normalizeString(correctRaw);
      if (primary && !accepted.includes(primary)) accepted.unshift(primary);

      console.log('🔍 Short Answer Scoring:', {
        accepted,
        studentAnswer,
        questionSampleAnswer: question?.sampleAnswer,
        questionCorrectAnswer: question?.correctAnswer
      });

      isCorrect = studentAnswer !== '' && accepted.some((answer) => studentAnswer === answer);

      console.log('📊 Short Answer Result:', { isCorrect });
    } else if (normalizedType === 'long answer') {
      const correctAnswer = normalizeString(question?.correctAnswer || question?.sampleAnswer);
      const studentAnswer = normalizeString(response?.answer);
      
      console.log('🔍 Long Answer Scoring:', {
        correctAnswer,
        studentAnswer,
        questionCorrectAnswer: question?.correctAnswer,
        questionSampleAnswer: question?.sampleAnswer
      });
      
      isCorrect =
        correctAnswer !== '' &&
        (studentAnswer === correctAnswer ||
          studentAnswer.includes(correctAnswer) ||
          correctAnswer.includes(studentAnswer) ||
          (correctAnswer.includes(',') || correctAnswer.includes(';')
            ? correctAnswer.split(/[,;]/).some((answer) => {
                const trimmed = normalizeString(answer);
                return (
                  trimmed !== '' &&
                  (studentAnswer === trimmed ||
                    studentAnswer.includes(trimmed) ||
                    trimmed.includes(studentAnswer))
                );
              })
            : false) ||
          studentAnswer.replace(/\s+/g, ' ') === correctAnswer.replace(/\s+/g, ' '));
      
      console.log('📊 Long Answer Result:', { isCorrect });
    } else {
      const correctAnswer = normalizeString(question?.correctAnswer || question?.sampleAnswer);
      const studentAnswer = normalizeString(response?.answer);
      
      console.log('🔍 Default Scoring:', {
        correctAnswer,
        studentAnswer,
        questionCorrectAnswer: question?.correctAnswer,
        questionSampleAnswer: question?.sampleAnswer
      });
      
      isCorrect = correctAnswer !== '' && studentAnswer === correctAnswer;
      
      console.log('📊 Default Result:', { isCorrect });
    }
  } catch (error) {
    console.error('❌ Answer comparison error:', error);
    isCorrect = false;
  }

  return {
    isCorrect,
    points: isCorrect ? pointsPerQuestion : 0,
    correctOptionIndex,
    selectedOptionIndex
  };
};

// Enhanced answer comparison with comprehensive matching
export const compareAnswer = (question, studentAnswer, quizType, totalQuestions) => {
  const result = scoreQuestion(question, { answer: studentAnswer }, quizType, totalQuestions);

  console.log('✅ Final Answer Comparison Result:', {
    questionId: question?.id,
    studentAnswer,
    isCorrect: result.isCorrect,
    points: result.points
  });

  return {
    isCorrect: result.isCorrect,
    points: result.points
  };
};

/** Score one question for review UI — normalizes question shape first (matches submit-time scoring). */
export const reviewQuestionAnswer = (question, studentAnswer, quizType, totalQuestions) => {
  const normalized = normalizeQuestionForScoring(question, quizType);
  return compareAnswer(normalized, studentAnswer, quizType, totalQuestions);
};

// Shared scoring utility (questions + responses)
export const calculateQuizScore = (questions, responses, quizType) => {
  const scoringQuestions = normalizeQuestionsForScoring(questions, quizType);
  const totalQuestions = Array.isArray(scoringQuestions) ? scoringQuestions.length : 0;

  console.log('🧮 Starting Score Calculation:', {
    totalQuestions: totalQuestions,
    quizType,
    responseCount: Array.isArray(responses) ? responses.length : Object.keys(responses || {}).length
  });

  const normalizedResponses = normalizeResponses(responses);
  const responsesById = new Map();
  const responsesByIndex = new Map();

  normalizedResponses.forEach((response) => {
    if (response.questionId !== null && response.questionId !== undefined) {
      responsesById.set(String(response.questionId), response);
    }
    if (Number.isInteger(response.questionIndex)) {
      responsesByIndex.set(response.questionIndex, response);
    }
  });

  let totalPoints = 0;
  let correctAnswers = 0;
  let unansweredCount = 0;

  (scoringQuestions || []).forEach((question, index) => {
    const questionId = getStableQuestionId(question, index);
    const response =
      responsesById.get(questionId) ||
      responsesById.get(`q${questionId}`) ||
      responsesById.get(`q${index}`) ||
      responsesByIndex.get(index) ||
      null;

    const studentAnswer = response?.answer ?? '';
    if (normalizeString(studentAnswer) === '') {
      console.log('⏭️ Null/blank answer - 0 points for question', index + 1);
      unansweredCount++;
      return;
    }

    const { isCorrect, points } = scoreQuestion(question, response, quizType, totalQuestions);

    if (isCorrect) {
      correctAnswers++;
      totalPoints += points;
    }

    console.log(`📊 Question ${index + 1} Result:`, {
      isCorrect,
      points,
      totalPoints,
      correctAnswers
    });
  });

  const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  console.log('📊 Final Score Calculation:', {
    totalPoints,
    correctAnswers,
    totalQuestions,
    unansweredCount,
    percentage,
    calculation: `${correctAnswers}/${totalQuestions} × 100 = ${percentage}%`
  });

  return {
    score: totalPoints,
    correctAnswers,
    totalQuestions,
    unansweredCount,
    percentage,
    points: totalPoints
  };
};

// Calculate total score and percentage consistently (compat wrapper)
export const calculateScore = (questions, answers, quizType) => {
  // Handle Space Race answer format (array of objects with questionId, answer, etc.)
  let normalizedAnswers = answers;
  if (Array.isArray(answers) && answers.length > 0 && answers[0]?.questionId !== undefined) {
    normalizedAnswers = {};
    answers.forEach((ans) => {
      const id =
        ans.questionId != null
          ? String(ans.questionId)
          : `q-${ans.questionIndex ?? 0}`;
      normalizedAnswers[id] = ans.answer;
    });
    console.log('🔄 Client: Converted Space Race answers to questionId format:', normalizedAnswers);
  }
  return calculateQuizScore(questions, normalizedAnswers, quizType);
};

const hasScoringKey = (question, quizType) => {
  const questionType = normalizeQuizType(quizType, question);

  if (questionType === 'multiple choice') {
    if (!Array.isArray(question.options) || question.options.length === 0) return false;
    return Number.isInteger(getCorrectOptionIndex(question));
  }

  if (questionType === 'true/false') {
    return question.correctAnswer !== undefined && question.correctAnswer !== null && question.correctAnswer !== '';
  }

  if (questionType === 'short answer' || questionType === 'long answer') {
    return Boolean(question.sampleAnswer || question.correctAnswer);
  }

  return Boolean(question.correctAnswer || question.sampleAnswer);
};

// Validate quiz data integrity (teacher-side / diagnostics)
export const validateQuizData = (quiz) => {
  const issues = [];

  if (!quiz || !quiz.questions || !Array.isArray(quiz.questions)) {
    issues.push('Invalid quiz structure: missing or invalid questions array');
    return { isValid: false, issues };
  }

  quiz.questions.forEach((question, index) => {
    if (!question.id) {
      issues.push(`Question ${index + 1}: Missing ID`);
    }

    const questionType = normalizeQuizType(quiz.type, question);

    if (questionType === 'multiple choice') {
      if (!question.options || !Array.isArray(question.options)) {
        issues.push(`Question ${index + 1}: Invalid options array`);
      } else if (!Number.isInteger(getCorrectOptionIndex(question))) {
        issues.push(`Question ${index + 1}: Should have exactly 1 correct option, found 0`);
      }
    } else if (questionType === 'true/false') {
      if (question.correctAnswer === undefined || question.correctAnswer === null || question.correctAnswer === '') {
        issues.push(`Question ${index + 1}: Missing correctAnswer`);
      }
    } else if (questionType === 'short answer' || questionType === 'long answer') {
      if (!question.sampleAnswer && !question.correctAnswer) {
        issues.push(`Question ${index + 1}: Missing correctAnswer or sampleAnswer`);
      }
    } else if (!hasScoringKey(question, quiz.type)) {
      issues.push(`Question ${index + 1}: Missing correctAnswer or sampleAnswer`);
    }
  });

  return {
    isValid: issues.length === 0,
    issues
  };
};
