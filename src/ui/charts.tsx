import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useColors } from '../state/AppContext';
import { formatRupiah, formatRupiahCompact, formatPercent } from '../domain/money';
import { formatDate } from '../domain/dates';
import { Row, Txt } from './components';
import { radius, space } from './theme';

function useWidth(initial = 300) {
  const [w, setW] = useState(initial);
  const onLayout = (e: LayoutChangeEvent) => {
    const nw = Math.floor(e.nativeEvent.layout.width);
    if (nw > 0 && Math.abs(nw - w) > 1) setW(nw);
  };
  return { width: w, onLayout };
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <Row gap={14} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
      {items.map((i) => (
        <Row key={i.label} gap={6}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: i.color }} />
          <Txt v="tiny">{i.label}</Txt>
        </Row>
      ))}
    </Row>
  );
}

export interface BarDatum {
  label: string;
  longLabel: string;
  income: number;
  expense: number;
}

/** Grouped income/expense bars. Tap a group for a tooltip. */
export function IncomeExpenseBars({ data, height = 190, highlightIndex }: { data: BarDatum[]; height?: number; highlightIndex?: number }) {
  const c = useColors();
  const { width, onLayout } = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const axisW = 46;
  const chartH = height - 28;
  const n = data.length;
  const minGroup = 26;
  const plotW = Math.max(width - axisW, n * minGroup);
  const groupW = n ? plotW / n : plotW;
  const barW = Math.max(4, Math.min(16, (groupW - 10) / 2));
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense))));
  const y = (v: number) => chartH - (v / max) * (chartH - 8);
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const selected = sel !== null ? data[sel] : null;
  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(plotW / 34)));

  return (
    <View onLayout={onLayout}>
      <View style={{ minHeight: 52, marginBottom: 6 }}>
        {selected ? (
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 10 }}>
            <Txt v="smallStrong">{selected.longLabel}</Txt>
            <Row gap={14} style={{ marginTop: 2, flexWrap: 'wrap' }}>
              <Txt v="small" color={c.income}>Masuk {formatRupiah(selected.income)}</Txt>
              <Txt v="small" color={c.expense}>Keluar {formatRupiah(selected.expense)}</Txt>
              <Txt v="small" color={c.text}>Bersih {formatRupiah(selected.income - selected.expense, { sign: true })}</Txt>
            </Row>
          </View>
        ) : (
          <Txt v="small" style={{ paddingTop: 8 }}>Ketuk batang untuk melihat detail.</Txt>
        )}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Svg width={axisW} height={height}>
          {ticks.map((t, i) => (
            <SvgText key={i} x={axisW - 6} y={y(t) + 4} fontSize={10} fill={c.textFaint} textAnchor="end">
              {formatRupiahCompact(t).replace('Rp', '')}
            </SvgText>
          ))}
        </Svg>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: Math.max(0, plotW - (width - axisW)), y: 0 }}>
          <Svg width={plotW} height={height}>
            {ticks.map((t, i) => (
              <Line key={i} x1={0} x2={plotW} y1={y(t)} y2={y(t)} stroke={c.border} strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3,4'} />
            ))}
            {data.map((d, i) => {
              const gx = i * groupW + groupW / 2;
              const active = sel === i || highlightIndex === i;
              const dim = sel !== null && sel !== i;
              return (
                <G key={i} opacity={dim ? 0.35 : 1} onPress={() => setSel(sel === i ? null : i)}>
                  <Rect x={i * groupW} y={0} width={groupW} height={chartH} fill={active ? c.surfaceAlt : 'transparent'} rx={6} />
                  <Rect x={gx - barW - 1} y={y(d.income)} width={barW} height={Math.max(0, chartH - y(d.income))} rx={Math.min(4, barW / 2)} fill={c.income} />
                  <Rect x={gx + 1} y={y(d.expense)} width={barW} height={Math.max(0, chartH - y(d.expense))} rx={Math.min(4, barW / 2)} fill={c.expense} />
                  {i % labelEvery === 0 || i === n - 1 ? (
                    <SvgText x={gx} y={height - 8} fontSize={10} fill={c.textMuted} textAnchor="middle">{d.label}</SvgText>
                  ) : null}
                </G>
              );
            })}
          </Svg>
        </ScrollView>
      </View>
      <Legend items={[{ color: c.income, label: 'Pemasukan' }, { color: c.expense, label: 'Pengeluaran' }]} />
    </View>
  );
}

/** Line/area chart for a series of values (e.g. balance). Drag or tap to inspect. */
export function TrendLine({ points, height = 150, color, formatLabel }: {
  points: { x: string; y: number }[]; height?: number; color?: string; formatLabel?: (x: string) => string;
}) {
  const c = useColors();
  const { width, onLayout } = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const stroke = color ?? c.accent;
  const pad = 8;
  const { path, area, xs, ys, min, max } = useMemo(() => {
    const vals = points.map((p) => p.y);
    let mn = Math.min(...vals, 0);
    let mx = Math.max(...vals, 0);
    if (mn === mx) { mx = mn + 1; }
    const range = mx - mn;
    mn -= range * 0.05; mx += range * 0.05;
    const n = points.length;
    const xs = points.map((_, i) => (n <= 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2)));
    const ys = points.map((p) => pad + (1 - (p.y - mn) / (mx - mn)) * (height - pad * 2));
    const path = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
    const area = n ? `${path} L${xs[n - 1].toFixed(1)},${height} L${xs[0].toFixed(1)},${height} Z` : '';
    return { path, area, xs, ys, min: mn, max: mx };
  }, [points, width, height]);
  if (!points.length) return null;
  const zeroY = pad + (1 - (0 - min) / (max - min)) * (height - pad * 2);
  const pick = (x: number) => {
    let best = 0;
    xs.forEach((px, i) => { if (Math.abs(px - x) < Math.abs(xs[best] - x)) best = i; });
    setSel(best);
  };
  const s = sel !== null ? points[sel] : points[points.length - 1];
  return (
    <View onLayout={onLayout}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <Txt v="small">{formatLabel ? formatLabel(s.x) : formatDate(s.x)}</Txt>
        <Txt v="smallStrong" color={s.y < 0 ? c.expense : c.text}>{formatRupiah(s.y)}</Txt>
      </Row>
      <View
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderRelease={() => setTimeout(() => setSel(null), 1800)}
      >
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.25} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {min < 0 && max > 0 ? <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={c.border} strokeDasharray="3,4" /> : null}
          <Path d={area} fill="url(#trendFill)" />
          <Path d={path} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {sel !== null ? (
            <G>
              <Line x1={xs[sel]} x2={xs[sel]} y1={0} y2={height} stroke={c.textFaint} strokeWidth={1} />
              <Circle cx={xs[sel]} cy={ys[sel]} r={5} fill={c.surface} stroke={stroke} strokeWidth={2.5} />
            </G>
          ) : (
            <Circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={4} fill={stroke} />
          )}
        </Svg>
      </View>
    </View>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = { x: cx + r * Math.cos(start), y: cy + r * Math.sin(start) };
  const e = { x: cx + r * Math.cos(end), y: cy + r * Math.sin(end) };
  const large = end - start > Math.PI ? 1 : 0;
  return `M${s.x},${s.y} A${r},${r} 0 ${large} 1 ${e.x},${e.y}`;
}

/** Donut chart with tappable slices and legend. */
export function Donut({ slices, size = 180, onSlicePress, centerLabel = 'Total' }: {
  slices: DonutSlice[]; size?: number; onSlicePress?: (key: string) => void; centerLabel?: string;
}) {
  const c = useColors();
  const [sel, setSel] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const stroke = 22;
  const r = (size - stroke) / 2 - 4;
  const cx = size / 2;
  let angle = -Math.PI / 2;
  const gap = slices.length > 1 ? 0.02 : 0;
  const selected = slices.find((s) => s.key === sel) ?? null;
  return (
    <View>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Circle cx={cx} cy={cx} r={r} stroke={c.surfaceAlt} strokeWidth={stroke} fill="none" />
            {total > 0 && slices.map((s) => {
              const sweep = (s.value / total) * Math.PI * 2;
              const start = angle + gap / 2;
              const end = angle + sweep - gap / 2;
              angle += sweep;
              if (sweep >= Math.PI * 2 - 0.001) {
                return <Circle key={s.key} cx={cx} cy={cx} r={r} stroke={s.color} strokeWidth={stroke} fill="none" onPress={() => setSel(s.key)} />;
              }
              const active = sel === s.key;
              return (
                <Path key={s.key} d={arcPath(cx, cx, r, start, Math.max(start + 0.001, end))} stroke={s.color} strokeWidth={active ? stroke + 6 : stroke}
                  fill="none" opacity={sel && !active ? 0.4 : 1} onPress={() => setSel(active ? null : s.key)} />
              );
            })}
          </Svg>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: stroke + 10 }}>
            <Txt v="tiny" center numberOfLines={1}>{selected ? selected.label : centerLabel}</Txt>
            <Txt v="bodyStrong" center numberOfLines={1}>{formatRupiahCompact(selected ? selected.value : total)}</Txt>
            {selected && total > 0 ? <Txt v="tiny" center>{formatPercent((selected.value / total) * 100, 1)}</Txt> : null}
          </View>
        </View>
      </View>
      <View style={{ marginTop: space.md }}>
        {slices.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <Pressable key={s.key} onPress={() => (onSlicePress ? onSlicePress(s.key) : setSel(s.key))} accessibilityRole="button"
              onLongPress={() => setSel(s.key)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10, opacity: pressed ? 0.6 : 1 })}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
              <Txt v="body" style={{ flex: 1 }} numberOfLines={1}>{s.label}</Txt>
              <Txt v="small" style={{ width: 54, textAlign: 'right' }}>{formatPercent(pct, 1)}</Txt>
              <Txt v="bodyStrong" style={{ minWidth: 96, textAlign: 'right' }} numberOfLines={1}>{formatRupiah(s.value)}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Simple horizontal bars for ranked lists (by account, by payment method). */
export function HBars({ items }: { items: { label: string; value: number; color: string }[] }) {
  const c = useColors();
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <View>
      {items.map((i) => (
        <View key={i.label} style={{ marginBottom: 10 }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <Txt v="small" color={c.text} numberOfLines={1} style={{ flex: 1 }}>{i.label}</Txt>
            <Txt v="smallStrong">{formatRupiah(i.value)} <Txt v="tiny">({total ? formatPercent((i.value / total) * 100) : '0%'})</Txt></Txt>
          </Row>
          <View style={{ height: 8, backgroundColor: c.surfaceAlt, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: `${(i.value / max) * 100}%`, height: 8, backgroundColor: i.color, borderRadius: 4 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Tiny sparkline used on the hero card. */
export function Sparkline({ values, width = 110, height = 34, color }: { values: number[]; width?: number; height?: number; color: string }) {
  if (values.length < 2) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - mn) / range) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
