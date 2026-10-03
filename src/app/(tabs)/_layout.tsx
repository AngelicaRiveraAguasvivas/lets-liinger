import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNotifications } from '@/hooks/notifications-context';
import { useTheme } from '@/hooks/use-theme';

// Only the real tab-bar screens live here (index, calendar, profile, map,
// messages). Detail/modal screens live in the root Stack (src/app/).
//
// <Tabs.Screen> declaration order controls left-to-right order. Current order
// puts Profile in the middle (Home · Calendar · Profile · Map · Messages).
const TAB_ICON_SIZE = 26;

function TabIcon({ source, focused, showDot }: { source: any; focused?: boolean; showDot?: boolean }) {
  const colors = useTheme();
  return (
    <View>
      <Image
        source={source}
        style={{ width: TAB_ICON_SIZE, height: TAB_ICON_SIZE, tintColor: '#fff', opacity: focused ? 1 : 0.5 }}
      />
      {showDot ? (
        <View style={[styles.dot, { backgroundColor: colors.accentPink, borderColor: '#1b1b20' }]} />
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const { hasUnreadMessages, hasNewEvents } = useNotifications();
  const insets = useSafeAreaInsets();

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
          tabBarIcon: ({ focused }) => (
            <TabIcon source={require('@/assets/images/tabIcons/home.png')} focused={focused} showDot={hasNewEvents} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon source={require('@/assets/images/tabIcons/calendar.png')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon source={require('@/assets/images/tabIcons/profile.png')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon source={require('@/assets/images/tabIcons/map.png')} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon source={require('@/assets/images/tabIcons/messages.png')} focused={focused} showDot={hasUnreadMessages} />
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
