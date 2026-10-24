// @ts-nocheck
const normalizeQuestionsList = (questions) => {
  if (Array.isArray(questions)) return questions;
  if (questions && typeof questions === 'object') {
    return Object.keys(questions)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => questions[k])
      .filter(Boolean);
  }
  return [];
};

const TIME_TAKEN_KEYS = ['timeTaken', 'duration', 'timeSpent', 'timeSpentSeconds', 'elapsedSeconds', 'durationSeconds'];

/** Resolve time taken in seconds from whichever field older/newer rows use. */
export const normalizeTimeTakenSeconds = (record) => {
  if (!record || typeof record !== 'object') return null;

  for (const key of TIME_TAKEN_KEYS) {
    const raw = record[key];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 0) return Math.max(1, Math.round(n));
  }

  const joinedAt = record.joinedAt || record.startedAt || record.joinedAtIso;
  const submittedAt = record.submittedAt || record.completedAt || record.finishedAt;
  if (joinedAt && submittedAt) {
    const diffMs = new Date(submittedAt).getTime() - new Date(joinedAt).getTime();
    if (!Number.isNaN(diffMs) && diffMs > 0) {
      return Math.max(1, Math.round(diffMs / 1000));
    }
  }

  return null;
};

const hasAnswerPayload = (answers) => {
  if (answers == null) return false;
  if (Array.isArray(answers)) return answers.length > 0;
  if (typeof answers === 'object') return Object.keys(answers).length > 0;
  return Boolean(String(answers).trim());
};

const normalizeParticipantId = (row, fallbackKey) =>
  row?.participantId || row?.id || row?.key || fallbackKey || null;

const normalizeStatus = (row) => String(row?.status || row?.state || '').toLowerCase().trim();

export const isCompletedParticipant = (p) => {
  if (!p || typeof p !== 'object') return false;

  const status = normalizeStatus(p);
  if (status === 'completed' || status === 'complete' || status === 'finished' || status === 'submitted') {
    return true;
  }
  if (p.completed === true || p.finished === true || p.submitted === true) return true;
  if (p.submittedAt || p.completedAt || p.finishedAt) return true;
  if (hasAnswerPayload(p.answers)) return true;

  if (p.percentage != null && !Number.isNaN(Number(p.percentage))) return true;

  const totalQuestions = Number(p.totalQuestions ?? 0);
  const score = Number(p.score ?? NaN);
  if (!Number.isNaN(score) && score > 0) {
    if (totalQuestions > 0 && score <= totalQuestions) return true;
    if (score <= 100) return true;
  }

  return false;
};

/** True when the row represents a scored/submitted attempt (not join-only). */
export const isSubmittedRow = (row) => {
  if (!row || typeof row !== 'object') return false;
  if (row._joinedOnly) return false;

  const status = normalizeStatus(row);
  if (status === 'completed' || status === 'complete' || status === 'finished' || status === 'submitted') {
    return true;
  }
  if (row.completed === true || row.finished === true || row.submitted === true) return true;
  if (row.submittedAt || row.completedAt || row.finishedAt) return true;
  if (hasAnswerPayload(row.answers)) return true;
  if (row.percentage != null && !Number.isNaN(Number(row.percentage)) && row.submittedAt) return true;

  return false;
};

const isJoinedParticipant = (p) => {
  if (!p || typeof p !== 'object') return false;
  return Boolean(p.joinedAt || p.id || p.participantId || p.name || p.studentName);
};

const resolveTotalQuestions = (row, quiz, totalQuestionsDefault) =>
  Number(row?.totalQuestions ?? totalQuestionsDefault ?? 0);

const resolvePercentage = (row, totalQuestions) => {
  if (row?.percentage != null && !Number.isNaN(Number(row.percentage))) {
    return Number(row.percentage);
  }

  const score = Number(row?.score ?? NaN);
  if (Number.isNaN(score)) return 0;

  if (totalQuestions > 0 && score <= totalQuestions) {
    return Math.round((score / totalQuestions) * 100);
  }

  if (score >= 0 && score <= 100) return score;

  return 0;
};

const resolveCorrectAnswers = (row, totalQuestions, percentage) => {
  if (row?.correctAnswers != null && !Number.isNaN(Number(row.correctAnswers))) {
    return Number(row.correctAnswers);
  }

  if (totalQuestions > 0) {
    return Math.round((percentage / 100) * totalQuestions);
  }

  const score = Number(row?.score ?? 0);
  if (totalQuestions > 0 && score <= totalQuestions) return score;
  return score;
};

const buildMergedRow = (participantId, existing, participant, quiz, totalQuestionsDefault) => {
  const merged = { ...participant, ...existing, participantId };
  const totalQuestions = resolveTotalQuestions(merged, quiz, totalQuestionsDefault);
  const percentage = resolvePercentage(merged, totalQuestions);
  const correctAnswers = resolveCorrectAnswers(merged, totalQuestions, percentage);
  const timeTaken = normalizeTimeTakenSeconds(merged);

  return {
    ...merged,
    participantId,
    studentName:
      merged.studentName || merged.name || participant?.name || participant?.studentName || 'Anonymous Audience',
    percentage,
    correctAnswers,
    totalQuestions: totalQuestions || merged.totalQuestions || 0,
    score: merged.score ?? participant?.score ?? correctAnswers,
    submittedAt: merged.submittedAt || participant?.submittedAt || null,
    timeTaken,
    answers: merged.answers ?? participant?.answers ?? (Array.isArray(merged.answers) ? merged.answers : {}),
    questions: merged.questions || participant?.questions,
    quizType: merged.quizType || participant?.quizType || quiz?.type || '',
    joinedAt: merged.joinedAt || participant?.joinedAt || null,
    _joinedOnly: false,
  };
};

const buildJoinedOnlyRow = (participantId, participant, quiz, totalQuestionsDefault) => {
  const totalQuestions = resolveTotalQuestions(participant, quiz, totalQuestionsDefault);

  return {
    ...participant,
    participantId,
    studentName: participant.studentName || participant.name || 'Anonymous Audience',
    percentage: null,
    correctAnswers: null,
    totalQuestions: totalQuestions || 0,
    score: participant.score ?? 0,
    submittedAt: null,
    timeTaken: null,
    answers: participant.answers || {},
    questions: participant.questions,
    quizType: participant.quizType || quiz?.type || '',
    joinedAt: participant.joinedAt || null,
    _joinedOnly: true,
  };
};

/** RTDB stores submissions keyed by participantId — preserve that key on each row. */
export const mapSubmissionNodes = (node) => {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).map(([participantId, sub]) => {
    if (!sub || typeof sub !== 'object') {
      return { participantId, studentName: 'Anonymous Audience' };
    }
    return {
      ...sub,
      participantId: normalizeParticipantId(sub, participantId),
    };
  });
};

/**
 * Merge quiz_submissions rows with quiz_participants rows.
 * Handles legacy/alternate field names and includes joined participants when no submission exists.
 */
export const mergeQuizSubmissionSources = (submissionRows = [], participantRows = [], quiz = null) => {
  const map = new Map();
  const totalQuestionsDefault = normalizeQuestionsList(quiz?.questions).length;

  submissionRows.forEach((sub, idx) => {
    if (!sub || typeof sub !== 'object') return;
    const participantId = normalizeParticipantId(sub, `sub-${idx}`);
    if (!participantId) return;

    const existingParticipant =
      participantRows.find((p) => normalizeParticipantId(p) === participantId) || {};
    map.set(
      participantId,
      buildMergedRow(participantId, sub, existingParticipant, quiz, totalQuestionsDefault)
    );
  });

  participantRows.forEach((p, idx) => {
    if (!p || typeof p !== 'object') return;
    const participantId = normalizeParticipantId(p, `part-${idx}`);
    if (!participantId) return;

    const existing = map.get(participantId) || {};
    if (isCompletedParticipant(p) || isSubmittedRow(existing)) {
      map.set(participantId, buildMergedRow(participantId, existing, p, quiz, totalQuestionsDefault));
      return;
    }

    if (!map.has(participantId) && isJoinedParticipant(p)) {
      map.set(participantId, buildJoinedOnlyRow(participantId, p, quiz, totalQuestionsDefault));
    }
  });

  return Array.from(map.values());
};

export const countJoinedParticipants = (participantNode) => {
  if (!participantNode || typeof participantNode !== 'object') return 0;
  return Object.keys(participantNode).length;
};

const PASS_THRESHOLD = 60;

const enrichSubmission = (submission, quiz) => ({
  ...submission,
  questions: normalizeQuestionsList(submission?.questions || quiz?.questions),
  quizType: submission?.quizType || quiz?.type || '',
  answers: submission?.answers || {},
});

/** Build per-quiz report metrics — same logic as Teacher Reports overview. */
export const buildQuizReportRow = (quiz, submissions, joinedCount = 0, { includeDetails = true } = {}) => {
  const list = (submissions || []).map((sub) =>
    includeDetails
      ? enrichSubmission(sub, quiz)
      : {
          ...sub,
          quizType: sub?.quizType || quiz?.type || '',
          answers: sub?.answers || {},
          questions: sub?.questions || [],
        }
  );
  const submittedRows = list.filter(isSubmittedRow);
  const submittedCount = submittedRows.length;
  const avgScore =
    submittedCount > 0
      ? Math.round(
          submittedRows.reduce((sum, s) => sum + Number(s.percentage || 0), 0) / submittedCount
        )
      : null;
  const passCount = submittedRows.filter((s) => Number(s.percentage || 0) >= PASS_THRESHOLD).length;
  const participantCount = Math.max(Number(joinedCount) || 0, submittedCount);

  return {
    quiz,
    submissions: list,
    participantCount,
    joinedCount: Math.max(Number(joinedCount) || 0, submittedCount),
    submittedCount,
    avgScore,
    passCount,
    failCount: submittedCount - passCount,
    passRate: submittedCount > 0 ? Math.round((passCount / submittedCount) * 100) : null,
  };
};

export const collectReportDataForQuiz = (
  quiz,
  submissionsByQuizId,
  participantsByQuizId,
  apiFallbackByQuizId,
  options = {}
) => {
  const quizId = quiz.id;
  const fallback = apiFallbackByQuizId[quizId];

  const submissionRows = [
    ...mapSubmissionNodes(submissionsByQuizId[quizId]),
    ...(fallback?.submissions || []).map((s, idx) => ({
      ...s,
      participantId: s.participantId || s.id || `api-sub-${idx}`,
    })),
  ];

  const participantRows = [
    ...mapSubmissionNodes(participantsByQuizId[quizId]),
    ...(fallback?.participants || []).map((p, idx) => ({
      ...p,
      participantId: p.participantId || p.id || `api-part-${idx}`,
    })),
  ];

  const mergedSubmissions = mergeQuizSubmissionSources(submissionRows, participantRows, quiz);
  const joinedCount = Math.max(
    countJoinedParticipants(participantsByQuizId[quizId]),
    fallback?.participants?.length ?? 0,
    fallback?.totalParticipants ?? 0
  );

  return buildQuizReportRow(quiz, mergedSubmissions, joinedCount, options);
};

/**
 * Build ordered launch sessions for the Launch History step.
 * Prefers API launch bundles; otherwise groups flat rows by launchId.
 */
export const buildLaunchHistory = (quiz, submissions = [], participants = [], apiLaunches = null) => {
  if (Array.isArray(apiLaunches) && apiLaunches.length > 0) {
    return apiLaunches
      .slice()
      .sort((a, b) => {
        const aTime = String(a.launchedAt || '');
        const bTime = String(b.launchedAt || '');
        if (aTime !== bTime) return aTime.localeCompare(bTime);
        return Number(a.launchNumber || 0) - Number(b.launchNumber || 0);
      })
      .map((launch, index) => {
        const launchSubs = Array.isArray(launch.submissions) ? launch.submissions : [];
        const launchParts = Array.isArray(launch.participants) ? launch.participants : [];
        const merged = mergeQuizSubmissionSources(launchSubs, launchParts, quiz);
        const joinedCount = Math.max(
          Number(launch.participantCount) || 0,
          launchParts.length,
          merged.length
        );
        const row = buildQuizReportRow(quiz, merged, joinedCount);
        return {
          ...row,
          id: launch.id || `launch-${index + 1}`,
          launchNumber: index + 1,
          launchedAt: launch.launchedAt || null,
          finishedAt: launch.finishedAt || null,
          status: launch.status || 'ended',
          isLegacy: Boolean(launch.isLegacy),
        };
      });
  }

  const byLaunch = new Map();
  const ensureBucket = (launchId) => {
    const key = launchId || 'legacy';
    if (!byLaunch.has(key)) {
      byLaunch.set(key, { id: key, submissions: [], participants: [], launchedAt: null });
    }
    return byLaunch.get(key);
  };

  (participants || []).forEach((p) => {
    const bucket = ensureBucket(p?.launchId);
    bucket.participants.push(p);
    const candidate = p?.joinedAt || null;
    if (candidate && (!bucket.launchedAt || String(candidate) < String(bucket.launchedAt))) {
      bucket.launchedAt = candidate;
    }
  });

  (submissions || []).forEach((s) => {
    const bucket = ensureBucket(s?.launchId);
    bucket.submissions.push(s);
    const candidate = s?.submittedAt || s?.joinedAt || null;
    if (candidate && (!bucket.launchedAt || String(candidate) < String(bucket.launchedAt))) {
      bucket.launchedAt = candidate;
    }
  });

  if (byLaunch.size === 0) {
    return [];
  }

  return Array.from(byLaunch.values())
    .sort((a, b) => String(a.launchedAt || '').localeCompare(String(b.launchedAt || '')))
    .map((bucket, index) => {
      const merged = mergeQuizSubmissionSources(bucket.submissions, bucket.participants, quiz);
      const joinedCount = Math.max(bucket.participants.length, merged.length);
      const row = buildQuizReportRow(quiz, merged, joinedCount);
      return {
        ...row,
        id: bucket.id,
        launchNumber: index + 1,
        launchedAt: bucket.launchedAt,
        finishedAt: null,
        status: 'ended',
        isLegacy: bucket.id === 'legacy',
      };
    });
};

/** Overview totals used on Teacher Reports and Teacher Profile. */
export const computeTeacherOverviewStats = (quizReports = []) => {
  const allSubmissions = quizReports.flatMap((r) => r.submissions).filter(isSubmittedRow);
  const totalQuizzes = quizReports.length;
  const totalParticipants = allSubmissions.length;
  const avgScore =
    totalParticipants > 0
      ? Math.round(
          allSubmissions.reduce((sum, s) => sum + Number(s.percentage || 0), 0) / totalParticipants
        )
      : 0;

  return { totalQuizzes, totalParticipants, avgScore };
};
