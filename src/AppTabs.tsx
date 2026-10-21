/**
 * The app's two places and its one action, in the system's own tab bar.
 *
 * THE REAL TAB BAR (21 Oct 2026, runtime 1.4.0). Navigation was a
 * floating glass pill drawn in React Native beside a round glass +,
 * modelled on iOS 26's bar. A model of the bar is never quite the bar:
 * the items sat crowded at one end of the pill (the press target, not
 * its inner view, has to take the flex), the material was a stand-in
 * on every phone before 26, and it re-implemented what UIKit does for
 * free — Liquid Glass that refracts what scrolls under it, the
 * selection animation, VoiceOver's tab traits, the large-content viewer,
 * Reduce Transparency, and the bar's own placement over the home
 * indicator. This is UITabBarController through react-native-bottom-tabs:
 * Today and Patterns in the bar, and the check-in as the separate round
 * button iOS 26 draws for a tab with the search role.
 *
 * THE + IS AN ACTION, NOT A PLACE. It is a tab only so the system draws
 * it where a thumb expects the one thing this app is for; it
 * `preventsDefault`, so pressing it never selects it — the check-in
 * sheet rises over whichever place you were in, and you are never "on"
 * the + (the rule the custom bar kept by drawing it outside the pill).
 *
 * WHITE, NEVER A HUE. Colour means pain; the selected tab is white over
 * the system's grey, as it was.
 *
 * NO SWIPE BETWEEN TABS. The two places sat side by side in a pager, so
 * a sideways swipe anywhere off a card changed tab. iOS tab bars do not
 * page, and the gesture fought every horizontal thing on Today and
 * Patterns. The bar is the way between them, as in every system app.
 *
 * NATIVE CODE, SO A NEW BINARY. The module ships in builds from runtime
 * 1.4.0; the version moved with it (tools/test-runtime.js) because no
 * guard can draw a system tab bar on a binary that lacks one. It is still
 * required inside try/catch, and on anything that cannot draw it — the
 * web preview, a development client without it — the pages fall back to
 * the RN bar in TabBar.tsx, so there is always a way between them.
 */
import React, { ReactNode, useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import TabBar, { TAB_ORDER, Tab } from './TabBar';

/* the system bar, or null where it cannot be drawn */
const Native: null | {
  TabView: React.ComponentType<any>;
  /* the bar's measured height, provided by the TabView to its scenes */
  Height: React.Context<number | undefined>;
} = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    const m = require('react-native-bottom-tabs');
    return m && m.default && m.BottomTabBarHeightContext
      ? { TabView: m.default, Height: m.BottomTabBarHeightContext } : null;
  } catch {
    return null;
  }
})();

/** true when the system tab bar is drawing */
export const NATIVE_TABS = !!Native;

/* room under the last card: the system bar's own height, measured, with
   a gap above it — the scenes run under the glass, which is the point
   of glass, so the end of a page has to be lifted clear of it. The RN
   fallback floats a 62pt bar and a + 18pt over the inset; 140 was what
   the pager left for it. */
const GAP_ABOVE_BAR = 24;
const FALLBACK_BOTTOM = 140;

function Scene({ t, renderPage }: { t: Tab; renderPage: (t: Tab, bottom: number) => ReactNode }) {
  const h = useContext(Native!.Height);
  return <View style={styles.fill}>{renderPage(t, (h || 0) + GAP_ABOVE_BAR)}</View>;
}

const LOG = 'log';

type Route = {
  key: string;
  title: string;
  focusedIcon: { sfSymbol: string };
  role?: 'search';
  preventsDefault?: boolean;
};

const ROUTES: Route[] = [
  { key: 'today', title: 'Today', focusedIcon: { sfSymbol: 'calendar' } },
  { key: 'trends', title: 'Patterns', focusedIcon: { sfSymbol: 'chart.line.uptrend.xyaxis' } },
  /* the search role is what iOS 26 draws as the separate circle; the
     title is what VoiceOver and the large-content viewer say */
  { key: LOG, title: 'Check in', focusedIcon: { sfSymbol: 'plus' }, role: 'search', preventsDefault: true },
];

export default function AppTabs({ tab, onTab, onLog, renderPage }: {
  tab: Tab;
  onTab: (t: Tab) => void;
  onLog: () => void;
  /** one place, whole: its title row, its scroll, and any layer on it;
   *  `bottom` is the padding its scroll needs to clear the bar */
  renderPage: (t: Tab, bottom: number) => ReactNode;
}) {
  if (!Native) {
    return (
      <View style={styles.fill}>
        {renderPage(tab, FALLBACK_BOTTOM)}
        <TabBar tab={tab} onChange={onTab} onLog={onLog} />
      </View>
    );
  }
  const { TabView } = Native;
  return (
    <TabView
      navigationState={{ index: TAB_ORDER.indexOf(tab), routes: ROUTES }}
      /* the + presses through here too — prevented, so the bar does not
         move, and turned into the check-in */
      onIndexChange={(i: number) => {
        const key = ROUTES[i] ? ROUTES[i].key : null;
        if (key === LOG) { onLog(); return; }
        if (key === 'today' || key === 'trends') onTab(key);
      }}
      /* tapping the tab you are on still reports it, which is how Today
         gets you back to Today from a day you had walked into */
      renderScene={({ route }: { route: Route }) => (
        route.key === LOG ? <View /> : <Scene t={route.key as Tab} renderPage={renderPage} />
      )}
      /* both places stay mounted, as they did in the pager — Patterns
         marks a finding as shown only when it is rendering it (App.tsx) */
      getLazy={() => false}
      labeled
      hapticFeedbackEnabled
      tabBarActiveTintColor="#FFFFFF"
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
