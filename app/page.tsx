'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clipboard, FileText, FlaskConical, Focus, Layers3, LoaderCircle, Plus, ScanLine, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { EXAMPLE_STORY } from '../lib/example';
import { DEMO_REVIEW } from '../lib/demo';
import type { FindingType, Review } from '../lib/types';

const labels: Record<FindingType, string> = { ambiguity: 'Неоднозначность', missing_criteria: 'Пробел в бизнес-правиле', conflict: 'Противоречие' };
const priorities = { high: 'Высокая', medium: 'Средняя', low: 'Низкая' };
const changeLabels = { editorial: 'Редакционная правка', decision_required: 'Нужно решение BA', ba_decision: 'Решение BA' };
type Tab = 'review' | 'rewrite' | 'changes';

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.hidden = true;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function reportMarkdown(r: Review) {
  return `# Storylens — ${r.meta.demo ? 'демонстрационное' : 'AI'} ревью\n\n${r.summary}\n\n## Сильные стороны\n\n${r.strengths.map(s => `- ${s}`).join('\n')}\n\n${r.findings.map(f => `## ${f.id}. ${f.title}\n\n${labels[f.type]} · ${priorities[f.priority]} важность · ${f.certainty === 'confirmed' ? 'Подтверждено текстом' : 'Нужен контекст'}\n\n${f.evidence.map(q => `> ${q.replaceAll('\n', '\n> ')}`).join('\n\n')}\n\n${f.explanation}\n\n**Вопрос:** ${f.question}\n\n**Предложение:** ${f.suggestion}`).join('\n\n')}\n\n## Изменения\n\n${r.changes.map(c => `- ${changeLabels[c.kind]}: ${c.description}`).join('\n')}\n\n## Открытые вопросы\n\n${r.openQuestions.map(q => `- ${q.findingId}: ${q.question}`).join('\n')}\n\n---\n${r.meta.provider} · ${r.meta.model} · ${r.meta.policyVersion}`;
}

export default function Home() {
  const [story, setStory] = useState(EXAMPLE_STORY);
  const [context, setContext] = useState('');
  const [language, setLanguage] = useState('ru');
  const [review, setReview] = useState<Review | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [tab, setTab] = useState<Tab>('review');
  const [filter, setFilter] = useState<'all' | FindingType>('all');
  const [settings, setSettings] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<{ findingId: string; question: string; answer: string }[]>([]);
  const [showContext, setShowContext] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const policyRef = useRef<HTMLDialogElement>(null);
  const stale = !!review && snapshot !== JSON.stringify([story, context, language]);
  const answered = Object.values(answers).filter(a => a.trim()).length;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); }, [notice]);
  useEffect(() => { if (settings) settingsRef.current?.showModal(); else settingsRef.current?.close(); }, [settings]);
  useEffect(() => { if (policy) policyRef.current?.showModal(); else policyRef.current?.close(); }, [policy]);

  function reset() { if (busy) return; setStory(''); setReview(null); setContext(''); setAnswers({}); setDecisions([]); setError(''); setSnapshot(''); editor.current?.focus(); }
  function demo() {
    if (busy) return;
    setStory(EXAMPLE_STORY); setContext(''); setLanguage('ru'); setReview(DEMO_REVIEW); setSnapshot(JSON.stringify([EXAMPLE_STORY, '', 'ru'])); setAnswers({}); setDecisions([]); setTab('review'); setFilter('all'); setError('');
  }
  function selectQuote(quote: string) {
    const index = story.indexOf(quote); if (index < 0) return;
    editor.current?.focus(); editor.current?.setSelectionRange(index, index + quote.length);
    if (editor.current) editor.current.scrollTop = Math.max(0, (story.slice(0, index).split('\n').length - 1) * 23 - editor.current.clientHeight / 3);
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setNotice('Скопировано'); } catch { setNotice('Не удалось скопировать. Используйте экспорт Markdown.'); } }
  async function upload(file?: File) {
    if (!file || busy) return;
    if (!/\.(md|txt)$/i.test(file.name)) { setError('Поддерживаются файлы .md и .txt.'); return; }
    if (file.size > 200000) { setError('Файл слишком большой. Максимум 200 КБ и 50 000 символов.'); return; }
    try { const text = await file.text(); if (text.length > 50000) throw new Error('Стори слишком длинная. Максимум 50 000 символов.'); setStory(text); setAnswers({}); setDecisions([]); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось прочитать файл.'); }
  }
  async function analyze() {
    if (busy) return;
    if (story.trim().length < 30) { setError('Добавьте стори: минимум 30 символов.'); editor.current?.focus(); return; }
    if (!key.trim()) { setSettings(true); setError('Для AI-анализа добавьте Claude API-ключ. Демо-разбор доступен без ключа.'); return; }
    setBusy(true); setError('');
    const currentSnapshot = JSON.stringify([story, context, language]);
    const requestController = new AbortController(); controller.current = requestController;
    const timeout = setTimeout(() => requestController.abort(), 130000);
    const submittedAnswers = !stale && review ? review.findings.filter(f => answers[f.id]?.trim()).map(f => ({ findingId: f.id, question: f.question, answer: answers[f.id].trim() })) : [];
    const combinedAnswers = [...decisions, ...submittedAnswers];
    try {
      const response = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: requestController.signal, body: JSON.stringify({ story, context, language, apiKey: key, model, answers: combinedAnswers }) });
      const payload = await response.json() as Review & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить анализ.');
      setReview(payload); setSnapshot(currentSnapshot); setAnswers({}); setDecisions(combinedAnswers); setTab('review'); setFilter('all');
    } catch (e) { setError(e instanceof Error && e.name === 'AbortError' ? 'Ожидание остановлено. Сервер мог завершить запрос; автоматического повтора нет.' : e instanceof Error ? e.message : 'Не удалось связаться с сервером.'); }
    finally { clearTimeout(timeout); setBusy(false); controller.current = null; }
  }

  const findings = review?.findings.filter(f => filter === 'all' || f.type === filter) ?? [];
  return <div className="app-shell">
    <aside className="rail">
      <a className="brand" href="/" aria-label="Storylens — главная"><span className="brand-mark"><ScanLine size={23} strokeWidth={1.6}/></span><span>storylens<span className="brand-dot">.</span></span></a>
      <div className="rail-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <div className="rail-nav active"><Focus size={18}/><span>Проверка стори</span><span className="nav-count">01</span></div>
      <button className="rail-nav" onClick={() => setPolicy(true)}><ShieldCheck size={18}/><span>Правила проверки</span></button>
      <div className="rail-divider"/>
      <div className="rail-label">НАЧАТЬ С ПРИМЕРА</div>
      <button className="sample-link" onClick={demo} disabled={busy}><FileText size={17}/><span>Submitted Order Details<small>WKSP-ORDS-3 · User story</small></span><ChevronRight size={15}/></button>
      <div className="rail-bottom"><div className="rail-note"><span>✦</span><p>Меньше догадок.<br/><strong>Больше ясности.</strong></p><small>Бизнес-логика в центре<br/>каждой проверки.</small></div><button className="rail-nav" onClick={() => setSettings(true)}><Settings2 size={18}/><span>Подключение AI</span><span className={`connection-dot ${key ? 'connected' : ''}`}/></button><div className="profile"><span>BA</span><div>Business Analyst<small>Личное пространство</small></div></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span className="muted">Workspace</span><ChevronRight size={13}/><span>Проверка стори</span></div><button className="connection-button" onClick={() => setSettings(true)}><span className={`connection-dot ${key ? 'connected' : ''}`}/><span>{key ? 'Ключ Claude добавлен' : 'Подключить Claude'}</span><Settings2 size={14}/></button></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span/> ДЛЯ БИЗНЕС-АНАЛИТИКОВ</div><h1>От стори — к ясным требованиям<span>.</span></h1><p>Найдите неоднозначности, пробелы и противоречия в бизнес-логике.</p></div><button className="button secondary new-story" onClick={reset} disabled={busy}><Plus size={16}/>Новая стори</button></div>
        <div className="policy-strip"><ShieldCheck size={19}/><p><strong>Бизнес-логика в фокусе.</strong> Стандартное поведение UI подразумевается. Проверяем правила, данные и ограничения.</p><button onClick={() => setPolicy(true)}>Наш подход <ArrowRight size={14}/></button></div>
        <div className="workspace">
          <section className="editor-panel" aria-label="Исходная стори">
            <div className="panel-heading"><div><span className="section-number">01</span><h2>Исходная стори</h2></div><button className="text-button" onClick={() => fileInput.current?.click()} disabled={busy}><Plus size={15}/>Загрузить файл</button><input ref={fileInput} type="file" accept=".md,.txt,text/plain,text/markdown" hidden onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }}/></div>
            <div className="document-toolbar"><div><FileText size={15}/><span>{story === EXAMPLE_STORY ? 'WKSP-ORDS-3.md' : 'user-story.md'}</span>{story === EXAMPLE_STORY && <span className="example-tag">ПРИМЕР</span>}</div><span>Markdown</span></div>
            <div className="editor-wrap"><textarea ref={editor} aria-label="Текст user story" spellCheck={false} value={story} maxLength={50000} readOnly={busy} placeholder={'# Название user story\n\nAs a [role], I want [capability],\nso that [business outcome].\n\n## Business rules\n...\n\n## Acceptance criteria\n...'} onChange={e => { setStory(e.target.value); setAnswers({}); setDecisions([]); }}/></div>
            <div className="editor-status"><span><span className="status-dot"/> {story.trim() ? `${story.trim().split(/\s+/).length.toLocaleString('ru-RU')} слов` : 'Вставьте текст или загрузите файл'}</span><span>{story.length.toLocaleString('ru-RU')} / 50 000</span></div>
            <div className="context-block"><button className="context-toggle" onClick={() => setShowContext(!showContext)} aria-expanded={showContext}><span><Layers3 size={16}/>Бизнес-контекст <small>необязательно</small></span><ChevronDown size={16} className={showContext ? 'rotated' : ''}/></button>{showContext && <textarea aria-label="Бизнес-контекст" value={context} readOnly={busy} maxLength={10000} onChange={e => { setContext(e.target.value); setAnswers({}); setDecisions([]); }} placeholder="Связанные бизнес-правила, словарь терминов, границы фичи…"/>}</div>
            <div className="run-controls"><label>Язык ревью<select value={language} disabled={busy} onChange={e => { setLanguage(e.target.value); setAnswers({}); }}><option value="ru">Русский</option><option value="en">English</option></select></label><button className="button primary" onClick={() => void analyze()} disabled={busy || !story.trim()}>{busy ? <LoaderCircle size={17} className="spin"/> : <Sparkles size={17}/>} {busy ? 'Анализируем…' : answered && !stale ? `Учесть ответы (${answered})` : 'Проверить стори'}{!busy && <ArrowRight size={16}/>}</button></div>
            <p className="data-note"><ShieldCheck size={12}/> При проверке текст и контекст передаются Anthropic.</p>
          </section>
          <section className="results-panel" aria-label="Результаты проверки" aria-busy={busy}>
            <div className="panel-heading"><div><span className="section-number">02</span><h2>Результат проверки</h2></div>{review && <button className="icon-button" title="Экспорт ревью Markdown" aria-label="Экспорт ревью Markdown" onClick={() => download(reportMarkdown(review), 'storylens-review.md')}><ArrowDownToLine size={17}/></button>}</div>
            <div className="tabs" role="tablist" aria-label="Результаты"><button id="tab-review" role="tab" aria-selected={tab === 'review'} aria-controls="result-content" onClick={() => setTab('review')} className={tab === 'review' ? 'selected' : ''}>Ревью {review && <span>{review.findings.length}</span>}</button><button id="tab-rewrite" role="tab" aria-selected={tab === 'rewrite'} aria-controls="result-content" onClick={() => setTab('rewrite')} className={tab === 'rewrite' ? 'selected' : ''}>Улучшенная версия</button><button id="tab-changes" role="tab" aria-selected={tab === 'changes'} aria-controls="result-content" onClick={() => setTab('changes')} className={tab === 'changes' ? 'selected' : ''}>Изменения</button></div>
            <div className="results-content" id="result-content" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {error && <div className="error-message" role="alert"><CircleHelp size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Закрыть сообщение"><X size={15}/></button></div>}
              {stale && <div className="info-banner warning">Исходные данные изменились. Результат относится к предыдущей версии — запустите проверку ещё раз.</div>}
              {busy && <div className="info-banner running" role="status"><LoaderCircle size={16} className="spin"/><span>Проверяем бизнес-правила и готовим версию стори. Это может занять до двух минут.</span><button onClick={() => controller.current?.abort()}>Остановить ожидание</button></div>}
              {!review ? <div className="empty-result"><div className="empty-illustration"><div className="illustration-ring"/><div className="mini-document"><div className="mini-line short"/><div className="mini-line"/><div className="mini-line"/><div className="mini-line medium"/><div className="mini-check"><Check size={18}/></div></div><span className="spark-one">✦</span><span className="spark-two">✧</span></div><div className="eyebrow">ВЗГЛЯД СО СТОРОНЫ</div><h3>Хорошая стори начинается<br/>с правильных вопросов</h3><p>Добавьте требования и запустите проверку.<br/>Каждое замечание связано с исходным текстом.</p><div className="empty-checks"><div><span><Focus size={16}/></span><strong>Неоднозначности</strong><small>Что можно понять по-разному</small></div><div><span><CheckCheck size={16}/></span><strong>Пробелы в критериях</strong><small>Каких бизнес-правил не хватает</small></div><div><span><Layers3 size={16}/></span><strong>Противоречия</strong><small>Какие утверждения конфликтуют</small></div></div><button className="button secondary demo-button" onClick={demo} disabled={busy}><FlaskConical size={16}/>Посмотреть демо-разбор<ArrowRight size={15}/></button><small className="demo-hint">Подготовленный пример · без запроса к AI</small></div> : <>
                {review.meta.demo && <div className="info-banner demo-banner"><FlaskConical size={16}/><span><strong>Демонстрационный разбор.</strong> Подготовленный пример, без обращения к AI.</span></div>}
                {tab === 'review' && <>
                  <div className="review-summary"><div className="summary-label"><span className="status-dot"/> ОБЗОР СТОРИ</div><p>{review.summary}</p><details className="strengths"><summary><CheckCheck size={15}/>Что уже описано хорошо <ChevronDown size={14}/></summary><ul>{review.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></details></div>
                  <div className="finding-toolbar"><h3>Замечания <span>{review.findings.length}</span></h3><label className="sr-only" htmlFor="finding-filter">Тип замечаний</label><select id="finding-filter" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Все типы</option><option value="ambiguity">Неоднозначности</option><option value="missing_criteria">Пробелы в правилах</option><option value="conflict">Противоречия</option></select></div>
                  {!findings.length && <div className="no-findings"><CheckCheck size={23}/><p>{review.findings.length ? 'В этой категории замечаний нет.' : 'По выбранной политике проблем не найдено. Это не заменяет согласование требований с командой.'}</p></div>}
                  {findings.map(f => <article className="finding-card" key={f.id}><div className="finding-meta"><span className={`type-tag ${f.type}`}>{labels[f.type]}</span><span className={`priority ${f.priority}`}><span/>{priorities[f.priority]}</span><span className="finding-id">{f.id}</span></div><h4>{f.title}</h4>{f.certainty === 'needs_context' && <span className="context-tag"><CircleHelp size={12}/>Нужен контекст</span>}<div className="quotes">{f.evidence.map((quote, i) => <button key={i} onClick={() => selectQuote(quote)} title="Найти в исходной стори"><span>“</span>{quote}<ArrowLeft size={13}/></button>)}</div><p>{f.explanation}</p><details className="suggestion"><summary>Предложение <ChevronDown size={13}/></summary><p>{f.suggestion}</p></details><div className="ba-question"><label htmlFor={`answer-${f.id}`}><span>ВОПРОС BA</span>{f.question}</label><textarea id={`answer-${f.id}`} rows={2} maxLength={3000} disabled={busy || stale} value={answers[f.id] || ''} onChange={e => setAnswers({ ...answers, [f.id]: e.target.value })} placeholder="Ваш ответ или ссылка на бизнес-правило…"/></div></article>)}
                  {answered > 0 && !stale && <button className="answer-action" onClick={() => void analyze()} disabled={busy}>Учесть ответы в новом AI-разборе <ArrowRight size={14}/></button>}
                </>}
                {tab === 'rewrite' && <div className="rewrite-view"><div className="rewrite-heading"><span><FileText size={16}/>Черновик для согласования</span><div><button className="icon-button" aria-label="Копировать улучшенную версию" onClick={() => void copy(review.rewrite)}><Clipboard size={16}/></button><button className="icon-button" aria-label="Скачать улучшенную версию" onClick={() => download(review.rewrite, 'user-story-refined.md')}><ArrowDownToLine size={16}/></button></div></div><p className="rewrite-note">Нерешённые вопросы отмечены <code>BA DECISION REQUIRED</code>. Язык исходной стори сохранён.</p><pre className="rewrite-text">{review.rewrite.split(/(\[BA DECISION REQUIRED:[^\]]*\])/g).map((part, i) => part.startsWith('[BA DECISION REQUIRED:') ? <mark key={i}>{part}</mark> : part)}</pre></div>}
                {tab === 'changes' && <div className="changes-view"><h3>Что изменено и почему</h3><p>Проверьте изменения перед передачей стори в работу.</p>{review.changes.map((c, i) => <div className="change-item" key={i}><span className={`change-icon ${c.kind}`}>{c.kind === 'decision_required' ? <CircleHelp size={17}/> : <Check size={17}/>}</span><div><small>{changeLabels[c.kind]}</small><p>{c.description}</p></div></div>)}<h3 className="questions-title">Открытые вопросы <span>{review.openQuestions.length}</span></h3>{review.openQuestions.length ? review.openQuestions.map((q, i) => <div className="open-question" key={i}><span>{q.findingId}</span><p>{q.question}</p></div>) : <p>Открытых вопросов в результате нет.</p>}</div>}
              </>}
            </div>
            <div className="results-footer"><span><ShieldCheck size={13}/> {review ? review.meta.demo ? 'Демо · business-first-v1' : `${review.meta.model} · business-first-v1` : 'Проверяем смысл, сохраняем контекст'}</span><button onClick={() => setPolicy(true)}><CircleHelp size={14}/>О проверке</button></div>
          </section>
        </div>
        <footer className="page-footer"><span>STORYLENS <span> / </span> Требования, которые понимают одинаково.</span><span>Решения остаются за BA.</span></footer>
      </main>
    </div>
    <dialog ref={settingsRef} className="modal" onCancel={() => setSettings(false)} onClick={e => { if (e.target === settingsRef.current) setSettings(false); }}><div className="modal-heading"><span className="modal-icon"><Sparkles size={22}/></span><button className="icon-button" aria-label="Закрыть настройки" onClick={() => setSettings(false)}><X size={20}/></button></div><h2>Подключение Claude</h2><p>Ключ используется сервером для запроса к Anthropic. В приложении он хранится только в памяти вкладки и сбрасывается после перезагрузки.</p><label className="field-label" htmlFor="api-key">Claude API-ключ</label><input id="api-key" type="password" value={key} autoComplete="off" spellCheck={false} placeholder="sk-ant-…" onChange={e => setKey(e.target.value)} maxLength={512}/><label className="field-label" htmlFor="model-id">Модель</label><input id="model-id" value={model} onChange={e => setModel(e.target.value)} placeholder="claude-sonnet-4-6" maxLength={110}/><small>Нужна модель с поддержкой Structured Outputs. Стори, контекст и ответы BA передаются Anthropic только при запуске проверки. Приложение не сохраняет документы и ключ на сервере.</small><div className="modal-actions"><button className="text-button" onClick={() => { setKey(''); setSettings(false); setNotice('Ключ удалён из памяти вкладки'); }}>Удалить ключ</button><button className="button primary" onClick={() => setSettings(false)}>Готово<Check size={16}/></button></div></dialog>
    <dialog ref={policyRef} className="modal policy-modal" onCancel={() => setPolicy(false)} onClick={e => { if (e.target === policyRef.current) setPolicy(false); }}><div className="modal-heading"><span className="modal-icon"><ShieldCheck size={23}/></span><button className="icon-button" aria-label="Закрыть правила" onClick={() => setPolicy(false)}><X size={20}/></button></div><div className="eyebrow">BUSINESS-FIRST · V1</div><h2>Проверяем бизнес-логику</h2><p>Хорошая user story объясняет цель, правила и результат фичи. Описание нативных элементов интерфейса обычно не требуется.</p>{[
      ['Что проверяем', 'Права ролей, ограничения, расчёты, бизнес-значения, связи статусов, условия и проверяемый результат.'],
      ['Когда важен UI', 'Если поведение отличается от стандартного или нужно определить конкретную информацию: бизнес-лимит, состав полей, отображение статуса.'],
      ['Что подразумевается', 'Стандартные клики, раскрытие групп, прокрутка, фокус и типовые состояния интерфейса не считаются пробелами стори.'],
      ['Как работаем с неизвестным', 'Для противоречия нужны две цитаты. Возможный внешний контекст помечается отдельно. Бизнес-решения не придумываются.'],
    ].map(([title, text]) => <div className="policy-row" key={title}><Check size={18}/><div><strong>{title}</strong><p>{text}</p></div></div>)}<button className="button primary full-width" onClick={() => setPolicy(false)}>Понятно<ArrowRight size={16}/></button></dialog>
    {notice && <div className="toast" role="status"><Check size={16}/>{notice}</div>}
  </div>;
}
