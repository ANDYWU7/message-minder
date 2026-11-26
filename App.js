import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { redact } from './privacy.cjs';

const REPORTS_KEY = 'message-minder-reports-v1';
const helpError = 'I couldn’t check this message. Check your Wi-Fi and make sure the AI helper is running, then try again.';
const webHelpError = 'I couldn’t check this message. Try again in a moment.';
const isWeb = Platform.OS === 'web';
const sample = 'Your bank account will be locked in 10 minutes. Verify your password at https://bank-alert.example/verify now.';
const tips = [
  ['Pressure', 'A text says your account will close in 10 minutes unless you respond.',
    'Pause. Check your account in the official app before you reply.'],
  ['Impersonation', 'Someone texts from a new number, says they’re your cousin, and asks for money.',
    'Call your cousin using the number you already have. Check with them before sending money.'],
  ['Unusual payment', 'A caller says you owe a fine and asks you to pay it with gift cards.',
    'Hang up. Keep the gift card numbers to yourself. If you’re worried about a real fine, look up the office’s official number.'],
  ['Private information', 'Someone claiming to be from your bank asks you to read back a sign-in code.',
    'Keep the code to yourself. If you’re worried about your account, call the number on your bank card.'],
  ['Suspicious link', 'A delivery text asks you to tap a link and pay a small fee.',
    'Skip the link. Check your order or tracking in the official store or delivery app.'],
];
const recovery = {
  'I sent money': [
    'Call your bank or payment provider now. Use the number on your card or in the official app. Say it was a scam and ask if they can reverse the payment.',
    'Save your receipts and screenshots.',
    'Stop replying. Don’t pay anyone who offers to get your money back.',
  ],
  'I shared a password or code': [
    'Open the official app or website and change your password now. If you’re locked out, use its account recovery option.',
    'Sign out of other devices. Check that the recovery email and phone number are yours, then turn on two-step verification.',
    'Change that password anywhere else you used it. If it was for your bank, call the number on your card.',
  ],
  'I clicked a link': [
    'Close the page. If you sent money or entered a password or code, pick that option above.',
    'Leave any downloads unopened. Update your device and run a security scan if you can. If you installed anything, ask someone you trust for help.',
    'Open the official app or website directly and check for activity you don’t recognize.',
  ],
};

function Button({ label, onPress, disabled, secondary, expanded }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} aria-expanded={expanded}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || pressed) && styles.dim]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}

function WarningDetails({ warnings }) {
  const [expanded, setExpanded] = useState(false);
  if (!warnings.length) return null;

  return <>
    <Button label={expanded ? 'Hide detailed warning signs' : 'Show detailed warning signs'}
      secondary expanded={expanded} onPress={() => setExpanded(!expanded)} />
    {expanded && <>
      <Text accessibilityRole="header" style={styles.heading}>Warning signs</Text>
      {warnings.map(({ sign, reason }, index) =>
        <Text key={index} style={styles.body}><Text style={styles.bold}>{sign}. </Text>{reason}</Text>
      )}
    </>}
  </>;
}

function SavedReportRow({ entry, busy, onReview }) {
  const [expanded, setExpanded] = useState(false);
  const { date, tags, message, analysis } = entry;
  const timestamp = new Date(analysis?.submittedAt || date).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const label = (analysis?.submittedAt ? 'Checked ' : 'Saved ') + timestamp;

  return <View style={styles.reportRow}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} aria-expanded={expanded}
      onPress={() => setExpanded(!expanded)} style={({ pressed }) => [styles.reportToggle, pressed && styles.dim]}>
      <Text style={[styles.body, styles.reportDate]} numberOfLines={1}>{label}</Text>
      <Text style={styles.body} aria-hidden>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded && <View style={styles.reportDetails}>
      {!!message && <Text style={styles.preview}>{message}</Text>}
      {analysis ? <>
        <Text accessibilityRole="header" style={styles.heading}>Saved AI explanation</Text>
        <Text style={styles.body}>{analysis.intent}</Text>
        {!!analysis.overview && <Text style={styles.body}>{analysis.overview}</Text>}
        <Text accessibilityRole="header" style={styles.heading}>Warning signs</Text>
        {analysis.warnings.length ? analysis.warnings.map(({ sign, reason }, index) =>
          <Text key={index} style={styles.body}><Text style={styles.bold}>{sign}. </Text>{reason}</Text>
        ) : <Text style={styles.body}>No clear warning signs found. The message still can’t be verified.</Text>}
        {!!analysis.nextSteps?.length && <>
          <Text accessibilityRole="header" style={styles.heading}>What to do next</Text>
          {analysis.nextSteps.map((step, index) => <Text key={index} style={styles.body}>{index + 1}. {step}</Text>)}
        </>}
      </> : <Text style={styles.body}>{tags.join(' · ') || 'No clear warning signs found'}</Text>}
      {!!message && <Button label="Open for another check" secondary disabled={busy} onPress={onReview} />}
    </View>}
  </View>;
}

function Screen() {
  const [tab, setTab] = useState('Check');
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [report, setReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportsError, setReportsError] = useState(false);
  const [reportLinkError, setReportLinkError] = useState('');
  const [recoveryType, setRecoveryType] = useState('I sent money');
  const [analyzing, setAnalyzing] = useState(false);
  const [savingNow, setSavingNow] = useState(false);
  const [error, setError] = useState('');
  const checking = useRef(false);
  const saving = useRef(false);
  const busy = analyzing || savingNow;
  const reportNotice = report?.analysis === analysis ? report : null;

  useEffect(() => {
    if (tab !== 'Reports') return;
    let active = true;
    AsyncStorage.getItem(REPORTS_KEY).then((data) => {
      if (!active) return;
      setReports(JSON.parse(data ?? '[]'));
      setReportsError(false);
    }).catch(() => { if (active) setReportsError(true); });
    return () => { active = false; };
  }, [tab, report]);

  function edit(value) {
    setDraft(value);
    setPreview(null);
    setAnalysis(null);
    setError('');
    setReport(null);
  }

  async function chooseScreenshot() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], base64: true, quality: 0.9,
      });
      if (result.canceled) return;
      const data = result.assets[0]?.base64;
      const mime = data?.startsWith('/9j/') ? 'image/jpeg' :
        data?.startsWith('iVBORw0KGgo') ? 'image/png' : null;
      if (!mime || data.length > 3_600_000) {
        setError('Choose a smaller JPG or PNG screenshot (up to about 2.7 MB).');
        return;
      }
      edit(draft);
      setScreenshot('data:' + mime + ';base64,' + data);
    } catch {
      setError('Couldn’t open that screenshot. Try choosing it again.');
    }
  }

  async function analyze() {
    if (checking.current || saving.current || preview === null || (!preview && !screenshot)) return;
    checking.current = true;
    setAnalyzing(true);
    setError('');
    setAnalysis(null);
    setReport(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      let endpoint = '/api/analyze';
      if (!isWeb) {
        const host = Constants.expoConfig?.hostUri?.split(':')[0];
        const helper = process.env.EXPO_PUBLIC_HELPER_URL || (host && 'http://' + host + ':8765');
        if (!helper) throw new Error();
        endpoint = helper + '/analyze';
      }
      const submittedAt = new Date().toISOString();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: preview, ...(screenshot && { screenshot }) }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) {
        setError(typeof body.error === 'string' ? body.error : (isWeb ? webHelpError : helpError));
        return;
      }
      setAnalysis({ ...body, submittedAt });
    } catch {
      setError(isWeb ? webHelpError : helpError);
    } finally {
      clearTimeout(timeout);
      checking.current = false;
      setAnalyzing(false);
    }
  }

  async function saveReport() {
    if (saving.current || checking.current || !analysis || preview === null) return;
    saving.current = true;
    setSavingNow(true);
    try {
      const existing = JSON.parse((await AsyncStorage.getItem(REPORTS_KEY)) ?? '[]');
      const tags = [...new Set(analysis.warnings.map(({ sign }) => sign))];
      const date = new Date().toISOString();
      await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify([{ date, tags, message: screenshot ? null : preview, analysis }, ...existing].slice(0, 30)));
      edit('');
      setScreenshot(null);
      setReport({ saved: true, message: 'Report saved. Find it in Reports.' });
    } catch {
      setReport({ analysis, saved: false, message: 'Couldn’t save the report. Try again.' });
    } finally {
      saving.current = false;
      setSavingNow(false);
    }
  }

  function openReportingSite(url) {
    setReportLinkError('');
    Linking.openURL(url).catch(() => setReportLinkError('Couldn’t open the reporting site. Try opening ' + url + ' in your browser.'));
  }

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" />
    <View style={styles.header}>
      <Text style={styles.brand}>MessageMinder</Text>
      <View style={styles.tabs}>
        {['Check', 'Get help', 'Reports', 'Tips'].map((label) =>
          <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: tab === label }}
            onPress={() => setTab(label)} style={[styles.tab, tab === label && styles.selected]}>
            <Text style={styles.tabText}>{label}</Text>
          </Pressable>)}
      </View>
    </View>
    <ScrollView key={tab} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {tab === 'Check' && <>
        <Text accessibilityRole="header" style={styles.title}>Does this look like a scam?</Text>
        {report?.saved && <View style={styles.card} accessibilityLiveRegion="polite">
          <Text style={styles.heading}>{report.message}</Text>
          <Button label="View reports" secondary onPress={() => setTab('Reports')} />
        </View>}
        <View style={styles.card}>
          <Text style={styles.heading}>Message or link</Text>
          <TextInput accessibilityLabel="Message or link" style={styles.input} multiline maxLength={2000}
            value={draft} onChangeText={edit} editable={!busy} autoCorrect={false} autoCapitalize="none"
            placeholder="Paste it here" placeholderTextColor="#526677" />
          <View style={styles.actionRow}>
            <View style={styles.actionItem}>
              <Button label={screenshot ? 'Replace screenshot' : 'Add screenshot'} secondary disabled={busy} onPress={chooseScreenshot} />
            </View>
            <View style={styles.actionItem}>
              <Button label="Try an example" secondary disabled={busy} onPress={() => { setScreenshot(null); edit(sample); }} />
            </View>
          </View>
          {screenshot && <>
            <Image accessibilityLabel="Selected screenshot preview" source={{ uri: screenshot }} style={{ width: '100%', height: 260 }} resizeMode="contain" />
            <Button label="Remove screenshot" secondary disabled={busy} onPress={() => { setScreenshot(null); edit(draft); }} />
          </>}
          {preview === null ?
            <Button label="Review before sending" disabled={!draft.trim() && !screenshot} onPress={() => setPreview(redact(draft.trim()))} /> :
            <>
              <Text style={styles.heading}>Preview for OpenAI</Text>
              <Text style={styles.body}>Remove names, passwords, codes, and other private details before sending. For screenshots, crop or cover them first.</Text>
              {!!preview && <Text style={styles.preview}>{preview}</Text>}
              {analyzing && <ActivityIndicator color="#15604F" />}
              <Button label={analyzing ? 'Thinking…' : 'Check with AI'} onPress={analyze} disabled={busy} />
            </>}
          {!!error && <Text accessibilityRole="alert" style={styles.feedback}>{error}</Text>}
        </View>
        {!!analysis && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>Quick overview</Text>
          <Text style={styles.body}>{analysis.intent}</Text>
          <Text style={styles.body}>{analysis.overview || (analysis.warnings.length
            ? 'This could be a scam. Open the warning signs to see which clues stood out.'
            : 'There isn’t enough evidence here to verify this message.')}</Text>
          <Text style={styles.preview}>AI can miss scams. Before replying, clicking, or paying, verify through a website or number you already trust.</Text>
          <Text accessibilityRole="header" style={styles.heading}>What to do next</Text>
          {analysis.nextSteps?.map((step, index) => <Text key={index} style={styles.body}>{index + 1}. {step}</Text>)}
          <View style={styles.resultActions}>
            <WarningDetails warnings={analysis.warnings} />
            <Button label="I already clicked, shared, or paid" secondary onPress={() => setTab('Get help')} />
            {preview !== null && <>
              <Button label={savingNow ? 'Saving…' : 'Save a report for review'} onPress={saveReport} disabled={busy} />
              <Text style={styles.body}>{screenshot ? 'Saves the explanation only.' : 'Saves the preview and explanation on this device.'}</Text>
              {!!reportNotice && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{reportNotice.message}</Text>}
            </>}
          </View>
        </View>}
      </>}
      {tab === 'Get help' && <>
        <Text accessibilityRole="header" style={styles.title}>What happened?</Text>
        <Text style={styles.preview}>Take a breath. Scams can happen to anyone. Pick what happened below and start with step 1. If you’re under 18, ask a trusted adult to help.</Text>
        {Object.keys(recovery).map((label) => <Button key={label} label={label} onPress={() => setRecoveryType(label)} secondary={label !== recoveryType} />)}
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{recoveryType}</Text>
          {recovery[recoveryType].map((step, index) => <Text key={step} style={styles.body}>{index + 1}. {step}</Text>)}
          <Button label="Read the FTC’s recovery guide" secondary onPress={() => Linking.openURL('https://consumer.ftc.gov/articles/what-do-if-you-were-scammed').catch(() => setError('Couldn’t open the guide.'))} />
        </View>
      </>}
      {tab === 'Reports' && <>
        <Text accessibilityRole="header" style={styles.title}>Saved reports</Text>
        <Text style={styles.body}>{isWeb
          ? 'Tap a date to read the saved AI explanation. Reports stay in this browser.'
          : 'Tap a date to read the saved AI explanation. Reports stay on this phone.'}</Text>
        {reportsError && <Text style={styles.feedback}>Couldn’t read saved reports.</Text>}
        {!reportsError && reports.length === 0 && <Text style={styles.preview}>No saved reports yet.</Text>}
        {!!reports.length && <View style={styles.reportList}>
          {reports.map((entry, index) => <SavedReportRow key={entry.date + index} entry={entry} busy={busy}
            onReview={() => {
              setScreenshot(null);
              edit(entry.message);
              setPreview(entry.message);
              setAnalysis(entry.analysis ?? null);
              setTab('Check');
            }} />)}
        </View>}
        {!!reports.length && <Button label={isWeb ? 'Delete saved reports from this browser' : 'Delete saved reports from this phone'} secondary onPress={async () => {
          try { await AsyncStorage.removeItem(REPORTS_KEY); setReports([]); setReport(null); setReportsError(false); }
          catch { setReportsError(true); }
        }} />}
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>Report a scam in the U.S.</Text>
          <Text style={styles.body}>Choose an official site and fill out its form yourself. Your saved report stays here.</Text>
          <Button label="Report fraud to the FTC" secondary onPress={() => openReportingSite('https://reportfraud.ftc.gov/')} />
          <Button label="Report online crime to the FBI" secondary onPress={() => openReportingSite('https://complaint.ic3.gov/')} />
          {!!reportLinkError && <Text accessibilityRole="alert" style={styles.feedback}>{reportLinkError}</Text>}
        </View>
      </>}
      {tab === 'Tips' && <>
        <Text accessibilityRole="header" style={styles.title}>Common scam signs</Text>
        {tips.map(([label, example, action]) => <View key={label} style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{label}</Text>
          <Text style={styles.body}><Text style={styles.bold}>Example. </Text>{example}</Text>
          <Text style={styles.body}><Text style={styles.bold}>What to do. </Text>{action}</Text>
        </View>)}
        <Button label="Source: FTC scam prevention guide" secondary onPress={() => Linking.openURL('https://consumer.ftc.gov/articles/how-avoid-scam').catch(() => setError('Couldn’t open the guide.'))} />
      </>}
    </ScrollView>
  </SafeAreaView>;
}

export default function App() {
  const app = <SafeAreaProvider><Screen /></SafeAreaProvider>;
  if (!isWeb) return app;

  return <View style={styles.webBackground}>
    <View style={styles.webFrame}>{app}</View>
  </View>;
}

const styles = StyleSheet.create({
  webBackground: { flex: 1, minHeight: 0, alignItems: 'center', backgroundColor: '#E7EBE9' },
  webFrame: { flex: 1, minHeight: 0, width: '100%', maxWidth: 400, overflow: 'hidden', backgroundColor: '#F2F6F4' },
  safe: { flex: 1, backgroundColor: '#F2F6F4' },
  header: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, backgroundColor: '#E0EEE8' },
  brand: { color: '#143A31', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tab: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, borderRadius: 12 },
  selected: { backgroundColor: '#BAD9CA' },
  tabText: { color: '#143A31', fontSize: 16, fontWeight: '700' },
  content: { padding: 18, paddingBottom: 36, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' },
  title: { fontSize: 31, fontWeight: '800', color: '#162E29' },
  heading: { fontSize: 20, fontWeight: '700', color: '#162E29' },
  body: { fontSize: 17, color: '#29423C', lineHeight: 25 },
  bold: { fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 18, gap: 12, borderWidth: 1, borderColor: '#CBDDD4' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionItem: { flexGrow: 1, flexBasis: 128 },
  resultActions: { borderTopWidth: 1, borderTopColor: '#CBDDD4', paddingTop: 12, gap: 8 },
  reportList: { gap: 6 },
  reportRow: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#CBDDD4' },
  reportToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 48 },
  reportDate: { flex: 1, fontWeight: '700' },
  reportDetails: { padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: '#CBDDD4' },
  input: { borderWidth: 1, borderColor: '#6A8B81', borderRadius: 12, minHeight: 110, maxHeight: 200, textAlignVertical: 'top', padding: 12, fontSize: 17, color: '#162E29' },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#15604F', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  buttonText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  secondary: { backgroundColor: '#E2EFE9' },
  secondaryText: { color: '#174538' },
  dim: { opacity: 0.6 },
  feedback: { fontSize: 17, color: '#723720', lineHeight: 24 },
  preview: { backgroundColor: '#EDF4F1', color: '#243E37', fontSize: 17, lineHeight: 24, padding: 12, borderRadius: 10 },
});
