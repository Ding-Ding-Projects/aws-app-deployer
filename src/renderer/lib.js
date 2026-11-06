// Pure renderer logic. Loaded as a classic script in the app and as a CommonJS module in tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- Language modes: English, playful Hong Kong Cantonese, bilingual ----
  const STRINGS = {
    nav_deploys: ['Deploys', '部署'], nav_accounts: ['Accounts', '戶口'], nav_settings: ['Settings', '設定'], nav_help: ['Help', '幫手'],
    new_deployment: ['New deployment', '新部署'], deployments: ['Deployments', '部署'], setup: ['Setup', '開始設定'],
    no_deployments: ['No deployments yet', '未有部署住'], no_deployments_sub: ['Pick a Dockerfile or Compose file and press Deploy. You get a public link when AWS says it is healthy.', '揀個 Dockerfile 或者 Compose，撳部署。AWS 話健康就俾條公開連結你。'],
    charges: ['Deployments create real AWS resources and incur AWS charges.', '部署會喺 AWS 開真資源，係要俾錢㗎。'],
    charges_sub: ['A load balancer, a NAT gateway, two Fargate tasks, images in ECR and logs keep running until you delete them. Closing this app never deletes infrastructure.', '負載平衡器、NAT gateway、兩個 Fargate task、ECR 映像同 log 會一直行，直到你刪除。閂咗個 app 唔會刪任何嘢。'],
    checking: ['Checking this computer', '檢查緊呢部電腦'], install_missing: ['Install missing tools', '一撳裝晒欠嘅工具'],
    install_note: ['One click installs each publisher\'s signed installer and fixes common problems. Windows asks for your permission; this app never answers for you.', '一撳就由官方裝埋簽咗名嘅安裝程式，常見問題自動執。Windows 會問你批唔批，呢個 app 唔會幫你撳。'],
    all_ready: ['Everything is ready', '全部準備好'], continue: ['Continue', '繼續'], back: ['Back', '返轉頭'], next: ['Next', '下一步'], cancel: ['Cancel', '取消'], retry: ['Try again', '再試'],
    connect: ['Connect', '連接'], sign_in: ['Sign in with browser', '用瀏覽器登入'], signed_in: ['Signed in to AWS', '已登入 AWS'],
    waiting_browser: ['Finish signing in from your browser', '喺瀏覽器完成登入'], verified: ['Identity verified with AWS', 'AWS 確認咗你身份'],
    profiles: ['Profiles on this Windows user', '呢個 Windows 用戶嘅 profile'], no_profiles: ['No AWS profiles found', '搵唔到 AWS profile'],
    no_profiles_sub: ['Run "aws configure sso" once to add your organization\'s access portal, then refresh.', '行一次 "aws configure sso" 加入公司嘅 access portal，再重新整理。'],
    refresh: ['Refresh', '重新整理'], source: ['Source', '來源'], configure: ['Configure', '設定'], review: ['Review and deploy', '檢查同部署'], account: ['Account', '戶口'],
    choose_file: ['Choose a Dockerfile or Compose file', '揀 Dockerfile 或 Compose 檔'], deploy: ['Deploy', '部署'],
    app_name: ['Application name', '應用名稱'], port: ['Container port', 'Container 端口'], health: ['Health check path', '健康檢查路徑'],
    live: ['Live and healthy', '上咗線，好健康'], copy_link: ['Copy link', '複製連結'], open: ['Open', '打開'], copied: ['Link copied', '複製咗'],
    failed: ['The deployment stopped', '部署停咗'], needs_you: ['Needs you', '要你幫手'], still_running: ['Still running in AWS', 'AWS 仲行緊'],
    theme: ['Theme', '主題'], accent: ['Accent colour', '主色'], reduce_motion: ['Reduce motion', '減少動畫'], app_title: ['App name', 'App 名'],
    schedule: ['Schedule', '時間表'], language: ['Language', '語言'], funny: ['Funny level', '搞笑程度'], emoji: ['Emoji in messages', '訊息加 emoji'],
    narration: ['Read status aloud', '讀出狀態'], sounds: ['Action sounds', '動作音效'], vocabulary: ['Personal wording', '個人用字'],
    focus: ['Focus mode', '專注模式'], calm: ['Calm mode', '平靜模式'], school: ['School mode', '學校模式'], dim_sum: ['Dim sum surprise', '點心驚喜'],
    dim_sum_troll: ['Nice try. Dim sum surprise cannot be turned off.', '想熄？點心驚喜係熄唔到㗎。'],
    search_settings: ['Search settings', '搵設定'], palette: ['Command palette', '指令面板'], notifications: ['Notifications', '通知'], clear_all: ['Clear all', '清晒'],
    export_history: ['Export history', '匯出記錄'], unavailable: ['Not available on this computer', '呢部電腦用唔到'], reset: ['Reset', '重設'],
  };
  function t(key, lang) {
    const s = STRINGS[key]; if (!s) return key;
    if (lang === 'yue') return s[1];
    if (lang === 'both') return s[0] + ' · ' + s[1];
    return s[0];
  }

  // Funny level changes the wording around a fact, never the fact.
  const FUNNY = {
    success: [
      ['Deployment complete.', '部署完成。'],
      ['Deployed. Your app is live.', '部署好咗，個 app 上咗線。'],
      ['Deployed. Your app is out in the wild and behaving itself.', '搞掂！個 app 出咗街，仲好乖。'],
      ['Shipped. Your container is out there making friends.', '出貨！你個 container 出去識朋友喇。'],
      ['Shipped, healthy and showing off. Go tell someone.', '出晒貨、又健康、又威，快啲同人講！'],
    ],
    failure: [
      ['Deployment failed.', '部署失敗。'],
      ['That did not work. Here is what happened.', '唔得喎，睇吓發生咩事。'],
      ['Small hiccup. Here is exactly what tripped.', '有啲小意外，話你知邊度絆親。'],
      ['The cloud said no. Here is why, and what to do.', '雲話唔得。原因同解決方法喺度。'],
      ['Plot twist. Here is the culprit and the fix.', '劇情急轉！兇手同解藥喺下面。'],
    ],
  };
  function funny(kind, level, lang) {
    const row = FUNNY[kind][Math.min(5, Math.max(1, level | 0)) - 1];
    return lang === 'yue' ? row[1] : lang === 'both' ? row[0] + ' · ' + row[1] : row[0];
  }

  // ---- Personal vocabulary JSON: validated all at once, applied all at once ----
  const VOCAB_MAX_BYTES = 256 * 1024, VOCAB_MAX_ENTRIES = 500;
  function parseVocabulary(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'EMPTY' };
    if (byteLength(text) > VOCAB_MAX_BYTES) return { ok: false, error: 'TOO_LARGE' };
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: 'MALFORMED_JSON' }; }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) return { ok: false, error: 'SCHEMA' };
    const keys = Object.keys(data.entries);
    if (!keys.length || keys.length > VOCAB_MAX_ENTRIES) return { ok: false, error: 'ENTRY_COUNT' };
    // JSON.parse keeps the last duplicate silently; count raw keys inside "entries" to refuse them.
    const raw = (text.match(/"((?:[^"\\]|\\.)*)"\s*:/g) || []).map(k => JSON.parse(k.replace(/\s*:$/, '')));
    const seen = new Set();
    for (const k of raw) { if (k === 'version' || k === 'entries') continue; if (seen.has(k)) return { ok: false, error: 'DUPLICATE_KEY', key: k }; seen.add(k); }
    for (const [k, v] of Object.entries(data.entries)) {
      if (typeof v !== 'string' || !k.trim() || k.length > 64 || v.length > 64 || /[<>]/.test(k + v)) return { ok: false, error: 'ENTRY_INVALID', key: k };
    }
    return { ok: true, vocabulary: { version: 1, entries: { ...data.entries } } };
  }
  function byteLength(s) { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function applyVocabulary(text, vocabulary) {
    if (!vocabulary || !vocabulary.entries) return text;
    const keys = Object.keys(vocabulary.entries).sort((a, b) => b.length - a.length);
    if (!keys.length) return text;
    const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + keys.map(escapeRe).join('|') + ')(?=$|[^\\p{L}\\p{N}])', 'gu');
    return text.replace(re, (m, pre, word) => pre + vocabulary.entries[word]);
  }

  // ---- Regex builder: validate, explain tokens, test ----
  const TOKENS = [
    [/^\^/, 'start of text'], [/^\$/, 'end of text'], [/^\\d/, 'any digit'], [/^\\w/, 'any letter, digit or underscore'], [/^\\s/, 'any space'], [/^\\b/, 'word boundary'],
    [/^\.\*/, 'anything, any length'], [/^\./, 'any one character'], [/^\(\?:/, 'group (not captured)'], [/^\(/, 'start of group'], [/^\)/, 'end of group'], [/^\|/, 'or'],
    [/^\[[^\]]*\]/, 'one of these characters'], [/^\*/, 'repeat 0 or more times'], [/^\+/, 'repeat 1 or more times'], [/^\?/, 'optional'], [/^\{\d+(,\d*)?\}/, 'repeat count'],
    [/^\\./, 'the literal character'],
  ];
  function explainRegex(source, flags = 'i') {
    let re;
    try { re = new RegExp(source, flags); } catch (e) { return { ok: false, error: String(e.message || e) }; }
    const parts = [];
    let rest = source, literal = '';
    while (rest) {
      const hit = TOKENS.find(([r]) => r.test(rest));
      if (hit) { if (literal) { parts.push({ token: literal, meaning: 'the text "' + literal + '"' }); literal = ''; } const tok = hit[0].exec(rest)[0]; parts.push({ token: tok, meaning: hit[1] }); rest = rest.slice(tok.length); }
      else { literal += rest[0]; rest = rest.slice(1); }
    }
    if (literal) parts.push({ token: literal, meaning: 'the text "' + literal + '"' });
    return { ok: true, regex: re, parts };
  }
  function search(items, query, { regex = false } = {}) {
    if (!query) return { ok: true, items };
    if (regex) { const e = explainRegex(query); if (!e.ok) return e; return { ok: true, items: items.filter(i => e.regex.test(i.label)), parts: e.parts }; }
    const q = query.toLowerCase();
    return { ok: true, items: items.filter(i => i.label.toLowerCase().includes(q) || (i.keywords || '').toLowerCase().includes(q)) };
  }

  // ---- Colour translator: hex, rgb() and CSS names in, hex out ----
  const NAMED = { red: '#ff0000', green: '#008000', blue: '#0000ff', teal: '#008080', orange: '#ffa500', coral: '#ff7f50', gold: '#ffd700', pink: '#ffc0cb', purple: '#800080', white: '#ffffff', black: '#000000', gray: '#808080', grey: '#808080', navy: '#000080', lime: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', amber: '#ffbf00' };
  function parseColor(input) {
    if (typeof input !== 'string') return null;
    const v = input.trim().toLowerCase();
    if (NAMED[v]) return NAMED[v];
    let m = /^#?([0-9a-f]{3})$/.exec(v); if (m) return '#' + m[1].split('').map(c => c + c).join('');
    m = /^#?([0-9a-f]{6})$/.exec(v); if (m) return '#' + m[1];
    m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
    if (m && m.slice(1).every(n => +n <= 255)) return '#' + m.slice(1).map(n => (+n).toString(16).padStart(2, '0')).join('');
    m = /^hsl\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/.exec(v);
    if (m) return hslToHex(+m[1], +m[2], +m[3]);
    return null;
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
    return '#' + f(0) + f(8) + f(4);
  }
  function toRgb(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; }

  // ---- Scheduled appearance ----
  function scheduledTheme(schedule, date) {
    if (!schedule || !schedule.enabled || !schedule.days.includes(date.getDay())) return null;
    const mins = date.getHours() * 60 + date.getMinutes();
    const toM = s => +s.slice(0, 2) * 60 + +s.slice(3);
    const light = toM(schedule.lightAt), dark = toM(schedule.darkAt);
    if (light === dark) return null;
    const inLight = light < dark ? mins >= light && mins < dark : mins >= light || mins < dark;
    return inLight ? 'light' : 'dark';
  }

  // ---- Deployment stages: backend stage names to the nine visible steps ----
  const STAGES = [
    { id: 'validation', label: 'Inspect source' }, { id: 'identity', label: 'Verify identity' }, { id: 'prerequisites', label: 'Check prerequisites' },
    { id: 'ownership', label: 'Check resource ownership' }, { id: 'build', label: 'Build image' }, { id: 'publish', label: 'Publish to ECR', from: ['repository', 'push'] },
    { id: 'stack', label: 'Network, load balancer and service' }, { id: 'health', label: 'Wait for healthy targets' }, { id: 'endpoint', label: 'Verify public link' },
  ];
  function stageIndex(stage) { if (stage === 'complete') return STAGES.length; return STAGES.findIndex(s => s.id === stage || (s.from || []).includes(stage)); }

  const ERRORS = {
    AWS_LOGIN_REQUIRED: 'Your AWS sign-in expired. Sign in again; nothing was changed.',
    AWS_PERMISSION_DENIED: 'The signed-in role is missing permissions for this step.',
    AWS_CLI_UPDATE_REQUIRED: 'AWS CLI 2.22 or later is needed for browser sign-in.',
    UNSUPPORTED_COMPOSE: 'This Compose file uses features this version cannot deploy yet.',
    CONTAINER_PORT_REQUIRED: 'Choose the port your app listens on.',
    TARGETS_NOT_HEALTHY: 'The new tasks did not pass health checks, so the previous release kept serving.',
    ENDPOINT_NOT_READY: 'AWS finished, but the public link did not answer yet.',
    CANCELLED: 'Stopped waiting on this computer. AWS may still finish what it accepted.',
    TIMEOUT: 'This took too long and was stopped.',
    UNAVAILABLE: 'A required tool is not installed or not on PATH.',
    ELEVATION_DECLINED: 'The Windows permission prompt was declined, so nothing was installed.',
    POLICY_BLOCKED: 'A Windows or company policy blocked the installer.',
    SIGNATURE_INVALID: 'The downloaded installer was not signed by its publisher, so it was deleted and not run.',
    DOWNLOAD_FAILED: 'The installer could not be downloaded after 3 tries.',
    UNSUPPORTED_PLATFORM: 'Automatic install works on Windows only.',
    DOCKER_NOT_RUNNING: 'Docker installed but its engine did not start. Start Docker Desktop once, then check again.',
  };
  const errorText = code => ERRORS[code] || ('Stopped with code ' + code + '.');

  // Every setting explains what it does (not its label), with steps for a practice run.
  const EXPLAIN = {
    theme: { what: 'Chooses light or dark colours. System follows the Windows app mode and changes when Windows does.', steps: ['Pick Light or Dark on the practice control.', 'Pick System to follow Windows again.'] },
    accent: { what: 'Sets the colour used for primary buttons, the selected destination and focus rings. Status colours never change.', steps: ['Type a colour such as teal or rgb(0, 128, 128).', 'The preview swatch shows the translated hex value.'] },
    rainbow: { what: 'Cycles the accent through the colour wheel. With reduce motion on, it stays on one hue.', steps: ['Turn the practice switch on.', 'Turn reduce motion on to see it hold still.'] },
    reduceMotion: { what: 'Makes every animation and transition finish instantly. Progress still updates and nothing is hidden. Windows\' own reduce-motion setting turns this on too.', steps: ['Toggle the practice switch.', 'Real progress bars still move when values change.'] },
    displayName: { what: 'Renames how the app shows itself in its title bar and the taskbar. Files, settings and update channels keep the original name.', steps: ['Type a new name in the practice field.', 'Reset restores AWS App Deployer.'] },
    schedule: { what: 'Switches to light at one time and dark at another, every day, overriding the theme while it is on.', steps: ['Set light from 07:00 and dark from 19:00.', 'Turn it off to return to your chosen theme.'] },
    language: { what: 'Shows the interface in English, Hong Kong Cantonese, or both together. Commands and AWS names stay exact in every mode.', steps: ['Pick Both on the practice control.', 'Labels show English and Cantonese side by side.'] },
    funnyLevel: { what: 'Changes how playful the wording is around results, from plain (1) to very playful (5). Facts, numbers and safety warnings never change.', steps: ['Move the practice slider.', 'Read how the sample message changes while its fact stays the same.'] },
    emoji: { what: 'Adds an emoji to some success messages. Hidden entirely in School mode.', steps: ['Toggle the practice switch.'] },
    narration: { what: 'Reads status changes aloud with a voice installed on this computer. Off by default, one message at a time.', steps: ['Turn the practice switch on.', 'Choose a voice once the real switch is on.'] },
    voice: { what: 'Picks which installed voice reads status aloud. Choose automatically uses the system default.', steps: ['Pick a voice from the list.'] },
    rate: { what: 'Sets how fast narration speaks, from half speed to double speed.', steps: ['Move the practice slider.'] },
    sounds: { what: 'Plays short, quiet tones when a deployment starts, succeeds or stops.', steps: ['Toggle the practice switch.'] },
    focus: { what: 'Hides side panels so each screen leads with one obvious next action. Nothing is disabled.', steps: ['Toggle the practice switch.'] },
    calm: { what: 'Stops pulsing rings and looping highlights for a quieter screen. Progress still shows.', steps: ['Toggle the practice switch.'] },
    school: { what: 'Hides playful extras everywhere: the dim sum surprise, the funny level, emoji and playful wording.', steps: ['Toggle the practice switch.'] },
    vocabulary: { what: 'Replaces words in the interface with your own from a JSON file. It stays on this computer and applies all at once or not at all.', steps: ['Choose or drop a file shaped like {"version": 1, "entries": {"Deploy": "Ship"}}.', 'Clear restores the original words.'] },
    a11y: { what: 'Text size, contrast, focus rings and target size from the accessibility tools menu.', steps: ['Open the accessibility button in the title bar.'] },
  };
  const SETTINGS_ON_SCREEN = ['theme', 'accent', 'rainbow', 'reduceMotion', 'displayName', 'schedule', 'language', 'funnyLevel', 'emoji', 'narration', 'voice', 'rate', 'sounds', 'focus', 'calm', 'school', 'vocabulary', 'a11y'];

  return { EXPLAIN, SETTINGS_ON_SCREEN, STRINGS, t, funny, parseVocabulary, applyVocabulary, explainRegex, search, parseColor, toRgb, scheduledTheme, STAGES, stageIndex, errorText };
});
