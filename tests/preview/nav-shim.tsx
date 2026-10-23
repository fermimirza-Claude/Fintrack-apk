// Tiny stand-in for React Navigation, for the browser preview/smoke test only.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const RouteCtx = createContext<any>({ params: undefined });
const NavCtx = createContext<any>(null);
const OptionsCtx = createContext<(o: any) => void>(() => undefined);

let stackApi: any = null;
let tabApi: any = null;
let lastTab: any = null;

function collect(children: any): any[] {
  const out: any[] = [];
  React.Children.forEach(children, (c: any) => { if (c?.props?.name) out.push(c.props); });
  return out;
}

function Header({ title, canGoBack, onBack, c }: any) {
  return (
    <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: c?.bg ?? '#F4F6FA', color: c?.text ?? '#0B1F3A', fontFamily: 'Roboto, sans-serif', fontWeight: 700, fontSize: 19, flexShrink: 0 }}>
      {canGoBack ? <span role="button" aria-label="Kembali" onClick={onBack} style={{ cursor: 'pointer', fontSize: 22, padding: '0 8px' }}>←</span> : null}
      <span>{title}</span>
    </div>
  );
}

export function NavigationContainer({ children, theme }: any) {
  (window as any).__navTheme = theme;
  return <>{children}</>;
}
export const DefaultTheme = { colors: {} };
export const DarkTheme = { colors: {} };

export function createNativeStackNavigator() {
  function Navigator({ children }: any) {
    const screens = collect(children);
    const [stack, setStack] = useState<any[]>([{ name: screens[0].name, params: undefined, key: 0 }]);
    const [opts, setOpts] = useState<Record<number, any>>({});
    const api = useMemo(() => ({
      navigate: (name: string, params?: any) => {
        if (name === 'Tabs') {
          setStack((s) => [s[0]]);
          if (params?.screen) tabApi?.navigate(params.screen, params.params);
          return;
        }
        if (!screens.some((s) => s.name === name)) { setStack((s) => [s[0]]); tabApi?.navigate(name, params); return; }
        setStack((s) => [...s, { name, params, key: Date.now() + Math.random() }]);
      },
      goBack: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      replace: (name: string, params?: any) => setStack((s) => [...s.slice(0, -1), { name, params, key: Date.now() + Math.random() }]),
    }), []);
    stackApi = api;
    (window as any).__nav = api;
    const top = stack[stack.length - 1];
    const def = screens.find((s) => s.name === top.name)!;
    const route = { name: top.name, params: top.params };
    const baseOpts = typeof def.options === 'function' ? def.options({ route }) : def.options ?? {};
    const o = { ...baseOpts, ...(opts[top.key] ?? {}) };
    const nav = useMemo(() => ({ ...api, setOptions: (x: any) => setOpts((p) => {
      const cur = p[top.key] ?? {};
      if (Object.keys(x).every((k) => cur[k] === x[k])) return p;
      return { ...p, [top.key]: { ...cur, ...x } };
    }) }), [api, top.key]);
    const C = def.component;
    const c = (window as any).__navTheme?.colors;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: c?.background }}>
        {o.headerShown === false ? null : <Header title={o.title ?? top.name} canGoBack={stack.length > 1} onBack={api.goBack} c={{ bg: c?.background, text: c?.text }} />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          <NavCtx.Provider value={nav}><RouteCtx.Provider value={route}><C key={top.key} route={route} navigation={nav} /></RouteCtx.Provider></NavCtx.Provider>
        </div>
      </div>
    );
  }
  return { Navigator, Screen: (_: any) => null };
}

export function createBottomTabNavigator() {
  function Navigator({ children, screenOptions }: any) {
    const screens = collect(children);
    const [active, setActiveRaw] = useState(lastTab ?? { name: screens[0].name, params: undefined as any });
    const setActive = (v: any) => { lastTab = v; setActiveRaw(v); };
    tabApi = { navigate: (name: string, params?: any) => setActive({ name, params }) };
    const def = screens.find((s) => s.name === active.name)!;
    const so = screenOptions({ route: { name: active.name } });
    const C = def.component;
    const parentNav = useContext(NavCtx);
    const route = { name: active.name, params: active.params };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {def.options?.headerShown === false ? null : <Header title={def.options?.title} c={{ bg: so.headerStyle?.backgroundColor, text: so.headerTitleStyle?.color }} />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          <RouteCtx.Provider value={route}><NavCtx.Provider value={parentNav}><C key={active.name} route={route} navigation={parentNav} /></NavCtx.Provider></RouteCtx.Provider>
        </div>
        <div style={{ display: 'flex', height: 62, background: so.tabBarStyle?.backgroundColor, borderTop: `1px solid ${so.tabBarStyle?.borderTopColor}`, flexShrink: 0 }}>
          {screens.map((s) => {
            const on = s.name === active.name;
            const color = on ? so.tabBarActiveTintColor : so.tabBarInactiveTintColor;
            const tso = screenOptions({ route: { name: s.name } });
            return (
              <div key={s.name} role="tab" aria-label={s.options?.title} onClick={() => setActive({ name: s.name, params: undefined })} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color, fontFamily: 'Roboto, sans-serif', fontSize: 11, fontWeight: 600, gap: 3 }}>
                {tso.tabBarIcon({ focused: on, color, size: 24 })}
                {s.options?.title}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return { Navigator, Screen: (_: any) => null };
}

export function useNavigation() { return useContext(NavCtx); }
export function useRoute() { return useContext(RouteCtx); }
export function useFocusEffect(cb: () => void) { useEffect(() => { cb(); }, []); }
