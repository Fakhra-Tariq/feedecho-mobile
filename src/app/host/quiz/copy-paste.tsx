import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SPACING } from '@/constants/theme';

/**
 * PLACEHOLDER — Web CopyPasteQuizModal is not ported to Mobile yet.
 * Do not invent paste-parse business logic here.
 */
export default function CopyPasteQuizPlaceholderScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.iconWrap}>
        <Ionicons name="pencil-outline" size={32} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>Copy-Paste Quiz</Text>
      <Text style={styles.badge}>PLACEHOLDER</Text>
      <Text style={styles.body}>
        The Web Copy-Paste Quiz flow (paste raw questions and organize them) is not available in
        Mobile yet. No paste-parse logic has been invented here.
      </Text>
      <AppButton label="Back to Create Quiz" onPress={() => router.back()} icon="arrow-back" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING[6],
    justifyContent: 'center',
    gap: SPACING[3],
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.blush,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING[2],
  },
  title: {
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  badge: {
    alignSelf: 'center',
    backgroundColor: COLORS.warningSoft,
    color: COLORS.warningText,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    overflow: 'hidden',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.darkTextSecondary,
    textAlign: 'center',
    marginBottom: SPACING[4],
  },
});
