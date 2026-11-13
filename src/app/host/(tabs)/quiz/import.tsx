import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';
import { getQuizEditorTypeParam } from '@/lib/aiGeneratedQuiz';
import {
  importQuestionsFromFile,
  type QuizImportFile,
} from '@/lib/importQuizFromFile';
import { TAB_BAR_CONTENT_HEIGHT } from '@/lib/tabBarSafeArea';

const QUESTION_TYPES = [
  { title: 'Multiple Choice', emoji: '🔘' },
  { title: 'True / False', emoji: '✓' },
  { title: 'Short Answer', emoji: '📝' },
  { title: 'Mixed Type', emoji: '🎯' },
] as const;

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
const MAX_BYTES = 10 * 1024 * 1024;
const PICKER_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  '*/*',
];

type ImportStatus = '' | 'processing' | 'success' | 'error';

function fileIconColor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return COLORS.danger;
  if (ext === 'doc' || ext === 'docx') return '#3B82F6';
  if (ext === 'xls' || ext === 'xlsx') return '#22C55E';
  return COLORS.iconMuted;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function ImportQuizScreen() {
  const insets = useSafeAreaInsets();
  const [selectedType, setSelectedType] = useState('Multiple Choice');
  const [uploadedFile, setUploadedFile] = useState<QuizImportFile | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>('');
  const [importErrorDetail, setImportErrorDetail] = useState('');

  const goBack = () => router.back();

  const applyPickedFile = (file: QuizImportFile) => {
    const fileExtension = '.' + String(file.name || '').split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXT.includes(fileExtension)) {
      // Do not select an invalid file (same messages as Web ImportQuizModal).
      setImportStatus('error');
      setImportErrorDetail(
        'Unsupported file type. Please upload PDF, DOC, DOCX, XLS, XLSX, or TXT.'
      );
      return;
    }
    if ((file.size || 0) > MAX_BYTES) {
      setImportStatus('error');
      setImportErrorDetail('File is too large. Maximum size is 10MB.');
      return;
    }
    setUploadedFile(file);
    setImportStatus('');
    setImportErrorDetail('');
  };

  const onPickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      applyPickedFile({
        name: asset.name || 'file',
        uri: asset.uri,
        size: asset.size || 0,
      });
    } catch {
      setImportStatus('error');
      setImportErrorDetail(
        'Unsupported file type. Please upload PDF, DOC, DOCX, XLS, XLSX, or TXT.'
      );
    }
  };

  const onImportQuiz = async () => {
    if (!uploadedFile) {
      setImportStatus('error');
      setImportErrorDetail('Please select a valid file to import.');
      return;
    }

    setIsImporting(true);
    setImportStatus('processing');
    setImportErrorDetail('');

    try {
      const { questions: parsedQuestions } = await importQuestionsFromFile(
        uploadedFile,
        selectedType
      );

      if (!parsedQuestions.length) {
        setImportStatus('error');
        setImportErrorDetail(
          'Could not find any questions in the file. Use the same format as Copy & Paste (numbered questions, A) B) C) D) options, Answer: lines, or [MCQ]/[TRUE/FALSE]/[SHORT ANSWER] tags for Mixed Type).'
        );
        setIsImporting(false);
        return;
      }

      const quiz = {
        id: Date.now(),
        title: `Imported Quiz - ${uploadedFile.name.replace(/\.[^/.]+$/, '')}`,
        type: selectedType,
        questions: parsedQuestions,
        questionCount: parsedQuestions.length,
        createdDate: new Date().toISOString(),
        status: 'Draft',
        launched: false,
        isFromImport: true,
        originalFileName: uploadedFile.name,
      };

      await AsyncStorage.setItem('editingQuiz', JSON.stringify(quiz));
      setImportStatus('success');
      setTimeout(() => {
        router.push(`/host/quiz/create/${getQuizEditorTypeParam(selectedType)}` as Href);
      }, 500);
    } catch (error) {
      setImportStatus('error');
      setImportErrorDetail(
        error instanceof Error
          ? error.message
          : 'Could not parse the file content. Please check the file format and try again.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const importEnabled = Boolean(uploadedFile) && !isImporting;

  return (
    <View
      style={[
        styles.screen,
        { paddingBottom: TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 8) },
      ]}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerBadge}>
              <Ionicons name="cloud-upload-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.headerTitle}>Import Quiz from File</Text>
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

          <Text style={styles.label}>Upload File</Text>
          <Pressable
            onPress={onPickFile}
            style={styles.dropzone}
            accessibilityRole="button"
            accessibilityLabel="Tap to upload">
            {uploadedFile ? (
              <View style={styles.fileChosen}>
                <Ionicons
                  name="document-text-outline"
                  size={32}
                  color={fileIconColor(uploadedFile.name)}
                />
                <Text style={styles.fileName}>{uploadedFile.name}</Text>
                <Text style={styles.fileSize}>{formatFileSize(uploadedFile.size || 0)}</Text>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    setUploadedFile(null);
                    setImportStatus('');
                    setImportErrorDetail('');
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove file">
                  <Text style={styles.removeFile}>Remove file</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.fileChosen}>
                <Ionicons name="cloud-upload-outline" size={48} color={COLORS.muted} />
                <Text style={styles.dropTitle}>Tap to upload</Text>
                <Text style={styles.dropHint}>PDF, DOC, DOCX, XLS, XLSX, TXT (max 10MB)</Text>
                {importStatus === 'error' && importErrorDetail && !uploadedFile ? (
                  <Text style={styles.dropError}>{importErrorDetail}</Text>
                ) : null}
              </View>
            )}
          </Pressable>

          {importStatus === 'processing' ? (
            <View style={[styles.statusBox, styles.statusProcessing]}>
              <ActivityIndicator color="#1D4ED8" />
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitleProcessing}>Processing File</Text>
                <Text style={styles.statusBodyProcessing}>
                  Parsing your {uploadedFile?.name} and extracting questions...
                </Text>
              </View>
            </View>
          ) : null}

          {importStatus === 'success' ? (
            <View style={[styles.statusBox, styles.statusSuccess]}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.successAccent} />
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitleSuccess}>Import Successful</Text>
                <Text style={styles.statusBodySuccess}>
                  Your quiz has been imported and is ready for editing. Redirecting...
                </Text>
              </View>
            </View>
          ) : null}

          {importStatus === 'error' && uploadedFile ? (
            <View style={[styles.statusBox, styles.statusError]}>
              <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitleError}>Import Failed</Text>
                <Text style={styles.statusBodyError}>
                  {importErrorDetail ||
                    (uploadedFile
                      ? 'Could not parse the file content. Please check the file format and try again.'
                      : 'Please select a valid file to import.')}
                </Text>
              </View>
            </View>
          ) : null}

          {uploadedFile && !importStatus ? (
            <View style={[styles.statusBox, styles.statusReady]}>
              <Ionicons name="alert-circle" size={20} color={COLORS.primary} />
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitleReady}>File Ready for Import</Text>
                <Text style={styles.statusBodyReady}>
                  Your {uploadedFile.name} will be parsed as {selectedType} questions. Review and
                  edit the generated quiz after import.
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
            onPress={onImportQuiz}
            disabled={!importEnabled}
            style={[styles.importBtn, !importEnabled && styles.importBtnDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !importEnabled }}>
            {isImporting ? (
              <>
                <ActivityIndicator color={COLORS.white} size="small" />
                <Text style={styles.importLabel}>Importing...</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={16} color={COLORS.white} />
                <Text style={styles.importLabel}>Import Quiz</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
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
    borderRadius: 16,
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
  dropzone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    borderRadius: RADIUS.lg,
    padding: SPACING[8],
    backgroundColor: COLORS.white,
    marginBottom: SPACING[4],
  },
  fileChosen: {
    alignItems: 'center',
    gap: SPACING[2],
  },
  dropTitle: {
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
    fontSize: 15,
  },
  dropHint: {
    fontSize: 13,
    color: COLORS.darkTextSecondary,
    textAlign: 'center',
  },
  dropError: {
    marginTop: SPACING[2],
    fontSize: 13,
    color: COLORS.dangerText,
    textAlign: 'center',
  },
  fileName: {
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  fileSize: {
    fontSize: 13,
    color: COLORS.darkTextSecondary,
  },
  removeFile: {
    fontSize: 13,
    color: COLORS.dangerText,
    marginTop: SPACING[1],
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[3],
    padding: SPACING[4],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING[4],
  },
  statusCopy: { flex: 1 },
  statusProcessing: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  statusSuccess: {
    backgroundColor: COLORS.successSoft,
    borderColor: COLORS.successBorder,
  },
  statusError: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: COLORS.dangerBorder,
  },
  statusReady: {
    backgroundColor: COLORS.blush,
    borderColor: 'rgba(109,65,95,0.2)',
  },
  statusTitleProcessing: { fontSize: 14, fontWeight: FONT_WEIGHTS.medium, color: '#1E3A8A' },
  statusBodyProcessing: { fontSize: 12, color: '#1D4ED8', marginTop: 4 },
  statusTitleSuccess: { fontSize: 14, fontWeight: FONT_WEIGHTS.medium, color: COLORS.successText },
  statusBodySuccess: { fontSize: 12, color: COLORS.successAccent, marginTop: 4 },
  statusTitleError: { fontSize: 14, fontWeight: FONT_WEIGHTS.medium, color: COLORS.dangerText },
  statusBodyError: { fontSize: 12, color: COLORS.dangerText, marginTop: 4 },
  statusTitleReady: { fontSize: 14, fontWeight: FONT_WEIGHTS.medium, color: COLORS.ink },
  statusBodyReady: { fontSize: 12, color: COLORS.inkSecondary, marginTop: 4 },
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
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[6],
    minHeight: 44,
  },
  importBtnDisabled: {
    opacity: 0.5,
  },
  importLabel: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 15,
  },
});
