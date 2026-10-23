import React from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useApp } from '../state/AppContext';
import { dateToYMD, formatDate, ymdToDate } from '../domain/dates';
import { font, radius } from './theme';

function pad(n: number) { return n < 10 ? '0' + n : '' + n; }

export function DateField({ value, onChange, maximumDate, minimumDate, compact }: {
  value: string; onChange: (v: string) => void; maximumDate?: string; minimumDate?: string; compact?: boolean;
}) {
  const { colors: c, settings } = useApp();
  const open = () => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: ymdToDate(value),
      mode: 'date',
      maximumDate: maximumDate ? ymdToDate(maximumDate, '23:59') : undefined,
      minimumDate: minimumDate ? ymdToDate(minimumDate, '00:00') : undefined,
      onChange: (event: any, date?: Date) => {
        if (event?.type === 'set' && date) onChange(dateToYMD(date));
      },
    });
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Tanggal ${formatDate(value)}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
        borderRadius: radius.md, paddingHorizontal: compact ? 10 : 14, paddingVertical: compact ? 9 : 13, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name="calendar-outline" size={compact ? 15 : 18} color={c.textMuted} />
      <Text style={{ color: c.text, fontSize: compact ? font.small : font.body }} numberOfLines={1}>{formatDate(value, settings.dateFormat)}</Text>
    </Pressable>
  );
}

export function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors: c } = useApp();
  const open = () => {
    if (Platform.OS !== 'android') return;
    const [h, m] = value.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    DateTimePickerAndroid.open({
      value: d,
      mode: 'time',
      is24Hour: true,
      onChange: (event: any, date?: Date) => {
        if (event?.type === 'set' && date) onChange(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
      },
    });
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Waktu ${value}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
        borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, opacity: pressed ? 0.8 : 1 })}>
      <Ionicons name="time-outline" size={18} color={c.textMuted} />
      <Text style={{ color: c.text, fontSize: font.body }}>{value}</Text>
    </Pressable>
  );
}
