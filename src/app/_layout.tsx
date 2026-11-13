import type { Session } from '@supabase/supabase-js';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { AppPrefsProvider, useAppPrefs, useT } from '@/hooks/app-prefs-context';
import { NotificationsProvider } from '@/hooks/notifications-context';
import { usePushNotificationRouting } from '@/hooks/use-push-router';
import { useTheme } from '@/hooks/use-theme';
import { refreshPushToken } from '@/lib/push';
import { describeOffset, startWebReminderWatcher } from '@/lib/reminders';
import { supabase } from '../supabaseClient';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppPrefsProvider>
      <RootNavigator />
    </AppPrefsProvider>
  );
}

function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const { isGuest, loaded: prefsLoaded, reduceMotion, update } = useAppPrefs();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      SplashScreen.hideAsync();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // A password-recovery link establishes a temporary session; route the
      // user to set a new password instead of into the app.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Signing in for real ends guest mode.
  useEffect(() => {
    if (session && isGuest) update({ isGuest: false });
  }, [session, isGuest, update]);

  // While recovering, keep the user on the reset-password screen.
  useEffect(() => {
    // Cast: typed-routes regenerates to include this new route on next start.
    if (recovering) router.replace('/reset-password' as never);
  }, [recovering, router]);

  usePushNotificationRouting();

  // Web: hide the blue focus box browsers draw around a tab or button after
  // you click it, but keep it for keyboard users (Tab key), who need it.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.createElement('style');
    el.textContent = '*:focus:not(:focus-visible){outline:none !important;}';
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);

  useEffect(() => {
    if (session?.user?.id) refreshPushToken(session.user.id);
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading || !prefsLoaded) return;
    if (recovering) return; // password-recovery flow owns navigation

    const seg = segments[0];
    const onboarded = !!session?.user?.user_metadata?.onboarded;

    if (!session) {
      if (isGuest) {
        // Guests can go anywhere except the sign-in-only gate screens.
        if (seg === 'auth' || seg === 'onboarding' || seg === undefined) router.replace('/(tabs)');
      } else if (seg !== 'auth' && seg !== 'legal') {
        router.replace('/auth');
      }
    } else if (!onboarded) {
      if (seg !== 'onboarding') router.replace('/onboarding');
    } else if (seg === 'auth' || seg === 'onboarding' || seg === undefined) {
      // Only steer people off the gate screens (or the bare root on cold
      // start). Once signed in and onboarded, any other route (a tab or a
      // pushed detail screen like /user or /event-detail) is a valid
      // destination and shouldn't be force-redirected to /(tabs).
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, recovering, isGuest, prefsLoaded]);

  if (loading || !prefsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#fff" accessibilityLabel="Loading" />
      </View>
    );
  }

  return (
    <NotificationsProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'default' }} />
      <WebReminderBanner />
    </NotificationsProvider>
  );
}

// On web, reminders fire while the site is open. Show a browser notification
// when allowed, plus an in-app banner either way so nobody misses it.
function WebReminderBanner() {
  const router = useRouter();
  const colors = useTheme();
  const { t } = useT();
  const [current, setCurrent] = useState<{ eventId: string; text: string } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return startWebReminderWatcher(({ eventId, title, offset }) => {
      const text =
        offset === 0
          ? t('reminderBodyStart', { title })
          : t('reminderBodySoon', {
              title,
              when: describeOffset(offset, { minutes: t('minutes'), hours: t('hours'), days: t('days') }),
            });
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('LetsLiinger', { body: text });
        }
      } catch {
        // Some browsers only allow notifications from a service worker.
      }
      setCurrent({ eventId, text });
    });
  }, [t]);

  if (!current) return null;
  return (
    <SafeAreaView style={styles.bannerWrap} edges={['top']} pointerEvents="box-none">
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={current.text}
        onPress={() => {
          router.push(`/event-detail?id=${current.eventId}`);
          setCurrent(null);
        }}
        style={[styles.banner, { backgroundColor: colors.accentYellow, borderColor: colors.border }]}
      >
        <ThemedText style={styles.bannerText}>⏰ {current.text}</ThemedText>
        <Pressable onPress={() => setCurrent(null)} accessibilityRole="button" accessibilityLabel={t('close')} hitSlop={10}>
          <ThemedText style={styles.bannerText}>✕</ThemedText>
        </Pressable>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bannerWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  banner: {
    marginTop: 12, marginHorizontal: 16, maxWidth: 520, width: '92%',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    borderWidth: 3, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
  },
  bannerText: { color: '#000', fontWeight: '900', fontSize: 14, flexShrink: 1 },
});
