// Minimal react-native → DOM shim used ONLY by the browser preview/smoke test (tests/preview).
// It is not part of the app; the real app uses react-native on Android.
import React, { createContext, useContext, useEffect, useState } from 'react';

const UNITLESS = new Set(['flex', 'flexGrow', 'flexShrink', 'opacity', 'fontWeight', 'zIndex', 'aspectRatio']);

function flatten(style: any): any {
  if (!style) return {};
  if (Array.isArray(style)) return style.reduce((acc, s) => Object.assign(acc, flatten(s)), {});
  return style;
}

export function toCss(style: any): React.CSSProperties {
  const s = flatten(style);
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('shadow') || k === 'elevation' || k === 'textAlignVertical' || k === 'includeFontPadding') continue;
    if (k === 'paddingHorizontal') { out.paddingLeft = px(v); out.paddingRight = px(v); continue; }
    if (k === 'paddingVertical') { out.paddingTop = px(v); out.paddingBottom = px(v); continue; }
    if (k === 'marginHorizontal') { out.marginLeft = px(v); out.marginRight = px(v); continue; }
    if (k === 'marginVertical') { out.marginTop = px(v); out.marginBottom = px(v); continue; }
    if (k === 'transform') continue;
    if (k === 'flex' && typeof v === 'number') { out.flexGrow = v; out.flexShrink = 1; out.flexBasis = 0; continue; }
    if (k === 'borderStyle') { out.borderStyle = v; continue; }
    out[k] = typeof v === 'number' && !UNITLESS.has(k) ? v + 'px' : v;
  }
  if (!s.borderStyle) {
    if (s.borderWidth) out.borderStyle = 'solid';
    for (const side of ['Top', 'Bottom', 'Left', 'Right']) if (s['border' + side + 'Width']) out['border' + side + 'Style'] = 'solid';
  }
  return out;
}
const px = (v: any) => (typeof v === 'number' ? v + 'px' : v);

const baseView: React.CSSProperties = { display: 'flex', flexDirection: 'column', position: 'relative', boxSizing: 'border-box', flexShrink: 0, minWidth: 0, minHeight: 0 };
const TextCtx = createContext(false);

export const View = React.forwardRef(function View(p: any, ref: any) {
  const { style, children, onLayout, pointerEvents, accessibilityLabel, onStartShouldSetResponder, onResponderGrant, onResponderMove, onResponderRelease } = p;
  const elRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (onLayout && elRef.current) {
      const r = elRef.current.getBoundingClientRect();
      onLayout({ nativeEvent: { layout: { width: r.width, height: r.height, x: r.x, y: r.y } } });
    }
  }, []);
  const css = { ...baseView, ...toCss(style), ...(pointerEvents === 'none' ? { pointerEvents: 'none' as const } : {}) };
  const handlers = onResponderGrant ? {
    onMouseDown: (e: any) => onResponderGrant({ nativeEvent: { locationX: e.nativeEvent.offsetX } }),
    onMouseMove: (e: any) => e.buttons && onResponderMove?.({ nativeEvent: { locationX: e.nativeEvent.offsetX } }),
    onMouseUp: () => onResponderRelease?.(),
  } : {};
  return <div ref={(el) => { elRef.current = el; if (typeof ref === 'function') ref(el); }} style={css} aria-label={accessibilityLabel} {...handlers}>{children}</div>;
});

export function Text({ style, children, numberOfLines, onPress }: any) {
  const nested = useContext(TextCtx);
  const css: any = { ...toCss(style) };
  if (!nested) {
    css.display = 'block';
    css.fontFamily = 'Roboto, system-ui, sans-serif';
    css.fontSize = css.fontSize ?? '14px';
    css.margin = 0;
  } else css.display = 'inline';
  if (numberOfLines === 1) { css.whiteSpace = 'nowrap'; css.overflow = 'hidden'; css.textOverflow = 'ellipsis'; }
  else if (numberOfLines) { css.display = '-webkit-box'; css.WebkitLineClamp = numberOfLines; css.WebkitBoxOrient = 'vertical'; css.overflow = 'hidden'; }
  return <TextCtx.Provider value={true}><span style={css} onClick={onPress}>{children}</span></TextCtx.Provider>;
}

export const TextInput = function TextInput(p: any) {
  const { style, value, onChangeText, placeholder, multiline, accessibilityLabel } = p;
  const css: any = { border: 'none', background: 'transparent', fontFamily: 'Roboto, system-ui, sans-serif', ...toCss(style), outline: 'none', fontSize: toCss(style).fontSize ?? '15px', boxSizing: 'border-box', resize: 'none' };
  if (multiline) return <textarea aria-label={accessibilityLabel ?? placeholder} style={css} value={value} placeholder={placeholder} onChange={(e) => onChangeText?.(e.target.value)} />;
  if (!css.width && !css.flexGrow && parseInt(css.fontSize) >= 30) css.width = `${Math.max(3, String(value || placeholder || '').length + 1)}ch`;
  return <input aria-label={accessibilityLabel ?? placeholder} style={css} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChangeText?.(e.target.value)} />;
};

export function ScrollView({ children, contentContainerStyle, horizontal, style, refreshControl }: any) {
  return (
    <div style={{ ...baseView, ...toCss(style), flexGrow: horizontal ? 0 : 1, flexShrink: 1, flexBasis: 'auto', minHeight: 0, overflowX: horizontal ? 'auto' : 'hidden', overflowY: horizontal ? 'hidden' : 'auto', scrollbarWidth: 'none' }} data-scroll={horizontal ? 'h' : 'v'}>
      <div style={{ ...baseView, ...(horizontal ? { flexDirection: 'row' } : {}), ...toCss(contentContainerStyle) }}>{children}</div>
    </div>
  );
}

export function Pressable({ style, children, onPress, onLongPress, disabled, accessibilityLabel, accessibilityRole }: any) {
  const st = typeof style === 'function' ? style({ pressed: false }) : style;
  return (
    <div role={accessibilityRole === 'button' || onPress ? 'button' : undefined} aria-label={accessibilityLabel} aria-disabled={disabled}
      onClick={disabled ? undefined : onPress} onContextMenu={(e) => { if (onLongPress) { e.preventDefault(); onLongPress(); } }}
      style={{ ...baseView, cursor: disabled ? 'default' : 'pointer', ...toCss(st) }}>
      {typeof children === 'function' ? children({ pressed: false }) : children}
    </div>
  );
}

export function Modal({ visible, children }: any) {
  if (!visible) return null;
  return <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column' }}>{children}</div>;
}

export function Switch({ value, onValueChange, disabled }: any) {
  return <div role="switch" aria-checked={!!value} onClick={() => !disabled && onValueChange?.(!value)}
    style={{ width: 40, height: 22, borderRadius: 11, background: value ? '#0FA3A3' : '#CBD5E1', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
    <div style={{ position: 'absolute', top: 2, left: value ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff' }} />
  </div>;
}

export function ActivityIndicator({ color }: any) {
  return <div style={{ width: 22, height: 22, borderRadius: 11, border: `3px solid ${color ?? '#0FA3A3'}`, borderTopColor: 'transparent' }} />;
}

export function KeyboardAvoidingView({ style, children }: any) {
  return <div style={{ ...baseView, ...toCss(style) }}>{children}</div>;
}

export function Image({ source, style }: any) {
  return <img src={source?.uri} style={toCss(style) as any} />;
}

export function RefreshControl() { return null; }

export function SectionList({ sections, renderItem, renderSectionHeader, keyExtractor, ListEmptyComponent, contentContainerStyle }: any) {
  return (
    <ScrollView contentContainerStyle={contentContainerStyle}>
      {sections.length === 0 ? ListEmptyComponent : sections.map((section: any, si: number) => (
        <React.Fragment key={si}>
          {renderSectionHeader?.({ section })}
          {section.data.map((item: any, index: number) => <React.Fragment key={keyExtractor(item)}>{renderItem({ item, index, section })}</React.Fragment>)}
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

class AnimValue {
  v: number;
  constructor(v: number) { this.v = v; }
  interpolate({ outputRange }: any) { return outputRange[1] === '100%' ? `${this.v}%` : outputRange[0]; }
}
export const Animated = {
  Value: AnimValue,
  timing: (val: AnimValue, cfg: any) => ({ start: () => { val.v = cfg.toValue; } }),
  View: (p: any) => {
    const st = flatten(p.style);
    const resolved: any = {};
    for (const [k, v] of Object.entries(st)) resolved[k] = v;
    return <View {...p} style={resolved} />;
  },
};
export const Easing = { out: (x: any) => x, cubic: 0 };
export const StyleSheet = { hairlineWidth: 1, create: (s: any) => s, absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } };
export const Platform = { OS: 'android', select: (o: any) => o.android ?? o.default };
export const Alert = {
  alert: (title: string, msg?: string, buttons?: any[]) => {
    (window as any).__alerts = [...((window as any).__alerts ?? []), { title, msg, buttons: (buttons ?? []).map((b) => b.text) }];
    (window as any).__lastAlertButtons = buttons ?? [];
  },
};
export const AppState = { addEventListener: () => ({ remove: () => undefined }) };
export function useColorScheme() { return (window as any).__scheme ?? 'light'; }
export type StyleProp<T> = any;
export type ViewStyle = any;
export type TextStyle = any;
export type LayoutChangeEvent = any;

export function useStateShim<T>(v: T) { return useState(v); }
