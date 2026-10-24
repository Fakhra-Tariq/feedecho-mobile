import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/**
 * Compact FeedEcho wordmark for host stack headers (Library only).
 * Uses Mobile density assets (tagline baked into the PNG).
 */
export function HostHeaderLogo() {
  return (
    <Image
      source={require('../../assets/images/FeedEcho-logo.png')}
      style={styles.logo}
      contentFit="contain"
      contentPosition="left center"
      accessibilityLabel="FeedEcho"
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 36,
    width: 108,
    // Matches Web navbar blend into cream/white chrome.
    mixBlendMode: 'multiply',
  },
});
