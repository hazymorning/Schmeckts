// Packaging photos read by an AI on a key of the user's own, straight from this phone. The key lives in ai.json, which
// neither sync, backup, exchange file nor device transfer carries, and goes only to its provider.
import {Native} from './native.js';
import {read, schedule} from './disk.js';
import {report} from './report.js';
import {db} from './store.js';

const TIMEOUT = 45e3,
  CHECK_TIMEOUT = 15e3,
  KNOWN = 60;

// word for word server/recognize-prompt.txt, so the phone and the server answer alike
const PROMPT = `The photo shows cat food packaging (a can, tray, pouch, sack or treat).
Identify the brand and the variety. Answer with JSON ONLY, no markdown, in this form:
{"brand":"","variety":"","type":"Nassfutter|Trockenfutter|Snack|Sonstiges"}
"variety" is the variety, short and in German, e.g. "Huhn in Soße" or "Lachs Pastete".
Leave a value empty when it cannot be made out.`;

// the highest version in names like gpt-6.1-sol or gemini-3.8-flash
function newest(models, re) {
  const v = m => re.exec(m.id)[1].split('.').map(Number);
  return models.filter(m => re.test(m.id)).sort((a, b) => v(b)[0] - v(a)[0] || (v(b)[1] || 0) - (v(a)[1] || 0))[0];
}

/* Each provider's middle line, as the server takes Claude Sonnet. The model comes from the list the key may use
   today and is picked again once it is gone, so a retired model needs no app update. lean asks for little thinking,
   which a photo of a label does not need; a model that refuses it is asked without. */
export const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    models: 'https://api.anthropic.com/v1/models?limit=1000',
    headers: key => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    // newest first, and the line is a field of its own
    pick: d =>
      (d?.data || [])
        .filter(m => m.line === 'sonnet' && (m.lifecycle || 'active') === 'active')
        .map(m => ({id: m.id, name: m.display_name, can: m.capabilities}))
        .find(m => !m.can || m.can.image_input?.supported),
    url: () => 'https://api.anthropic.com/v1/messages',
    lean: {output_config: {effort: 'low'}},
    body: (model, text, b64) => ({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            ...(b64 ? [{type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: b64}}] : []),
            {type: 'text', text},
          ],
        },
      ],
    }),
    text: d => (d?.content || []).filter(c => c.type === 'text').map(c => c.text),
  },
  openai: {
    name: 'OpenAI',
    models: 'https://api.openai.com/v1/models',
    headers: key => ({Authorization: 'Bearer ' + key}),
    pick: d =>
      newest(
        (d?.data || []).map(m => ({id: m.id})),
        /^gpt-(\d+(?:\.\d+)?)(?:-sol)?$/,
      ),
    url: () => 'https://api.openai.com/v1/responses',
    lean: {reasoning: {effort: 'low'}},
    body: (model, text, b64) => ({
      model,
      store: false,
      max_output_tokens: 4096,
      input: [
        {
          role: 'user',
          content: [
            ...(b64 ? [{type: 'input_image', image_url: 'data:image/jpeg;base64,' + b64, detail: 'auto'}] : []),
            {type: 'input_text', text},
          ],
        },
      ],
    }),
    text: d =>
      (d?.output || [])
        .flatMap(o => o.content || [])
        .filter(c => c.type === 'output_text')
        .map(c => c.text),
  },
  google: {
    name: 'Google',
    models: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    headers: key => ({'x-goog-api-key': key}),
    // the alias Google moves along to each new Flash
    pick: d => {
      const models = (d?.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => ({id: String(m.name).replace(/^models\//, ''), name: m.displayName}));
      return models.find(m => m.id === 'gemini-flash-latest') || newest(models, /^gemini-(\d+(?:\.\d+)?)-flash$/);
    },
    url: model => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    lean: {generationConfig: {thinkingConfig: {thinkingLevel: 'low'}}},
    body: (model, text, b64) => ({
      contents: [{role: 'user', parts: [...(b64 ? [{inlineData: {mimeType: 'image/jpeg', data: b64}}] : []), {text}]}],
    }),
    text: d => (d?.candidates?.[0]?.content?.parts || []).filter(x => !x.thought).map(x => x.text || ''),
  },
};

// the prefixes the providers give their keys; Google's newer ones start with AQ.
const providerOf = key =>
  key.startsWith('sk-ant-') ? 'anthropic' : /^(AIza|AQ\.)/.test(key) ? 'google' : key.startsWith('sk-') ? 'openai' : '';

const tidy = x => ({
  on: x?.on === true,
  key: typeof x?.key === 'string' ? x.key : '',
  provider: PROVIDERS[x?.provider] ? x.provider : '',
  model: typeof x?.model === 'string' ? x.model : '',
  name: typeof x?.name === 'string' ? x.name : '',
});
export const ai = tidy(
  await read('ai').catch(e => {
    report('the own AI key', e);
    return null;
  }),
);
export const saveAi = () => schedule('ai', () => ({text: JSON.stringify(ai)}));
export const aiReady = () => ai.on && !!ai.key && !!PROVIDERS[ai.provider] && !!ai.model;
export const aiTrouble = {last: ''}; // why the last photo failed, for the settings

const failure = (kind, message, status = 0) => Object.assign(new Error(message), {kind, status});

function refused(p, {status, data}) {
  const said = JSON.stringify(data ?? '');
  if (status === 401 || status === 403 || said.includes('API_KEY_INVALID'))
    return failure('auth', `${p.name} hat den Schlüssel abgelehnt.`, status);
  if (status === 402 || /credit|billing|quota|spend/i.test(said))
    return failure('money', `Bei ${p.name} ist das Guthaben oder ein Limit aufgebraucht.`, status);
  if (status === 429) return failure('busy', `${p.name} ist gerade ausgelastet.`, status);
  if (status >= 500) return failure('unavailable', `${p.name} ist gerade gestört.`, status);
  return failure('bad', `${p.name} meldet einen Fehler (${status}).`, status);
}

async function send(p, url, key, body, timeout) {
  const headers = {...p.headers(key), ...(body ? {'Content-Type': 'application/json'} : {})},
    method = body ? 'POST' : 'GET',
    http = Native?.CapacitorHttp;
  let res;
  try {
    // the app's own HTTP, so no browser rule decides which provider may be asked
    if (http) {
      const r = await http.request({url, method, headers, data: body, connectTimeout: timeout, readTimeout: timeout});
      res = {status: r.status, data: r.data};
    } else {
      const r = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeout),
      });
      res = {status: r.status, data: await r.json().catch(() => null)};
    }
  } catch (e) {
    throw failure(
      'offline',
      /time/i.test(`${e?.name} ${e?.message}`)
        ? `${p.name} hat zu lange nicht geantwortet.`
        : `${p.name} ist nicht erreichbar. Ist das Handy online?`,
    );
  }
  if (res.status !== 200) throw refused(p, res);
  return res.data;
}

async function pick(p, key) {
  const found = p.pick(await send(p, p.models, key, null, CHECK_TIMEOUT));
  if (!found) throw failure('model', `${p.name} hat für diesen Schlüssel kein passendes Modell.`);
  return {model: found.id, name: found.name || found.id};
}

async function ask(p, key, model, text, b64 = '') {
  const body = p.body(model, text, b64),
    answer = await send(p, p.url(model), key, {...body, ...p.lean}, TIMEOUT).catch(e => {
      if (e.status !== 400) throw e;
      return send(p, p.url(model), key, body, TIMEOUT);
    });
  return p.text(answer).join('');
}

// {provider, key, model, name}; throws with a message for the person who pasted it
export async function aiCheck(input) {
  const key = String(input || '').replace(/\s+/g, ''),
    provider = providerOf(key);
  if (!provider) throw failure('input', 'Das ist kein Schlüssel von Anthropic, OpenAI oder Google.');
  const p = PROVIDERS[provider],
    found = await pick(p, key);
  await ask(p, key, found.model, 'Reply with OK.'); // a fraction of a cent, and it shows the key can pay
  return {provider, key, ...found};
}

// as the server does it: the household's newest varieties, so a known one comes back spelled the same
function prompt() {
  const known = db.products
    .map(p => ({brand: String(p.brand || '').trim(), variety: String(p.variety || '').trim(), at: p.createdAt || 0}))
    .filter(p => p.brand || p.variety)
    .sort((a, b) => b.at - a.at)
    .slice(0, KNOWN)
    .map(p => `${p.brand} | ${p.variety}`);
  return known.length
    ? `${PROMPT}\nProducts already known. If it is one of these, use exactly this spelling:\n${known.join('\n')}`
    : PROMPT;
}

// {brand, variety, type} as the server answers, or null when nothing could be made out
export async function aiRecognize(b64) {
  const p = PROVIDERS[ai.provider],
    text = prompt();
  let answer;
  try {
    answer = await ask(p, ai.key, ai.model, text, b64).catch(async e => {
      if (e.status !== 404) throw e;
      Object.assign(ai, await pick(p, ai.key)); // retired: the newest that fits takes over
      saveAi();
      return ask(p, ai.key, ai.model, text, b64);
    });
  } catch (e) {
    aiTrouble.last = e.message;
    throw e;
  }
  aiTrouble.last = '';
  const json = /\{[\s\S]*\}/.exec(answer.replace(/```(json)?/g, ''));
  try {
    return json ? JSON.parse(json[0]) : null;
  } catch {
    return null; // no JSON is nothing recognised, as on the server
  }
}
