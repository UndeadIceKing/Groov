import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, Dimensions,
  TouchableOpacity, Modal, Animated, PanResponder,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { lightImpact, mediumImpact } from '../utils/haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHART_H = 150;
const PARTIAL_COLOR = '#FDE68A';

// Card inner width: screen − 48 (scroll padding) − 40 (card padding=20×2) − 2 (border)
const HEAT_INNER = SCREEN_WIDTH - 90;

const PERIOD_CONFIG = [
  { label: '7d',  days: 7,   cellsPerRow: 7,  gap: 4 },
  { label: '30d', days: 30,  cellsPerRow: 10, gap: 4 },
  { label: '90d', days: 90,  cellsPerRow: 10, gap: 3 },
];

function cellSize(cfg) {
  return Math.floor((HEAT_INNER - (cfg.cellsPerRow - 1) * cfg.gap) / cfg.cellsPerRow);
}

// ─── Bar chart (always 7 days) ────────────────────────────────────────────────

function BarChart({ data, labels, theme, onBarPress }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', height: CHART_H }}>
        {/* Y-axis */}
        <View style={{ width: 32, height: CHART_H }}>
          {[100, 75, 50, 25, 0].map(y => (
            <Text
              key={y}
              style={{
                position: 'absolute',
                right: 4,
                top: ((100 - y) / 100) * (CHART_H - 14),
                fontSize: 9,
                color: theme.textMuted,
                textAlign: 'right',
                width: 28,
              }}
            >
              {y}%
            </Text>
          ))}
        </View>
        {/* Bars */}
        <View style={{ flex: 1, height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
          {data.map((val, i) => {
            const barH = Math.max((val / 100) * CHART_H, 3);
            return (
              <TouchableOpacity
                key={i}
                style={{ flex: 1, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}
                onPress={() => onBarPress?.(i, val)}
                activeOpacity={0.7}
              >
                <View style={{ width: '70%', height: barH, backgroundColor: theme.primary, borderRadius: 4 }} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {/* X-axis */}
      <View style={{ flexDirection: 'row', marginLeft: 32, marginTop: 4 }}>
        {labels.map((l, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: theme.textMuted }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Heatmap cell ─────────────────────────────────────────────────────────────

function HeatmapCell({ day, size, gap, theme, onPress }) {
  const { completed, total } = day;
  let bg = theme.progressBarBg;
  if (total > 0 && completed >= total) bg = theme.primary;
  else if (total > 0 && completed > 0) bg = PARTIAL_COLOR;

  return (
    <TouchableOpacity
      onPress={() => total > 0 && onPress?.(day)}
      activeOpacity={total > 0 ? 0.7 : 1}
      style={{ marginRight: gap, marginBottom: gap }}
    >
      <View style={{ width: size, height: size, borderRadius: Math.max(3, size * 0.18), backgroundColor: bg }} />
    </TouchableOpacity>
  );
}

// ─── Day detail sheet ─────────────────────────────────────────────────────────

function DayDetailModal({ visible, day, onClose, theme }) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [internalVisible, setInternalVisible] = useState(false);

  React.useEffect(() => {
    if (visible && day) {
      setInternalVisible(true);
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [visible, day]);

  const doClose = useCallback(() => {
    Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }).start(() => {
      setInternalVisible(false);
      onClose();
    });
  }, [translateY, onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => { if (gs.dy > 0) translateY.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) doClose();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80 }).start();
      },
    })
  ).current;

  if (!day) return null;

  const date = new Date(day.date + 'T00:00:00');
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const dayHabits = day.habits || [];
  const dayCompletions = day.rawCompletions || {};

  return (
    <Modal visible={internalVisible} animationType="none" transparent onRequestClose={doClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.sheet, { backgroundColor: theme.surface, transform: [{ translateY }] }]}>
          <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
            <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
          </View>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{dateLabel}</Text>
              <Text style={[styles.sheetSub, { color: theme.textMuted }]}>
                {day.completed}/{day.total} habits completed
              </Text>
            </View>
            <TouchableOpacity onPress={doClose} style={styles.closeBtn}>
              <Text style={[styles.closeBtnTxt, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.ratioBarBg, { backgroundColor: theme.progressBarBg }]}>
            <View style={[styles.ratioBarFill, {
              width: day.total > 0 ? `${(day.completed / day.total) * 100}%` : '0%',
              backgroundColor: theme.primary,
            }]} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>
            {dayHabits.length === 0 ? (
              <Text style={[styles.noData, { color: theme.textMuted }]}>No habit data for this day.</Text>
            ) : (
              dayHabits.map(h => {
                const count = dayCompletions[h.id] || 0;
                const done = count >= h.volumeGoal;
                return (
                  <View key={h.id} style={[styles.habitRow, { borderBottomColor: theme.border }]}>
                    <Text style={styles.habitIcon}>{h.icon || '📋'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.habitName, { color: theme.text }]}>{h.name}</Text>
                      {h.volumeGoal > 1 && (
                        <Text style={[styles.habitSub, { color: theme.textMuted }]}>{count}/{h.volumeGoal}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 18 }}>{done ? '✅' : '⬜'}</Text>
                  </View>
                );
              })
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Bar tooltip ──────────────────────────────────────────────────────────────

function BarTooltip({ label, value, onClose, theme }) {
  return (
    <TouchableOpacity style={styles.tooltipOverlay} onPress={onClose} activeOpacity={1}>
      <View style={[styles.tooltip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.tooltipLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.tooltipValue, { color: theme.primary }]}>{value}%</Text>
        <Text style={[styles.tooltipHint, { color: theme.textMuted }]}>completed</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { getLastNDays, getOverallStreak, habits, theme, completions } = useApp();
  const [heatPeriodIdx, setHeatPeriodIdx] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [tooltipInfo, setTooltipInfo] = useState(null);

  const heatCfg = PERIOD_CONFIG[heatPeriodIdx];

  // Always use 7 days for the bar chart
  const last7 = useMemo(() => getLastNDays(7), [getLastNDays]);
  // Use the selected period for the heatmap
  const heatDays = useMemo(() => getLastNDays(heatCfg.days), [getLastNDays, heatCfg.days]);

  const streak = getOverallStreak();
  const allDays30 = useMemo(() => getLastNDays(30), [getLastNDays]);
  const totalCompleted = allDays30.reduce((a, d) => a + (d.completed === d.total && d.total > 0 ? 1 : 0), 0);

  const chartLabels = useMemo(() =>
    last7.map(d => {
      const date = new Date(d.date + 'T00:00:00');
      return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][date.getDay()];
    }),
    [last7]
  );

  const chartData = useMemo(() =>
    last7.map(d => d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0),
    [last7]
  );

  const handleBarPress = (i, val) => {
    lightImpact();
    const d = last7[i];
    const date = new Date(d.date + 'T00:00:00');
    const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    setTooltipInfo({ label, value: val });
  };

  const handleDayPress = (day) => {
    lightImpact();
    const raw = completions[day.date] || {};
    setSelectedDay({ ...day, rawCompletions: raw });
  };

  const cs = cellSize(heatCfg);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, { color: theme.text }]}>Your Progress</Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: 'Day Streak', value: streak, emoji: '🔥' },
            { label: 'Perfect Days', value: totalCompleted, emoji: '⭐' },
            { label: 'Habits', value: habits.length, emoji: '📋' },
          ].map(stat => (
            <View key={stat.label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={styles.statEmoji}>{stat.emoji}</Text>
              <Text style={[styles.statValue, { color: theme.primary }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Weekly bar chart — always 7 days */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Habits Completed — Weekly</Text>
          <Text style={[styles.cardHint, { color: theme.textMuted }]}>Tap a bar for details</Text>
          <BarChart data={chartData} labels={chartLabels} theme={theme} onBarPress={handleBarPress} />
        </View>

        {/* Heatmap with period toggle */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>History</Text>
            <View style={styles.periodToggle}>
              {PERIOD_CONFIG.map((cfg, i) => (
                <TouchableOpacity
                  key={cfg.label}
                  style={[
                    styles.periodBtn,
                    { borderColor: theme.border },
                    heatPeriodIdx === i && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  onPress={() => { lightImpact(); setHeatPeriodIdx(i); }}
                >
                  <Text style={[styles.periodBtnText, { color: heatPeriodIdx === i ? '#fff' : theme.textMuted }]}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Legend */}
          <View style={styles.heatLegend}>
            {[
              { color: theme.progressBarBg, label: 'None' },
              { color: PARTIAL_COLOR, label: 'Partial' },
              { color: theme.primary, label: 'Perfect' },
            ].map(l => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                <Text style={[styles.legendLabel, { color: theme.textMuted }]}>{l.label}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.cardHint, { color: theme.textMuted }]}>Tap a cell for details</Text>

          {/* Grid: 7d uses a single flex row; 30d/90d use a wrapped fixed-size grid */}
          {heatCfg.days === 7 ? (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              {heatDays.map(d => {
                let bg = theme.progressBarBg;
                if (d.total > 0 && d.completed >= d.total) bg = theme.primary;
                else if (d.total > 0 && d.completed > 0) bg = PARTIAL_COLOR;
                return (
                  <TouchableOpacity
                    key={d.date}
                    onPress={() => d.total > 0 && handleDayPress(d)}
                    activeOpacity={d.total > 0 ? 0.7 : 1}
                    style={{ flex: 1, aspectRatio: 1 }}
                  >
                    <View style={{ flex: 1, borderRadius: 6, backgroundColor: bg }} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={[styles.heatGrid, { marginRight: -heatCfg.gap }]}>
              {heatDays.map(d => (
                <HeatmapCell
                  key={d.date}
                  day={d}
                  size={cs}
                  gap={heatCfg.gap}
                  theme={theme}
                  onPress={handleDayPress}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bar tap tooltip */}
      {tooltipInfo && (
        <BarTooltip
          label={tooltipInfo.label}
          value={tooltipInfo.value}
          onClose={() => setTooltipInfo(null)}
          theme={theme}
        />
      )}

      {/* Day detail sheet */}
      <DayDetailModal
        visible={!!selectedDay}
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
        theme={theme}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },
  heading: { fontSize: 28, fontWeight: 'bold', marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 20, paddingHorizontal: 8,
    borderRadius: 14, borderWidth: 1, gap: 6,
  },
  statEmoji: { fontSize: 26 },
  statValue: { fontSize: 26, fontWeight: 'bold' },
  statLabel: { fontSize: 11, textAlign: 'center', lineHeight: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 24 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardHint: { fontSize: 11, color: '#9CA3AF', marginTop: 2, marginBottom: 6 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  periodToggle: { flexDirection: 'row', gap: 5 },
  periodBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 16, borderWidth: 1.5 },
  periodBtnText: { fontSize: 11, fontWeight: '700' },
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  heatLegend: { flexDirection: 'row', gap: 14, marginBottom: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: 11 },
  // Day detail modal
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 8, maxHeight: '85%',
  },
  dragHandleArea: { alignItems: 'center', paddingVertical: 12 },
  handleBar: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold' },
  sheetSub: { fontSize: 13, marginTop: 2 },
  closeBtn: { padding: 4, marginLeft: 8 },
  closeBtnTxt: { fontSize: 18, fontWeight: 'bold' },
  ratioBarBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  ratioBarFill: { height: 8, borderRadius: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  habitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1,
  },
  habitIcon: { fontSize: 22 },
  habitName: { fontSize: 14, fontWeight: '600' },
  habitSub: { fontSize: 12, marginTop: 2 },
  // Bar tooltip
  tooltipOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  tooltip: {
    borderRadius: 16, borderWidth: 1, paddingHorizontal: 28, paddingVertical: 18,
    alignItems: 'center', minWidth: 150,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  tooltipLabel: { fontSize: 13, marginBottom: 4 },
  tooltipValue: { fontSize: 36, fontWeight: 'bold' },
  tooltipHint: { fontSize: 12, marginTop: 2 },
});
