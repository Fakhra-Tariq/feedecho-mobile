import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PixelRatio,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { buildBrainCloudHtml } from '@/components/Host/brainCloudHtml';
import { cloudA11ySummary } from '@/utils/brainWordCloudLayout';
import type { WordCloudItem } from '@/utils/wordCloud';

type Props = {
  items: WordCloudItem[];
  extra?: number;
  seedKey?: string;
  reduceMotion?: boolean;
};

const PAGE_BG = '#4A1F3D';
const htmlSource = { html: buildBrainCloudHtml() };

export function BrainWordCloud({
  items,
  extra = 0,
  seedKey = '',
  reduceMotion = false,
}: Props) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const { width: vw, height: vh } = useWindowDimensions();
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const html = useMemo(() => htmlSource, []);
  const dpr = Math.min(3, Math.max(1, PixelRatio.get()));

  const payload = useMemo(
    () => ({
      items: items.map((item) => ({
        key: item.key,
        label: item.label,
        count: item.count,
      })),
      seedKey,
      cssW: stage.w,
      cssH: stage.h,
      viewportW: vw,
      viewportH: vh,
      reduceMotion,
      dpr,
    }),
    [items, seedKey, stage.w, stage.h, vw, vh, reduceMotion, dpr]
  );

  const pushPayload = (next = payload) => {
    if (!readyRef.current || next.cssW < 40 || next.cssH < 40) return;
    const js = `try{window.renderBrainCloud(${JSON.stringify(next)});}catch(e){} true;`;
    webRef.current?.injectJavaScript(js);
  };

  useEffect(() => {
    pushPayload();
  }, [payload]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width < 40 || height < 40) return;
    setStage((prev) => {
      if (Math.abs(prev.w - width) < 2 && Math.abs(prev.h - height) < 2) return prev;
      return { w: width, h: height };
    });
  };

  const a11y = cloudA11ySummary(items);

  if (items.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.empty}>No responses yet. The cloud will appear as answers come in.</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.wrap}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11y}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={html}
        style={styles.web}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        androidLayerType="hardware"
        setBuiltInZoomControls={false}
        scalesPageToFit={false}
        onLoadEnd={() => {
          readyRef.current = true;
          pushPayload();
        }}
      />
      {extra > 0 ? (
        <Text style={styles.extra} accessible={false}>
          +{extra} more
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    backgroundColor: PAGE_BG,
  },
  web: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  empty: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  extra: {
    position: 'absolute',
    bottom: 2,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
  },
});
