import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { color, themes, size } from './src/theme';

/**
 * Foundation shell — proves the dark theme and Bloom ramp render
 * correctly on-device. Screens are ported from the PWA next:
 * Pattern Map → Check-in (tri-log) → Journal → Day sheet → Settings.
 */
export default function App() {
  const rampSample = [0, 2, 4, 6, 8, 10].map((v) => themes.bloom.ramp[v]);
  return (
    <View style={styles.root}>
      <Text style={styles.wordmark}>Pattern</Text>
      <View style={styles.center}>
        <View style={styles.dots}>
          {rampSample.map((c, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: c }]} />
          ))}
        </View>
        <Text style={styles.title}>Your days,{'\n'}as colour.</Text>
        <Text style={styles.body}>
          Native foundation is up. Map, check-in and journal arrive next.
        </Text>
      </View>
      <Text style={styles.footer}>Everything stays on this phone. No account.</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bgRoot,
    paddingHorizontal: size.pageX,
    paddingTop: 68,
    paddingBottom: 40,
  },
  wordmark: {
    color: color.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  center: { flex: 1, justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 22 },
  dot: { width: 22, height: 22, borderRadius: 11 },
  title: {
    color: color.textPrimary,
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: -0.5,
    lineHeight: 41,
  },
  body: {
    color: color.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
  },
  footer: {
    color: color.textTertiary,
    fontSize: 12,
    textAlign: 'center',
  },
});
