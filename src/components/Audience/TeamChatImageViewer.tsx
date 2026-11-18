import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  uri: string | null;
  onClose: () => void;
};

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export function TeamChatImageViewer({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  const imageWidth = Math.max(1, windowWidth - insets.left - insets.right);
  const imageHeight = Math.max(1, windowHeight - insets.top - insets.bottom);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const resetTransform = () => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
  };

  useEffect(() => {
    setLoadState(uri ? 'loading' : 'ready');
    resetTransform();
  }, [uri]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = clamp(savedScale.value * event.scale, 1, 4);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      const maxX = ((scale.value - 1) * imageWidth) / 2;
      const maxY = ((scale.value - 1) * imageHeight) / 2;
      translateX.value = clamp(savedX.value + event.translationX, -maxX, maxX);
      translateY.value = clamp(savedY.value + event.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={Boolean(uri)}
      animationType="fade"
      transparent={false}
      presentationStyle="fullScreen"
      statusBarTranslucent
      {...(Platform.OS === 'android' ? { navigationBarTranslucent: true } : null)}
      onRequestClose={onClose}
      hardwareAccelerated>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
          {uri && loadState !== 'error' ? (
            <GestureDetector gesture={composed}>
              <Animated.View
                style={[
                  styles.imageWrap,
                  { width: imageWidth, height: imageHeight },
                  animatedStyle,
                ]}>
                <Image
                  source={{ uri }}
                  style={{ width: imageWidth, height: imageHeight }}
                  resizeMode="contain"
                  onLoad={() => setLoadState('ready')}
                  onError={() => setLoadState('error')}
                  accessibilityLabel="Chat image"
                />
              </Animated.View>
            </GestureDetector>
          ) : null}

          {uri && loadState === 'loading' ? (
            <View style={styles.centerOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color="#FFFFFF" />
            </View>
          ) : null}

          {loadState === 'error' ? (
            <View style={styles.centerOverlay}>
              <Text style={styles.errorText}>Could not load image</Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.errorClose}>
                <Text style={styles.errorCloseText}>Close</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close image"
            hitSlop={8}
            style={[
              styles.closeBtn,
              { top: Math.max(insets.top, 12) + 4, right: Math.max(insets.right, 12) },
            ]}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorClose: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  closeBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
});
