import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, size } from './src/theme';
import MapScreen from './src/MapScreen';
import CheckinScreen from './src/CheckinScreen';
import * as db from './src/db';
import { iso } from './src/model';

/**
 * Shell: the Pattern Map, live from SQLite. Check-in, journal, day sheet
 * and settings are ported next — until then a clearly-labelled demo seed
 * lets the map be judged on a phone with real-looking data.
 */
export default function App() {
  const [entries, setEntries] = useState(() => db.getAll());
  const [checkin, setCheckin] = useState(false);
  const refresh = useCallback(() => setEntries(db.getAll()), []);
  const closeCheckin = useCallback(() => { setCheckin(false); refresh(); }, [refresh]);

  const seedDemo = useCallback(() => {
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      db.putClean(iso(d), { pain: (i * 3) % 11, cap: 5, note: '' });
    }
    const spread = new Date(today); spread.setDate(spread.getDate() - 2);
    db.putClean(iso(spread), {
      pain: 8, cap: 3, note: '',
      logs: [{ h: 540, pain: 4, loc: ['neck'] }, { h: 840, pain: 6 }, { h: 1200, pain: 8, loc: ['lowerBack'] }],
      factors: ['sleep', 'sitting'],
    });
    refresh();
  }, [refresh]);

  const clearAll = useCallback(() => { db.deleteAll(); refresh(); }, [refresh]);

  const empty = Object.keys(entries).length === 0;

  return (
    <View style={styles.root}>
      <Text style={styles.wordmark}>Pattern</Text>
      <MapScreen entries={entries} onDayPress={() => setCheckin(true)} />
      <Pressable onPress={() => setCheckin(true)} style={({ pressed }) => [styles.log, pressed && { opacity: 0.85 }]}>
        <Text style={styles.logText}>{entries[iso(new Date())] ? 'Add a log' : 'Add today'}</Text>
      </Pressable>
      <View style={styles.devRow}>
        {empty ? (
          <Pressable onPress={seedDemo}><Text style={styles.devLink}>Load demo month (dev)</Text></Pressable>
        ) : (
          <Pressable onPress={clearAll}><Text style={styles.devLink}>Clear data (dev)</Text></Pressable>
        )}
      </View>
      <Modal visible={checkin} animationType="fade" presentationStyle="fullScreen">
        <CheckinScreen onDone={closeCheckin} onClose={closeCheckin} />
      </Modal>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bgRoot,
    paddingTop: 68,
    paddingBottom: 40,
  },
  wordmark: {
    color: color.textPrimary, fontSize: 17, fontWeight: '600',
    paddingHorizontal: size.pageX, marginBottom: 26,
  },
  log: {
    height: 52, borderRadius: 14, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: size.pageX, marginTop: 26,
  },
  logText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  devRow: { alignItems: 'center', marginTop: 'auto' },
  devLink: { color: color.textTertiary, fontSize: 13, padding: 10 },
});
