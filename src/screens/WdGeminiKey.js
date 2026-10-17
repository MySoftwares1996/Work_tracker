import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Card, Small, Btn, Field, Row } from '../ui';
import { useTheme } from '../theme';
import { loadGeminiKey, saveGeminiKey, generateWithKey } from '../aiBuiltin';

/** More > Gemini (AI) key: the person's own key, kept on this phone only and used only when the free route is busy (the website's Config > Gemini key). */
export default function WdGeminiKey() {
  const t = useTheme();
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState('');
  const [state, setState] = useState({ busy: false, msg: '', bad: false });
  useEffect(() => { loadGeminiKey().then((k) => setSaved(!!k)); }, []);
  const save = async () => { await saveGeminiKey(value); setSaved(!!value.trim()); setState({ busy: false, msg: value.trim() ? 'Saved on this phone.' : 'Removed.', bad: false }); setValue(''); };
  const test = async () => {
    setState({ busy: true, msg: '', bad: false });
    try {
      const key = value.trim() || (await loadGeminiKey());
      if (!key) throw new Error('Paste a key first.');
      const out = await generateWithKey('Reply with the single word: ready', key);
      setState({ busy: false, msg: `The key works (Gemini answered: ${out.slice(0, 40)}).`, bad: false });
    } catch (e) { setState({ busy: false, msg: String(e.message || e), bad: true }); }
  };
  return (
    <View>
      <Small style={{ marginBottom: 10 }}>The report rewrite uses the free Gemini route first. If it is busy or its daily limit is used, your own key (free at aistudio.google.com) is tried. It stays on this phone only.</Small>
      <Card>
        <Small style={{ marginBottom: 6 }}>{saved ? '✓ A key is saved on this phone.' : 'No key saved.'}</Small>
        <Field label="GEMINI API KEY" value={value} onChangeText={setValue} placeholder="Paste the key" autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Btn title="Save" onPress={save} />
          <Btn kind="soft" title={state.busy ? 'Testing...' : 'Test the key'} disabled={state.busy} onPress={test} />
        </Row>
        {!!state.msg && <Small style={{ marginTop: 8, color: state.bad ? t.danger : t.ok }}>{state.msg}</Small>}
      </Card>
    </View>
  );
}
