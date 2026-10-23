import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useColors } from '../state/AppContext';
import { formatRupiah, formatPercent } from '../domain/money';
import { relativeDayLabel } from '../domain/dates';
import type { TxView } from '../domain/types';
import { font, radius, space, type Palette } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------------- text ----------------
type TxtVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'smallStrong' | 'tiny' | 'label';
export function Txt({ v = 'body', color, style, children, numberOfLines, center }: {
  v?: TxtVariant; color?: string; style?: StyleProp<TextStyle>; children?: React.ReactNode; numberOfLines?: number; center?: boolean;
}) {
  const c = useColors();
  const base: TextStyle = {
    h1: { fontSize: font.h1, fontWeight: '700', letterSpacing: -0.5 },
    h2: { fontSize: font.h2, fontWeight: '700', letterSpacing: -0.3 },
    h3: { fontSize: font.h3, fontWeight: '600' },
    body: { fontSize: font.body },
    bodyStrong: { fontSize: font.body, fontWeight: '600' },
    small: { fontSize: font.small },
    smallStrong: { fontSize: font.small, fontWeight: '600' },
    tiny: { fontSize: font.tiny },
    label: { fontSize: font.tiny, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  }[v] as TextStyle;
  const defaultColor = v === 'small' || v === 'tiny' || v === 'label' ? c.textMuted : c.text;
  return (
    <Text numberOfLines={numberOfLines} style={[base, { color: color ?? defaultColor }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

// ---------------- layout ----------------
export function Screen({ children, scroll = true, padded = true, refreshControl, footer }: {
  children: React.ReactNode; scroll?: boolean; padded?: boolean; refreshControl?: React.ReactElement; footer?: React.ReactNode;
}) {
  const c = useColors();
  const content = padded ? { padding: space.lg, paddingBottom: space.xxl * 2 } : undefined;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {scroll ? (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled" refreshControl={refreshControl as any}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}
      {footer}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, onPress, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  const c = useColors();
  const s: ViewStyle = {
    backgroundColor: c.surface, borderRadius: radius.lg, padding: padded ? space.lg : 0, marginBottom: space.md,
    borderWidth: c.mode === 'dark' ? 1 : 0, borderColor: c.border,
    shadowColor: c.shadow, shadowOpacity: c.mode === 'dark' ? 0 : 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: c.mode === 'dark' ? 0 : 2,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Spacer({ h = space.md }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function SectionHeader({ title, action, onAction, subtitle }: { title: string; action?: string; onAction?: () => void; subtitle?: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.md, marginBottom: space.sm }}>
      <View style={{ flex: 1 }}>
        <Txt v="h3">{title}</Txt>
        {subtitle ? <Txt v="small">{subtitle}</Txt> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Txt v="smallStrong" color={c.accent}>{action}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------- buttons ----------------
export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, style, small }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'income' | 'expense';
  icon?: IconName; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.mode === 'dark' ? c.accent : c.primary, secondary: c.surfaceAlt, ghost: 'transparent', danger: c.expense, income: c.income, expense: c.expense }[variant];
  const fg = variant === 'secondary' ? c.text : variant === 'ghost' ? c.accent : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.md, paddingVertical: small ? 9 : 14, paddingHorizontal: small ? 14 : 18,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: small ? font.small : font.body }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color, bg, size = 22, label }: { icon: IconName; onPress?: () => void; color?: string; bg?: string; size?: number; label?: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={({ pressed }) => ({ width: size + 18, height: size + 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: bg ?? 'transparent', opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

export function IconBadge({ icon, color, size = 40, soft = true }: { icon: string; color: string; size?: number; soft?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: soft ? color + '22' : color, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon as IconName} size={size * 0.5} color={soft ? color : '#FFF'} />
    </View>
  );
}

// ---------------- selection ----------------
export function Segmented<T extends string>({ options, value, onChange, style }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: active }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center', backgroundColor: active ? c.surface : 'transparent',
              shadowColor: c.shadow, shadowOpacity: active ? 0.08 : 0, shadowRadius: 4, elevation: active ? 1 : 0 }}>
            <Text numberOfLines={1} style={{ fontSize: font.small, fontWeight: active ? '700' : '500', color: active ? c.text : c.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, active, onPress, icon, color }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName; color?: string }) {
  const c = useColors();
  const tint = color ?? c.accent;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill,
        backgroundColor: active ? tint : c.surface, borderWidth: 1, borderColor: active ? tint : c.border, marginRight: 8, marginBottom: 8 }}>
      {icon ? <Ionicons name={icon} size={14} color={active ? '#FFF' : c.textMuted} /> : null}
      <Text style={{ fontSize: font.small, fontWeight: '600', color: active ? '#FFF' : c.text }}>{label}</Text>
    </Pressable>
  );
}

export function ChipScroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: space.lg }}>
      {children}
    </ScrollView>
  );
}

// ---------------- inputs ----------------
export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.md }}>
      <Txt v="smallStrong" style={{ marginBottom: 6 }} color={c.textMuted}>{label}</Txt>
      {children}
      {error ? <Txt v="small" color={c.expense} style={{ marginTop: 4 }}>{error}</Txt> : hint ? <Txt v="tiny" style={{ marginTop: 4 }}>{hint}</Txt> : null}
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput> & { invalid?: boolean }) {
  const c = useColors();
  const { invalid, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={c.textFaint}
      {...rest}
      style={[{ backgroundColor: c.surface, borderWidth: 1, borderColor: invalid ? c.expense : c.border, borderRadius: radius.md,
        paddingHorizontal: 14, paddingVertical: Platform.OS === 'android' ? 10 : 13, fontSize: font.body, color: c.text }, style]}
    />
  );
}

/** Tappable field that looks like an input and opens a picker. */
export function SelectField({ value, placeholder, onPress, icon, iconColor, invalid }: { value?: string | null; placeholder: string; onPress: () => void; icon?: IconName; iconColor?: string; invalid?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: invalid ? c.expense : c.border,
        borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, opacity: pressed ? 0.8 : 1 })}>
      {icon ? <Ionicons name={icon} size={18} color={iconColor ?? c.textMuted} /> : null}
      <Text numberOfLines={1} style={{ flex: 1, fontSize: font.body, color: value ? c.text : c.textFaint }}>{value || placeholder}</Text>
      <Ionicons name="chevron-down" size={16} color={c.textFaint} />
    </Pressable>
  );
}

export function SwitchRow({ label, value, onChange, hint, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Txt v="bodyStrong">{label}</Txt>
        {hint ? <Txt v="small">{hint}</Txt> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.accent, false: c.border }} thumbColor="#FFFFFF" />
    </View>
  );
}

// ---------------- lists ----------------
export function ListItem({ title, subtitle, icon, iconColor, right, onPress, danger, last }: {
  title: string; subtitle?: string; icon?: string; iconColor?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean; last?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 })}>
      {icon ? <IconBadge icon={icon} color={danger ? c.expense : iconColor ?? c.accent} size={36} /> : null}
      <View style={{ flex: 1 }}>
        <Txt v="bodyStrong" color={danger ? c.expense : undefined} numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt v="small" numberOfLines={2}>{subtitle}</Txt> : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={c.textFaint} /> : null}
    </Pressable>
  );
}

export function TxRow({ tx, onPress, last }: { tx: TxView; onPress?: () => void; last?: boolean }) {
  const c = useColors();
  const { settings } = useApp();
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const color = isTransfer ? c.primary : isIncome ? c.income : c.expense;
  const icon = isTransfer ? 'swap-horizontal' : tx.categoryIcon ?? 'pricetag-outline';
  const sub = isTransfer
    ? `${tx.accountName} → ${tx.toAccountName ?? ''}`
    : `${tx.categoryName ?? 'Tanpa kategori'} · ${tx.accountName}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${tx.title}, ${formatRupiah(tx.amount)}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 })}>
      <IconBadge icon={icon} color={isTransfer ? c.accent : tx.categoryColor ?? color} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="bodyStrong" numberOfLines={1}>{tx.title}</Txt>
        <Txt v="small" numberOfLines={1}>{sub}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: '45%' }}>
        <Txt v="bodyStrong" color={color} numberOfLines={1}>
          {isTransfer ? '' : isIncome ? '+' : '−'}{formatRupiah(tx.amount)}
        </Txt>
        <Txt v="tiny" numberOfLines={1}>{relativeDayLabel(tx.date, settings.dateFormat)} · {tx.time}</Txt>
      </View>
    </Pressable>
  );
}

export function ProgressBar({ percent, color, height = 8 }: { percent: number; color: string; height?: number }) {
  const c = useColors();
  const anim = useRef(new Animated.Value(0)).current;
  const p = Math.max(0, Math.min(100, percent));
  useEffect(() => {
    Animated.timing(anim, { toValue: p, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [p, anim]);
  return (
    <View style={{ height, backgroundColor: c.surfaceAlt, borderRadius: height, overflow: 'hidden' }}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color, width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

export function EmptyState({ icon, title, message, action, onAction }: { icon: IconName; title: string; message?: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.md }}>
        <Ionicons name={icon} size={34} color={c.accent} />
      </View>
      <Txt v="h3" center>{title}</Txt>
      {message ? <Txt v="small" center style={{ marginTop: 6, maxWidth: 300 }}>{message}</Txt> : null}
      {action ? <Button title={action} onPress={onAction} style={{ marginTop: space.lg }} icon="add" /> : null}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useColors();
  return (
    <Card style={{ backgroundColor: c.expenseSoft }}>
      <Txt v="bodyStrong" color={c.expense}>Terjadi kesalahan</Txt>
      <Txt v="small" style={{ marginTop: 4 }}>{message}</Txt>
      {onRetry ? <Button title="Coba lagi" small variant="secondary" onPress={onRetry} style={{ marginTop: 10, alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

/** Change indicator such as "▲ 12% vs 1–23 Sep". Shows "—" when no meaningful comparison exists. */
export function ChangeBadge({ change, goodWhenUp, onDark }: { change: number | null; goodWhenUp: boolean; onDark?: boolean }) {
  const c = useColors();
  if (change === null) return <Txt v="tiny" color={onDark ? c.heroMuted : c.textMuted}>Belum ada pembanding</Txt>;
  const up = change > 0;
  const flat = Math.abs(change) < 0.5;
  const good = flat ? null : up === goodWhenUp;
  const color = good === null ? (onDark ? c.heroMuted : c.textMuted) : good ? c.income : c.expense;
  return (
    <Row gap={3}>
      <Ionicons name={flat ? 'remove' : up ? 'arrow-up' : 'arrow-down'} size={12} color={color} />
      <Txt v="tiny" color={color} style={{ fontWeight: '700' }}>{formatPercent(Math.abs(change))}</Txt>
    </Row>
  );
}

/** Animated count-up for headline numbers. */
export function AnimatedAmount({ value, style, sign }: { value: number; style?: StyleProp<TextStyle>; sign?: boolean }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) { setShown(value); return; }
    const start = Date.now();
    const dur = 450;
    let frame: any;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * e));
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); fromRef.current = value; };
  }, [value]);
  return <Text style={style} numberOfLines={1} adjustsFontSizeToFit>{formatRupiah(shown, { sign })}</Text>;
}

// ---------------- sheets ----------------
export function Sheet({ visible, onClose, title, children, scroll = true }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; scroll?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="Tutup" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ backgroundColor: c.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '88%', paddingBottom: insets.bottom + space.md }}>
        <View style={{ alignItems: 'center', paddingTop: 10 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
        </View>
        {title ? (
          <Row style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, justifyContent: 'space-between' }}>
            <Txt v="h3" style={{ flex: 1 }}>{title}</Txt>
            <IconButton icon="close" onPress={onClose} label="Tutup" />
          </Row>
        ) : null}
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        ) : (
          <View style={{ paddingHorizontal: space.lg, flexShrink: 1 }}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  indent?: boolean;
}

export function SelectSheet({ visible, onClose, title, options, value, onSelect, emptyText }: {
  visible: boolean; onClose: () => void; title: string; options: SelectOption[]; value?: string | null; onSelect: (v: string) => void; emptyText?: string;
}) {
  const c = useColors();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.length === 0 ? <Txt v="small" style={{ paddingVertical: space.lg }}>{emptyText ?? 'Tidak ada pilihan.'}</Txt> : null}
      {options.map((o, i) => (
        <Pressable key={o.value} onPress={() => { onSelect(o.value); onClose(); }} accessibilityRole="button"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingLeft: o.indent ? 28 : 0,
            borderBottomWidth: i === options.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.border, opacity: pressed ? 0.7 : 1 })}>
          {o.icon ? <IconBadge icon={o.icon} color={o.color ?? c.accent} size={o.indent ? 30 : 36} /> : null}
          <View style={{ flex: 1 }}>
            <Txt v={o.indent ? 'body' : 'bodyStrong'}>{o.label}</Txt>
            {o.subtitle ? <Txt v="small">{o.subtitle}</Txt> : null}
          </View>
          {value === o.value ? <Ionicons name="checkmark-circle" size={22} color={c.accent} /> : null}
        </Pressable>
      ))}
    </Sheet>
  );
}

export function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Text style={{ color, fontSize: font.tiny, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function toneColors(c: Palette, tone: 'good' | 'warning' | 'bad' | 'neutral' | 'info') {
  switch (tone) {
    case 'good': return { fg: c.income, bg: c.incomeSoft };
    case 'warning': return { fg: c.warning, bg: c.warningSoft };
    case 'bad': return { fg: c.expense, bg: c.expenseSoft };
    case 'info': return { fg: c.accent, bg: c.accentSoft };
    default: return { fg: c.textMuted, bg: c.surfaceAlt };
  }
}

export function InfoNote({ children, icon = 'information-circle-outline' }: { children: React.ReactNode; icon?: IconName }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 8, backgroundColor: c.accentSoft, borderRadius: radius.md, padding: space.md, marginBottom: space.md }}>
      <Ionicons name={icon} size={18} color={c.accent} style={{ marginTop: 1 }} />
      <Txt v="small" color={c.text} style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}
