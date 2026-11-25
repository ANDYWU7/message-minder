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
  ['Pressure', 'Pause if a message threatens trouble or says an offer will disappear unless you act right away.'],
  ['Impersonation', 'A logo or familiar caller ID can be copied. Use a phone number or website you already know is real.'],
  ['Unusual payment', 'A demand for gift cards, cryptocurrency, or a wire transfer is a major warning sign.'],
  ['Private information', 'Be careful with unexpected requests for passwords, verification codes, or financial details.'],
  ['Suspicious link', 'A fake account warning or invoice may try to get you to sign in. Open the official app yourself.'],
];
const recovery = {
  'I sent money': [
    'Call your bank or payment provider immediately using a number you know is real. Say it was a scam and ask if it can reverse the payment. Recovery isn’t guaranteed.',
    'Keep receipts and screenshots as evidence. Stop replying and avoid paying anyone who promises to get your money back.',
    'If you’re under 18, ask a trusted adult to help.',
  ],
  'I shared a password or code': [
    'Open the real website or app yourself. Change your password right away. If you can’t sign in, use the service’s official account recovery.',
    'Change the password on other accounts that used it. Sign out of other sessions, check the recovery details, and turn on two-step verification.',
    'If it was a banking account, call the bank using a known number. If you’re under 18, ask a trusted adult to help.',
  ],
  'I clicked a link': [
    'Close the page. If you entered a password or sent money, choose the matching option above.',
    'If you downloaded something, leave it unopened. Update your device and run a security scan if your device offers one. Ask someone you trust for help if you installed anything.',
    'Check the real app or website for unexpected activity. You can do this without reopening the link.',
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

function Screen() {
  const [tab, setTab] = useState('Check');
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [report, setReport] = useState(null);
  const [reports, setReports] = useState([]);
  const [reportsError, setReportsError] = useState(false);
  const [recoveryType, setRecoveryType] = useState('I sent money');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checking = useRef(false);
  const saving = useRef(false);
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
    if (checking.current || preview === null || (!preview && !screenshot)) return;
    checking.current = true;
    setBusy(true);
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
      setAnalysis(body);
    } catch {
      setError(isWeb ? webHelpError : helpError);
    } finally {
      clearTimeout(timeout);
      checking.current = false;
      setBusy(false);
    }
  }

  async function saveReport() {
    if (saving.current || !analysis || reportNotice?.saved) return;
    saving.current = true;
    try {
      const existing = JSON.parse((await AsyncStorage.getItem(REPORTS_KEY)) ?? '[]');
      const tags = [...new Set(analysis.warnings.map(({ sign }) => sign))];
      const date = new Date().toISOString();
      await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify([{ date, tags, message: screenshot ? null : preview, analysis }, ...existing].slice(0, 30)));
      setReport({ analysis, saved: true, message: isWeb ? 'Report saved in this browser.' : 'Report saved on this phone.' });
    } catch {
      setReport({ analysis, saved: false, message: 'Couldn’t save the report. Try again.' });
    } finally {
      saving.current = false;
    }
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
          <Text style={styles.body}>Paste a message or link, or add a screenshot. See what it’s asking for and what to do next.</Text>
        <View style={styles.card}>
          <Text style={styles.heading}>Message or link</Text>
          <Text style={styles.body}>Remove names, addresses, passwords, codes, and account details before sending.</Text>
          <Text style={styles.body}>{isWeb
            ? 'When you tap “Check with AI,” the server sends your preview to OpenAI.'
            : 'Only when you tap “Check with AI,” your preview goes through this computer to OpenAI. We don’t save checks on the computer.'}</Text>
          <TextInput accessibilityLabel="Message or link" style={styles.input} multiline maxLength={2000}
            value={draft} onChangeText={edit} editable={!busy} autoCorrect={false} autoCapitalize="none"
            placeholder="Paste it here" placeholderTextColor="#526677" />
          <Button label={screenshot ? 'Choose another screenshot' : 'Add screenshot'} secondary disabled={busy} onPress={chooseScreenshot} />
          {screenshot && <>
            <Image accessibilityLabel="Selected screenshot preview" source={{ uri: screenshot }} style={{ width: '100%', height: 260 }} resizeMode="contain" />
            <Text style={styles.body}>Checking sends this image to OpenAI. Crop or cover private details before choosing it. The app can’t hide details in images for you.</Text>
            <Button label="Remove screenshot" secondary disabled={busy} onPress={() => { setScreenshot(null); edit(draft); }} />
          </>}
          {preview === null ?
            <Button label="Review before sending" disabled={!draft.trim() && !screenshot} onPress={() => setPreview(redact(draft.trim()))} /> :
            <>
              <Text style={styles.heading}>Preview for OpenAI</Text>
              <Text style={styles.body}>Check this preview for private details. Go back to the text box to remove anything we missed.</Text>
              <Text style={styles.body}>For links, the AI checks the website name and any message you include. It can’t confirm the site is safe.</Text>
              {!!preview && <Text style={styles.preview}>{preview}</Text>}
              {busy && <ActivityIndicator color="#15604F" />}
              <Button label={busy ? 'Thinking…' : 'Check with AI'} onPress={analyze} disabled={busy} />
            </>}
          <Button label="Try an example" secondary disabled={busy} onPress={() => { setScreenshot(null); edit(sample); }} />
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
          <Button label="I already clicked, shared, or paid" onPress={() => setTab('Get help')} />
          <WarningDetails warnings={analysis.warnings} />
          {preview !== null && <>
          <Button label="Save a report for review" secondary onPress={saveReport} disabled={reportNotice?.saved} />
          <Text style={styles.body}>{screenshot ? 'Only the explanation is saved. The screenshot is left out of the report.' : isWeb
            ? 'Saves this preview and explanation in this browser for another review. Remove private details first. This doesn’t send a report to anyone.'
            : 'Saves this preview and explanation on this phone for another review. Remove private details first. This doesn’t send a report to the police or anyone else.'}</Text>
          {!!reportNotice && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{reportNotice.message}</Text>}
          </>}
        </View>}
      </>}
      {tab === 'Get help' && <>
        <Text accessibilityRole="header" style={styles.title}>What happened?</Text>
        <Text style={styles.body}>Scams can happen to anyone. Choose what happened to see steps you can take now.</Text>
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
          ? 'Reports stay in this browser. To ask the AI again, choose Review, then Check with AI.'
          : 'Review your saved previews and explanations. Reports stay on this phone. To ask the AI again, choose Review, then Check with AI.'}</Text>
        {reportsError && <Text style={styles.feedback}>Couldn’t read saved reports.</Text>}
        {!reportsError && reports.length === 0 && <Text style={styles.preview}>No saved reports yet.</Text>}
        {reports.map(({ date, tags, message, analysis: savedAnalysis }, index) => <View key={date + index} style={styles.card}>
          <Text style={styles.heading}>{new Date(date).toLocaleString()}</Text>
          <Text style={styles.body}>{tags.join(' · ') || 'No clear warning signs found'}</Text>
          {!!message && <Text style={styles.preview}>{message}</Text>}
          {!!savedAnalysis && <Text style={styles.body}>{savedAnalysis.intent}</Text>}
          {!!message && <Button label="Review this report" disabled={busy} onPress={() => { setScreenshot(null); edit(message); setPreview(message); setAnalysis(savedAnalysis ?? null); setTab('Check'); }} />}
          {!message && !!savedAnalysis && <Button label="Read saved explanation" disabled={busy} onPress={() => { setScreenshot(null); edit(''); setAnalysis(savedAnalysis); setTab('Check'); }} />}
          {tips.filter(([label]) => tags.includes(label)).map(([label, tip]) =>
            <Text key={label} style={styles.body}>{tip}</Text>)}
        </View>)}
        {!!reports.length && <Button label={isWeb ? 'Delete saved reports from this browser' : 'Delete saved reports from this phone'} secondary onPress={async () => {
          try { await AsyncStorage.removeItem(REPORTS_KEY); setReports([]); setReport(null); setReportsError(false); }
          catch { setReportsError(true); }
        }} />}
      </>}
      {tab === 'Tips' && <>
        <Text accessibilityRole="header" style={styles.title}>Common scam signs</Text>
        {tips.map(([label, tip]) => <View key={label} style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>{label}</Text>
          <Text style={styles.body}>{tip}</Text>
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
  input: { borderWidth: 1, borderColor: '#6A8B81', borderRadius: 12, minHeight: 110, maxHeight: 200, textAlignVertical: 'top', padding: 12, fontSize: 17, color: '#162E29' },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#15604F', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  buttonText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  secondary: { backgroundColor: '#E2EFE9' },
  secondaryText: { color: '#174538' },
  dim: { opacity: 0.6 },
  feedback: { fontSize: 17, color: '#723720', lineHeight: 24 },
  preview: { backgroundColor: '#EDF4F1', color: '#243E37', fontSize: 17, lineHeight: 24, padding: 12, borderRadius: 10 },
});
