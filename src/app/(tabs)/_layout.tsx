import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/hooks/app-prefs-context';
import { useNotifications } from '@/hooks/notifications-context';
import { useTheme } from '@/hooks/use-theme';

// Only the real tab-bar screens live here (index, calendar, profile, map,
// messages). Detail/modal screens live in the root Stack (src/app/).
//
// <Tabs.Screen> declaration order controls left-to-right order. Current order
// puts Profile in the middle (Home · Calendar · Profile · Map · Messages).
const TAB_ICON_SIZE = 26;

// Each hand-drawn icon is split into three stacked layers so it follows the
// accent color picked in Settings: the pink fill is tinted accentPink, the
// cyan outline accentCyan, and the black linework stays as drawn. With the
// default colors it looks exactly like the original drawing.
const ICONS = {
  home: {
    fill: require('@/assets/images/tabIcons/home-fill.png'),
    line: require('@/assets/images/tabIcons/home-line.png'),
    ink: require('@/assets/images/tabIcons/home-ink.png'),
  },
  calendar: {
    fill: require('@/assets/images/tabIcons/calendar-fill.png'),
    line: require('@/assets/images/tabIcons/calendar-line.png'),
    ink: require('@/assets/images/tabIcons/calendar-ink.png'),
  },
  profile: {
    fill: require('@/assets/images/tabIcons/profile-fill.png'),
    line: require('@/assets/images/tabIcons/profile-line.png'),
    ink: require('@/assets/images/tabIcons/profile-ink.png'),
  },
  map: {
    fill: require('@/assets/images/tabIcons/map-fill.png'),
    line: require('@/assets/images/tabIcons/map-line.png'),
    ink: require('@/assets/images/tabIcons/map-ink.png'),
  },
  messages: {
    fill: require('@/assets/images/tabIcons/messages-fill.png'),
    line: require('@/assets/images/tabIcons/messages-line.png'),
    ink: require('@/assets/images/tabIcons/messages-ink.png'),
  },
};

function TabIcon({ icon, focused, showDot }: { icon: keyof typeof ICONS; focused?: boolean; showDot?: boolean }) {
  const colors = useTheme();
  const layers = ICONS[icon];
  const size = { width: TAB_ICON_SIZE, height: TAB_ICON_SIZE };
  return (
    <View style={[size, { opacity: focused ? 1 : 0.55, transform: [{ scale: focused ? 1.12 : 1 }] }]}>
      <Image source={layers.fill} style={[StyleSheet.absoluteFill, size, { tintColor: colors.accentPink }]} />
      <Image source={layers.line} style={[StyleSheet.absoluteFill, size, { tintColor: colors.accentCyan }]} />
      <Image source={layers.ink} style={[StyleSheet.absoluteFill, size]} />
      {showDot ? (
        <View style={[styles.dot, { backgroundColor: colors.accentYellow, borderColor: '#1b1b20' }]} />
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const { hasUnreadMessages, hasNewEvents } = useNotifications();
  const insets = useSafeAreaInsets();
  const { t } = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Floating, rounded, translucent pill (Depop-style).
        tabBarStyle: {
          position: 'absolute',
          left: 18,
          right: 18,
          bottom: Math.max(insets.bottom, 12),
          height: 62,
          borderRadius: 31,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          paddingHorizontal: 6,
        },
        tabBarItemStyle: { height: 62 },
        tabBarBackground: () => (
          <View style={styles.barBg}>
            <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarAccessibilityLabel: t('tabHome'),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="home" focused={focused} showDot={hasNewEvents} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          tabBarAccessibilityLabel: t('tabCalendar'),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="calendar" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarAccessibilityLabel: t('tabProfile'),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="profile" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          tabBarAccessibilityLabel: t('tabMap'),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="map" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarAccessibilityLabel: t('tabMessages'),
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="messages" focused={focused} showDot={hasUnreadMessages} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 31,
    overflow: 'hidden',
    // Translucent dark tint layered over the blur for the frosted-pill look.
    backgroundColor: 'rgba(20,20,24,0.55)',
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
