import { useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { hslToHex } from '@/lib/accent';

const SEGMENTS = 36;
const THUMB = 30;

interface Props {
  value: number | null; // 0-360, null = no tone picked yet
  onChange: (hue: number) => void;
  accessibilityLabel: string;
}

// A rainbow bar you drag along to pick a hue. Built on PanResponder so it
// works the same with a finger on iOS/Android and a mouse on web. Screen
// reader users can swipe up/down on it (accessibilityRole "adjustable").
export function HueSlider({ value, onChange, accessibilityLabel }: Props) {
  const colors = useTheme();
  const trackRef = useRef<View>(null);
  const left = useRef(0);
  const width = useRef(1);
  const [trackWidth, setTrackWidth] = useState(0);

  // Latest onChange, readable from the gesture callbacks without
  // re-creating the PanResponder on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The refs are only read inside gesture callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    function measure() {
      trackRef.current?.measureInWindow((x, _y, w) => {
        left.current = x;
        if (w > 0) width.current = w;
      });
    }
    function hueAt(e: GestureResponderEvent) {
      const x = e.nativeEvent.pageX - left.current;
      const ratio = Math.min(1, Math.max(0, x / width.current));
      return Math.round(ratio * 360) % 360;
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the drag even if the finger wanders vertically (otherwise the
      // settings ScrollView would take over).
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        measure();
        // measureInWindow is async on native; use locationX for the first
        // touch so a simple tap lands where you tapped.
        const ratio = Math.min(1, Math.max(0, e.nativeEvent.locationX / width.current));
        onChangeRef.current(Math.round(ratio * 360) % 360);
      },
      onPanResponderMove: (e) => onChangeRef.current(hueAt(e)),
    });
  });

  const segments = useMemo(
    () => Array.from({ length: SEGMENTS }, (_, i) => hslToHex((i / SEGMENTS) * 360, 100, 60)),
    []
  );

  const hue = value ?? 0;
  const thumbLeft = trackWidth ? (hue / 360) * trackWidth - THUMB / 2 : 0;

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 360, now: hue, text: `${hue}°` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange((hue + 15) % 360);
        if (e.nativeEvent.actionName === 'decrement') onChange((hue + 345) % 360);
      }}
      style={styles.wrap}
    >
      <View
        ref={trackRef}
        onLayout={(e) => {
          width.current = e.nativeEvent.layout.width || 1;
          setTrackWidth(e.nativeEvent.layout.width);
          trackRef.current?.measureInWindow((x) => {
            left.current = x;
          });
        }}
        style={styles.track}
        {...responder.panHandlers}
      >
        <View pointerEvents="none" style={[styles.rainbow, { borderColor: colors.border }]}>
          {segments.map((c, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: c }} />
          ))}
        </View>
        {value != null && trackWidth > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { left: thumbLeft, backgroundColor: hslToHex(hue, 100, 60), borderColor: colors.border },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 8 },
  track: { height: 28, justifyContent: 'center' },
  // Clipped separately so the rounded ends look clean while the thumb can
  // still poke out above and below the bar.
  rainbow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderWidth: 2, flexDirection: 'row', overflow: 'hidden',
  },
  thumb: {
    position: 'absolute', top: -3, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
});
