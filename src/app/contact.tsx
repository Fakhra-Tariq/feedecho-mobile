import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  KEYBOARD_BOTTOM_GAP,
  KeyboardSafeScreen,
} from '@/components/KeyboardSafeScreen';
import { MarketingHeader } from '@/components/MarketingHeader';
import { MarketingTabBar } from '@/components/MarketingTabBar';
import { AppCard } from '@/components/ui';
import { COLORS, FONT_WEIGHTS, RADIUS, SHADOWS, SPACING, TYPE } from '@/constants/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormErrors = Partial<Record<'name' | 'email' | 'message', string>>;

/**
 * Front-end only contact form — mirrors Web Contact.js (no backend endpoint yet).
 */
export default function ContactScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const clearError = (field: keyof FormErrors) => {
    if (!errors[field]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const next: FormErrors = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName) next.name = 'Name is required.';
    if (!trimmedEmail) next.email = 'Email is required.';
    else if (!EMAIL_RE.test(trimmedEmail)) next.email = 'Enter a valid email address.';
    if (!trimmedMessage) next.message = 'Message is required.';
    else if (trimmedMessage.length < 10) next.message = 'Message should be at least 10 characters.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = () => {
    if (!validate()) return;
    setSending(true);
    // Same front-end-only behavior as Web Contact.js
    setTimeout(() => {
      setSending(false);
      setSubmitted(true);
      setName('');
      setEmail('');
      setMessage('');
    }, 450);
  };

  return (
    <View style={styles.screen}>
      <MarketingHeader active="contact" />
      <KeyboardSafeScreen
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: SPACING[6] + KEYBOARD_BOTTOM_GAP }]}
        showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>
            Get in <Text style={styles.titleAccent}>Touch</Text>
          </Text>

          <AppCard style={styles.card}>
            {submitted ? (
              <View style={styles.success}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark-circle" size={28} color={COLORS.primary} />
                </View>
                <Text style={styles.successTitle}>Message ready</Text>
                <Text style={styles.successBody}>
                  Thanks for reaching out. Your message has been recorded on this page — for now,
                  please also email us at feedecho4@gmail.com if you need a reply soon.
                </Text>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setSubmitted(false);
                    setErrors({});
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Send another message">
                  <Text style={styles.secondaryBtnLabel}>Send another message</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.formTitle}>Send a message</Text>
                <Text style={styles.formHint}>All fields are required.</Text>

                <Text style={styles.label}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    clearError('name');
                  }}
                  style={[styles.input, errors.name && styles.inputError]}
                  autoComplete="name"
                  placeholder="Your name"
                  placeholderTextColor={COLORS.inkSecondary}
                  accessibilityLabel="Name"
                />
                {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    clearError('email');
                  }}
                  style={[styles.input, errors.email && styles.inputError]}
                  autoComplete="email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.inkSecondary}
                  accessibilityLabel="Email"
                />
                {errors.email ? <Text style={styles.error}>{errors.email}</Text> : null}

                <Text style={styles.label}>Message</Text>
                <TextInput
                  value={message}
                  onChangeText={(value) => {
                    setMessage(value);
                    clearError('message');
                  }}
                  style={[styles.input, styles.textarea, errors.message && styles.inputError]}
                  multiline
                  textAlignVertical="top"
                  placeholder="How can we help?"
                  placeholderTextColor={COLORS.inkSecondary}
                  accessibilityLabel="Message"
                />
                {errors.message ? <Text style={styles.error}>{errors.message}</Text> : null}

                <TouchableOpacity
                  style={[styles.sendBtn, sending && styles.sendDisabled]}
                  onPress={onSubmit}
                  disabled={sending}
                  accessibilityRole="button"
                  accessibilityLabel="Send">
                  {sending ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <View style={styles.sendRow}>
                      <Ionicons name="send" size={16} color={COLORS.white} />
                      <Text style={styles.sendLabel}>Send</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </AppCard>
      </KeyboardSafeScreen>
      <MarketingTabBar active="contact" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[6],
    paddingBottom: SPACING[6],
  },
  title: {
    ...TYPE.hero,
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
    marginBottom: SPACING[6],
  },
  titleAccent: { color: COLORS.primary },
  card: { ...SHADOWS.card, padding: SPACING[5] },
  formTitle: { ...TYPE.bodyStrong, fontSize: 18, marginBottom: SPACING[1] },
  formHint: { ...TYPE.caption, marginBottom: SPACING[4] },
  label: {
    color: COLORS.ink,
    fontWeight: FONT_WEIGHTS.medium,
    fontSize: 14,
    marginBottom: SPACING[1],
    marginTop: SPACING[2],
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: RADIUS.md,
    minHeight: 44,
    paddingHorizontal: SPACING[3],
    backgroundColor: COLORS.white,
    color: COLORS.ink,
    fontSize: 15,
  },
  textarea: {
    minHeight: 112,
    paddingTop: SPACING[3],
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  error: {
    color: COLORS.dangerText,
    fontSize: 13,
    marginTop: SPACING[1],
  },
  sendBtn: {
    marginTop: SPACING[5],
    minHeight: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.6 },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sendLabel: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.semibold,
    fontSize: 16,
  },
  success: { alignItems: 'center', paddingVertical: SPACING[4] },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.plumTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  successTitle: { ...TYPE.bodyStrong, fontSize: 18, marginBottom: SPACING[2] },
  successBody: {
    ...TYPE.caption,
    textAlign: 'center',
    marginBottom: SPACING[4],
    lineHeight: 20,
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnLabel: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
