import { Tabs } from 'expo-router';
import { Image, View, StyleSheet } from 'react-native';

import { useNotifications } from '@/hooks/notifications-context';
import { useTheme } from '@/hooks/use-theme';

// Only the real tab-bar screens live here now (index, calendar, map, profile,
// messages). Everything else — user, connections, event-detail, dm-thread,
// notifications, search, insights, edit-profile, settings, legal, moderation —
// is a pushed detail/modal screen and lives in the root Stack (src/app/), so it
// gets a real back-stack.
//
// All five are declared explicitly (even the ones with no custom options)
// because <Tabs.Screen> declaration order is what controls left-to-right tab
// order — leaving any out lets expo-router register them automatically in file
// order instead, ahead of the declared ones.
const TAB_ICON_SIZE = 28;

// A tab icon that can show a small unread "dot" in its top-right corner.
function TabIcon({ source, showDot }: { source: any; showDot?: boolean }) {
  const colors = useTheme();
  return (
    <View>
      <Image source={source} style={{ width: TAB_ICON_SIZE, height: TAB_ICON_SIZE }} />
      {showDot ? (
        <View style={[styles.dot, { backgroundColor: colors.accentPink, borderColor: colors.background }]} />
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  const { hasUnreadMessages, hasNewEvents } = useNotifications();

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarShowLabel: false }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: () => (
            <TabIcon source={require('@/assets/images/tabIcons/home.png')} showDot={hasNewEvents} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          tabBarIcon: () => (
            <TabIcon source={require('@/assets/images/tabIcons/calendar.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          tabBarIcon: () => (
            <TabIcon source={require('@/assets/images/tabIcons/map.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: () => (
            <TabIcon source={require('@/assets/images/tabIcons/profile.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarIcon: () => (
            <TabIcon source={require('@/assets/images/tabIcons/messages.png')} showDot={hasUnreadMessages} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
