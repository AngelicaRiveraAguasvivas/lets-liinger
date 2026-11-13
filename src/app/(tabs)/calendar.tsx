import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { ShadowSurface } from '@/components/ui/shadow-surface';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useIsGuest } from '@/hooks/app-prefs-context';
import { getDemoEvents } from '@/lib/demo';
import { supabase } from '../../supabaseClient';

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  time: string;
  location: string;
  host: string;
  color: string;
}

function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function CalendarScreen() {
  const colors = useTheme();
  const router = useRouter();

  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDateStr, setSelectedDateStr] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  );

  const [scheduledEvents, setScheduledEvents] = useState<CalendarEvent[]>([]);

  const accents = [colors.accentPink, colors.accentCyan, colors.accentYellow, colors.accentGreen];
  const isGuest = useIsGuest();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data } = isGuest
          ? { data: getDemoEvents().map((e) => ({ id: e.id, title: e.title, event_time: e.event_time, location: e.location, host: e.host, creator: null })) }
          : await supabase
              .from('events')
              .select('id, title, event_time, location, host, creator:profiles!events_created_by_fkey(username, display_name)')
              .order('event_time', { ascending: true });

        if (cancelled) return;

        const mapped: CalendarEvent[] = (data ?? []).map((e: any, idx: number) => {
          const iso: string = e.event_time ?? '';
          const datePart = iso.slice(0, 10);
          const host = e.host?.trim()
            ? e.host
            : e.creator?.username
              ? `@${e.creator.username}`
              : e.creator?.display_name ?? 'Someone';
          let time = 'All day';
          if (iso.includes('T') && !iso.endsWith('T00:00:00')) {
            const d = new Date(iso);
            if (!isNaN(d.getTime())) {
              time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
            }
          }
          return {
            id: e.id,
            date: datePart,
            title: e.title,
            time,
            location: e.location ?? 'TBD',
            host,
            color: accents[idx % accents.length],
          };
        });

        setScheduledEvents(mapped);
      })();
      return () => { cancelled = true; };
    }, [isGuest])
  );

  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  const dayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const getFormattedDate = (yearNum: number, monthNum: number, dayNum: number) => {
    return `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  };

  const selectedEvents = scheduledEvents.filter(e => e.date === selectedDateStr);

  const dynamicStyles = useMemo(() => StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerText: {
      color: colors.text,
      fontFamily: 'ui-rounded',
      fontWeight: '900',
      fontSize: 28,
      letterSpacing: -1,
    },
    navBtn: {
      backgroundColor: colors.accentYellow,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: Spacing.two,
      paddingVertical: Spacing.one,
    },
    dayCell: {
      width: '14.28%',
      aspectRatio: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 2,
    },
    dayInner: {
      width: '90%',
      height: '90%',
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    eventDot: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: 28,
      height: 28,
      borderRadius: 14,
      marginTop: -14,
      marginLeft: -14,
      backgroundColor: colors.accentPink,
    },
  }), [colors]);

  const renderGrid = () => {
    const TOTAL_SLOTS = 42; // Always 6 weeks (6 rows * 7 days = 42 cells)
    const gridCells = [];

    // Calculate previous month padding days
    const prevMonthDays = new Date(year, month, 0).getDate();

    for (let i = 0; i < TOTAL_SLOTS; i++) {
      let cellDay: number;
      let cellMonth = month;
      let cellYear = year;
      let isCurrentMonth = true;

      if (i < firstDayIndex) {
        // Leading days from previous month
        isCurrentMonth = false;
        cellDay = prevMonthDays - firstDayIndex + i + 1;
        cellMonth = month === 0 ? 11 : month - 1;
        cellYear = month === 0 ? year - 1 : year;
      } else if (i >= firstDayIndex + daysInMonth) {
        // Trailing days for next month
        isCurrentMonth = false;
        cellDay = i - (firstDayIndex + daysInMonth) + 1;
        cellMonth = month === 11 ? 0 : month + 1;
        cellYear = month === 11 ? year + 1 : year;
      } else {
        // Days in current month
        cellDay = i - firstDayIndex + 1;
      }

      const dateStr = getFormattedDate(cellYear, cellMonth, cellDay);
      const isSelected = dateStr === selectedDateStr;
      const isToday =
        cellDay === today.getDate() &&
        cellMonth === today.getMonth() &&
        cellYear === today.getFullYear();

      const hasEvents = scheduledEvents.some(e => e.date === dateStr);
      const showDot = hasEvents && !isSelected && !isToday;

      gridCells.push(
        <TouchableOpacity
          key={`slot-${i}`}
          style={dynamicStyles.dayCell}
          onPress={() => setSelectedDateStr(dateStr)}
          activeOpacity={0.7}
        >
          <View style={[
            dynamicStyles.dayInner,
            isSelected && { backgroundColor: colors.accentCyan, borderColor: colors.border, borderWidth: 2 },
            !isSelected && isToday && { backgroundColor: colors.accentYellow, borderColor: colors.border, borderWidth: 2 },
          ]}>
            {showDot && <View style={dynamicStyles.eventDot} />}
            <ThemedText style={{
              fontWeight: isSelected || isToday || showDot ? '900' : '700',
              color: isSelected || isToday || showDot
                ? '#000'
                : isCurrentMonth
                  ? colors.text
                  : colors.text + '33', // Faded color for outside-month days
              fontSize: 13,
            }}>
              {cellDay}
            </ThemedText>
          </View>
        </TouchableOpacity>
      );
    }

    return gridCells;
  };

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <ThemedText style={dynamicStyles.headerText}>event calendar</ThemedText>
        </View>

        <ShadowSurface backgroundColor={colors.backgroundElement} radius={20} offset={5} wrapperStyle={styles.calendarShadow} style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity onPress={prevMonth} style={dynamicStyles.navBtn}>
              <ThemedText style={styles.boldText}>◀</ThemedText>
            </TouchableOpacity>

            <ThemedText style={styles.monthTitle}>
              {monthNames[month]} {year}
            </ThemedText>

            <TouchableOpacity onPress={nextMonth} style={dynamicStyles.navBtn}>
              <ThemedText style={styles.boldText}>▶</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={styles.dayLabelsRow}>
            {dayLabels.map((lbl, idx) => (
              <View key={idx} style={dynamicStyles.dayCell}>
                <ThemedText style={styles.dayLabelText}>{lbl}</ThemedText>
              </View>
            ))}
          </View>

          <View style={styles.gridContainer}>
            {renderGrid()}
          </View>
        </ShadowSurface>

        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>
            {prettyDate(selectedDateStr)}
          </ThemedText>
        </View>

        {selectedEvents.length === 0 ? (
          <ShadowSurface backgroundColor={colors.backgroundElement} radius={18} offset={4} wrapperStyle={styles.eventCardShadow} style={styles.eventCard}>
            <ThemedText style={styles.noEventsText}>
              NO EVENTS LINED UP FOR THIS DAY YET!
            </ThemedText>
          </ShadowSurface>
        ) : (
          selectedEvents.map((evt) => (
            <ShadowSurface
              key={evt.id}
              backgroundColor={colors.backgroundElement}
              radius={18}
              offset={4}
              wrapperStyle={styles.eventCardShadow}
              style={styles.eventCard}
              onPress={() => router.push(`/event-detail?id=${evt.id}`)}
            >
              <Badge label={evt.host} backgroundColor={evt.color} style={styles.hostBadge} />

              <ThemedText style={styles.eventTitle}>{evt.title}</ThemedText>

              <View style={styles.detailsRow}>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailText}>{evt.time}</ThemedText>
                </View>
                <View style={styles.detailItem}>
                  <ThemedText style={styles.detailText}>{evt.location}</ThemedText>
                </View>
              </View>

              <ThemedText style={styles.tapHint} themeColor="textSecondary">Tap to view →</ThemedText>
            </ShadowSurface>
          ))
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: 130,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  boldText: {
    fontWeight: '900',
    color: '#000',
    fontSize: 14,
  },
  calendarShadow: { marginBottom: Spacing.four },
  calendarCard: { padding: Spacing.three },
  eventCardShadow: { marginBottom: Spacing.three },
  eventCard: { padding: Spacing.three },
  hostBadge: { borderRadius: 8, marginBottom: Spacing.two },
  tapHint: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: Spacing.two },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: Spacing.one,
  },
  dayLabelText: {
    fontSize: 10,
    fontWeight: '900',
    opacity: 0.5,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sectionHeader: {
    marginTop: Spacing.two,
    marginBottom: Spacing.two,
  },
  sectionTitle: {
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: Spacing.two,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  detailEmoji: {
    fontSize: 14,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '800',
  },
  noEventsText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    opacity: 0.6,
  }
});
