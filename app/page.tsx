'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Clipboard, FileText, FlaskConical, Focus, Layers3, LoaderCircle, Plus, ScanLine, ShieldCheck, Sparkles, X } from 'lucide-react';
import { EXAMPLE_STORY } from '../lib/example';
import { DEMO_REVIEW } from '../lib/demo';
import type { FindingType, Review } from '../lib/types';

const labels: Record<FindingType, string> = { ambiguity: 'Ambiguity', missing_criteria: 'Business rule gap', conflict: 'Conflict' };
const priorities = { high: 'High', medium: 'Medium', low: 'Low' };
const changeLabels = { editorial: 'Editorial change', decision_required: 'BA decision required', ba_decision: 'BA decision' };
type Tab = 'review' | 'rewrite' | 'changes';

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.hidden = true;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function reportMarkdown(r: Review) {
  return `# Storylens — ${r.meta.demo ? 'demo' : 'AI'} review\n\n${r.summary}\n\n## Strengths\n\n${r.strengths.map(s => `- ${s}`).join('\n')}\n\n${r.findings.map(f => `## ${f.id}. ${f.title}\n\n${labels[f.type]} · ${priorities[f.priority]} priority · ${f.certainty === 'confirmed' ? 'Confirmed in the text' : 'Needs context'}\n\n${f.evidence.map(q => `> ${q.replaceAll('\n', '\n> ')}`).join('\n\n')}\n\n${f.explanation}\n\n**Question:** ${f.question}\n\n**Suggestion:** ${f.suggestion}`).join('\n\n')}\n\n## Changes\n\n${r.changes.map(c => `- ${changeLabels[c.kind]}: ${c.description}`).join('\n')}\n\n## Open questions\n\n${r.openQuestions.map(q => `- ${q.findingId}: ${q.question}`).join('\n')}\n\n---\n${r.meta.provider} · ${r.meta.model} · ${r.meta.policyVersion}`;
}

export default function Home() {
  const [story, setStory] = useState(EXAMPLE_STORY);
  const [context, setContext] = useState('');
  const [language, setLanguage] = useState('en');
  const [review, setReview] = useState<Review | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const [tab, setTab] = useState<Tab>('review');
  const [filter, setFilter] = useState<'all' | FindingType>('all');
  const [settings, setSettings] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
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
  useEffect(() => {
    const statusController = new AbortController();
    void refreshStatus(statusController.signal);
    return () => statusController.abort();
  }, []);

  async function refreshStatus(signal?: AbortSignal) {
    try {
      const response = await fetch('/api/status', { signal });
      if (!response.ok) throw new Error('Status unavailable');
      const payload = await response.json() as { configured?: boolean };
      if (!signal?.aborted) setProviderReady(typeof payload.configured === 'boolean' ? payload.configured : null);
    } catch { if (!signal?.aborted) setProviderReady(null); }
  }

  function reset() { if (busy) return; setStory(''); setReview(null); setContext(''); setAnswers({}); setDecisions([]); setError(''); setSnapshot(''); editor.current?.focus(); }
  function demo() {
    if (busy) return;
    setStory(EXAMPLE_STORY); setContext(''); setLanguage('en'); setReview(DEMO_REVIEW); setSnapshot(JSON.stringify([EXAMPLE_STORY, '', 'en'])); setAnswers({}); setDecisions([]); setTab('review'); setFilter('all'); setError('');
  }
  function selectQuote(quote: string) {
    const index = story.indexOf(quote); if (index < 0) return;
    editor.current?.focus(); editor.current?.setSelectionRange(index, index + quote.length);
    if (editor.current) editor.current.scrollTop = Math.max(0, (story.slice(0, index).split('\n').length - 1) * 23 - editor.current.clientHeight / 3);
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setNotice('Copied'); } catch { setNotice('Could not copy. Use Markdown export instead.'); } }
  async function upload(file?: File) {
    if (!file || busy) return;
    if (!/\.(md|txt)$/i.test(file.name)) { setError('Supported file types: .md and .txt.'); return; }
    if (file.size > 200000) { setError('File too large. Maximum: 200 KB and 50,000 characters.'); return; }
    try { const text = await file.text(); if (text.length > 50000) throw new Error('Story too long. Maximum: 50,000 characters.'); setStory(text); setAnswers({}); setDecisions([]); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read the file.'); }
  }
  async function analyze() {
    if (busy) return;
    if (story.trim().length < 30) { setError('Enter a user story with at least 30 characters.'); editor.current?.focus(); return; }
    setBusy(true); setError('');
    const currentSnapshot = JSON.stringify([story, context, language]);
    const requestController = new AbortController(); controller.current = requestController;
    const timeout = setTimeout(() => requestController.abort(), 130000);
    const submittedAnswers = !stale && review ? review.findings.filter(f => answers[f.id]?.trim()).map(f => ({ findingId: f.id, question: f.question, answer: answers[f.id].trim() })) : [];
    const combinedAnswers = [...decisions, ...submittedAnswers];
    try {
      const response = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: requestController.signal, body: JSON.stringify({ story, context, language, answers: combinedAnswers }) });
      const payload = await response.json() as Review & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Could not complete the review.');
      setReview(payload); setSnapshot(currentSnapshot); setAnswers({}); setDecisions(combinedAnswers); setTab('review'); setFilter('all');
    } catch (e) { setError(e instanceof Error && e.name === 'AbortError' ? 'Stopped waiting. The server may still complete the request. It will not be retried automatically.' : e instanceof Error ? e.message : 'Could not reach the server.'); }
    finally { clearTimeout(timeout); setBusy(false); controller.current = null; }
  }

  const findings = review?.findings.filter(f => filter === 'all' || f.type === filter) ?? [];
  return <div className="app-shell">
    <aside className="rail">
      <a className="brand" href="/" aria-label="Storylens — home"><span className="brand-mark"><ScanLine size={23} strokeWidth={1.6}/></span><span>storylens<span className="brand-dot">.</span></span></a>
      <div className="rail-label">WORKSPACE</div>
      <div className="rail-nav active"><Focus size={18}/><span>Story review</span><span className="nav-count">01</span></div>
      <button className="rail-nav" onClick={() => setPolicy(true)}><ShieldCheck size={18}/><span>Review policy</span></button>
      <div className="rail-divider"/>
      <div className="rail-label">START WITH AN EXAMPLE</div>
      <button className="sample-link" onClick={demo} disabled={busy}><FileText size={17}/><span>Submitted Order Details<small>WKSP-ORDS-3 · User story</small></span><ChevronRight size={15}/></button>
      <div className="rail-bottom"><div className="rail-note"><span>✦</span><p>Less guesswork.<br/><strong>More clarity.</strong></p><small>Business logic at the heart<br/>of every review.</small></div><button className="rail-nav" onClick={() => setSettings(true)}><Sparkles size={18}/><span>Free AI model</span><span className={`connection-dot ${providerReady ? 'connected' : ''}`}/></button><div className="profile"><span>BA</span><div>Business Analyst<small>Personal workspace</small></div></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><span className="muted">Workspace</span><ChevronRight size={13}/><span>Story review</span></div><button className="connection-button" onClick={() => setSettings(true)}><span className={`connection-dot ${providerReady ? 'connected' : ''}`}/><span>{providerReady === false ? 'AI setup in progress' : 'OpenRouter Free'}</span><CircleHelp size={14}/></button></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span/> FOR BUSINESS ANALYSTS</div><h1>Turn stories into clear requirements<span>.</span></h1><p>Find ambiguities, gaps, and conflicts in your business logic.</p></div><button className="button secondary new-story" onClick={reset} disabled={busy}><Plus size={16}/>New story</button></div>
        <div className="workspace">
          <section className="editor-panel" aria-label="Source story">
            <div className="panel-heading"><div><span className="section-number">01</span><h2>Source story</h2></div><button className="text-button" onClick={() => fileInput.current?.click()} disabled={busy}><Plus size={15}/>Upload file</button><input ref={fileInput} type="file" accept=".md,.txt,text/plain,text/markdown" hidden onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }}/></div>
            <div className="document-toolbar"><div><FileText size={15}/><span>{story === EXAMPLE_STORY ? 'WKSP-ORDS-3.md' : 'user-story.md'}</span>{story === EXAMPLE_STORY && <span className="example-tag">EXAMPLE</span>}</div><span>Markdown</span></div>
            <div className="editor-wrap"><textarea ref={editor} aria-label="User story text" spellCheck={false} value={story} maxLength={50000} readOnly={busy} placeholder={'# User story title\n\nAs a [role], I want [capability],\nso that [business outcome].\n\n## Business rules\n...\n\n## Acceptance criteria\n...'} onChange={e => { setStory(e.target.value); setAnswers({}); setDecisions([]); }}/></div>
            <div className="editor-status"><span><span className="status-dot"/> {story.trim() ? `${story.trim().split(/\s+/).length.toLocaleString('en-US')} words` : 'Paste text or upload a file'}</span><span>{story.length.toLocaleString('en-US')} / 50,000</span></div>
            <div className="context-block"><button className="context-toggle" onClick={() => setShowContext(!showContext)} aria-expanded={showContext}><span><Layers3 size={16}/>Business context <small>optional</small></span><ChevronDown size={16} className={showContext ? 'rotated' : ''}/></button>{showContext && <textarea aria-label="Business context" value={context} readOnly={busy} maxLength={10000} onChange={e => { setContext(e.target.value); setAnswers({}); setDecisions([]); }} placeholder="Related business rules, glossary, feature scope…"/>}</div>
            <div className="run-controls"><label>Review language<select value={language} disabled={busy} onChange={e => { setLanguage(e.target.value); setAnswers({}); }}><option value="ru">Russian</option><option value="en">English</option></select></label><button className="button primary" onClick={() => void analyze()} disabled={busy || !story.trim() || providerReady === false}>{busy ? <LoaderCircle size={17} className="spin"/> : <Sparkles size={17}/>} {busy ? 'Reviewing…' : answered && !stale ? `Apply answers (${answered})` : 'Review story'}{!busy && <ArrowRight size={16}/>}</button></div>
            <p className="data-note"><ShieldCheck size={12}/> Your text is sent to OpenRouter and the selected model provider.</p>
          </section>
          <section className="results-panel" aria-label="Review results" aria-busy={busy}>
            <div className="panel-heading"><div><span className="section-number">02</span><h2>Review results</h2></div>{review && <button className="icon-button" title="Export review as Markdown" aria-label="Export review as Markdown" onClick={() => download(reportMarkdown(review), 'storylens-review.md')}><ArrowDownToLine size={17}/></button>}</div>
            <div className="tabs" role="tablist" aria-label="Results"><button id="tab-review" role="tab" aria-selected={tab === 'review'} aria-controls="result-content" onClick={() => setTab('review')} className={tab === 'review' ? 'selected' : ''}>Review {review && <span>{review.findings.length}</span>}</button><button id="tab-rewrite" role="tab" aria-selected={tab === 'rewrite'} aria-controls="result-content" onClick={() => setTab('rewrite')} className={tab === 'rewrite' ? 'selected' : ''}>Refined story</button><button id="tab-changes" role="tab" aria-selected={tab === 'changes'} aria-controls="result-content" onClick={() => setTab('changes')} className={tab === 'changes' ? 'selected' : ''}>Changes</button></div>
            <div className="results-content" id="result-content" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {error && <div className="error-message" role="alert"><CircleHelp size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss message"><X size={15}/></button></div>}
              {stale && <div className="info-banner warning">The source has changed. These results belong to the previous version. Run a new review.</div>}
              {busy && <div className="info-banner running" role="status"><LoaderCircle size={16} className="spin"/><span>Checking business rules and preparing a refined story. This may take up to two minutes.</span><button onClick={() => controller.current?.abort()}>Stop waiting</button></div>}
              {!review ? <div className="empty-result"><div className="empty-illustration"><div className="illustration-ring"/><div className="mini-document"><div className="mini-line short"/><div className="mini-line"/><div className="mini-line"/><div className="mini-line medium"/><div className="mini-check"><Check size={18}/></div></div><span className="spark-one">✦</span><span className="spark-two">✧</span></div><div className="eyebrow">A FRESH PERSPECTIVE</div><h3>Good stories start<br/>with the right questions</h3><p>Add your requirements and run a review.<br/>Every finding links back to your source text.</p><div className="empty-checks"><div><span><Focus size={16}/></span><strong>Ambiguities</strong><small>What could be interpreted differently</small></div><div><span><CheckCheck size={16}/></span><strong>Missing acceptance criteria</strong><small>Which business rules need clarification</small></div><div><span><Layers3 size={16}/></span><strong>Conflicts</strong><small>Which statements are incompatible</small></div></div><button className="button secondary demo-button" onClick={demo} disabled={busy}><FlaskConical size={16}/>Explore the demo review<ArrowRight size={15}/></button><small className="demo-hint">Prepared example · no AI request</small></div> : <>
                {review.meta.demo && <div className="info-banner demo-banner"><FlaskConical size={16}/><span><strong>Demo review.</strong> A prepared example, without an AI request.</span></div>}
                {tab === 'review' && <>
                  <div className="review-summary"><div className="summary-label"><span className="status-dot"/> STORY OVERVIEW</div><p>{review.summary}</p><details className="strengths"><summary><CheckCheck size={15}/>What is already clear <ChevronDown size={14}/></summary><ul>{review.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></details></div>
                  <div className="finding-toolbar"><h3>Findings <span>{review.findings.length}</span></h3><label className="sr-only" htmlFor="finding-filter">Finding type</label><select id="finding-filter" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">All types</option><option value="ambiguity">Ambiguities</option><option value="missing_criteria">Business rule gaps</option><option value="conflict">Conflicts</option></select></div>
                  {!findings.length && <div className="no-findings"><CheckCheck size={23}/><p>{review.findings.length ? 'No findings in this category.' : 'No issues found under this review policy. Your team still needs to approve the requirements.'}</p></div>}
                  {findings.map(f => <article className="finding-card" key={f.id}><div className="finding-meta"><span className={`type-tag ${f.type}`}>{labels[f.type]}</span><span className={`priority ${f.priority}`}><span/>{priorities[f.priority]}</span><span className="finding-id">{f.id}</span></div><h4>{f.title}</h4>{f.certainty === 'needs_context' && <span className="context-tag"><CircleHelp size={12}/>Needs context</span>}<div className="quotes">{f.evidence.map((quote, i) => <button key={i} onClick={() => selectQuote(quote)} title="Find in the source story"><span>“</span>{quote}<ArrowLeft size={13}/></button>)}</div><p>{f.explanation}</p><details className="suggestion"><summary>Suggestion <ChevronDown size={13}/></summary><p>{f.suggestion}</p></details><div className="ba-question"><label htmlFor={`answer-${f.id}`}><span>QUESTION FOR BA</span>{f.question}</label><textarea id={`answer-${f.id}`} rows={2} maxLength={3000} disabled={busy || stale} value={answers[f.id] || ''} onChange={e => setAnswers({ ...answers, [f.id]: e.target.value })} placeholder="Your answer or a reference to a business rule…"/></div></article>)}
                  {answered > 0 && !stale && <button className="answer-action" onClick={() => void analyze()} disabled={busy}>Apply answers in a new AI review <ArrowRight size={14}/></button>}
                </>}
                {tab === 'rewrite' && <div className="rewrite-view"><div className="rewrite-heading"><span><FileText size={16}/>Draft for approval</span><div><button className="icon-button" aria-label="Copy refined story" onClick={() => void copy(review.rewrite)}><Clipboard size={16}/></button><button className="icon-button" aria-label="Download refined story" onClick={() => download(review.rewrite, 'user-story-refined.md')}><ArrowDownToLine size={16}/></button></div></div><p className="rewrite-note">Unresolved questions are marked <code>BA DECISION REQUIRED</code>. The original story language is preserved.</p><pre className="rewrite-text">{review.rewrite.split(/(\[BA DECISION REQUIRED:[^\]]*\])/g).map((part, i) => part.startsWith('[BA DECISION REQUIRED:') ? <mark key={i}>{part}</mark> : part)}</pre></div>}
                {tab === 'changes' && <div className="changes-view"><h3>What changed and why</h3><p>Review the changes before handing the story over to the team.</p>{review.changes.map((c, i) => <div className="change-item" key={i}><span className={`change-icon ${c.kind}`}>{c.kind === 'decision_required' ? <CircleHelp size={17}/> : <Check size={17}/>}</span><div><small>{changeLabels[c.kind]}</small><p>{c.description}</p></div></div>)}<h3 className="questions-title">Open questions <span>{review.openQuestions.length}</span></h3>{review.openQuestions.length ? review.openQuestions.map((q, i) => <div className="open-question" key={i}><span>{q.findingId}</span><p>{q.question}</p></div>) : <p>There are no open questions in this review.</p>}</div>}
              </>}
            </div>
            <div className="results-footer"><span><ShieldCheck size={13}/> {review ? review.meta.demo ? 'Demo · business-first-v1' : `${review.meta.model} · business-first-v1` : 'Reviewing meaning, preserving context'}</span><button onClick={() => setPolicy(true)}><CircleHelp size={14}/>About this review</button></div>
          </section>
        </div>
        <footer className="page-footer"><span>STORYLENS <span> / </span> Requirements everyone understands.</span><span>Business decisions stay with the BA.</span></footer>
      </main>
    </div>
    <dialog ref={settingsRef} className="modal" onCancel={() => setSettings(false)} onClick={e => { if (e.target === settingsRef.current) setSettings(false); }}><div className="modal-heading"><span className="modal-icon"><Sparkles size={22}/></span><button className="icon-button" aria-label="Close model information" onClick={() => setSettings(false)}><X size={20}/></button></div><h2>Free AI review</h2><p>OpenRouter Free selects an available free model to review your story. No personal API key is needed. The result shows which model was used.</p><small>OpenRouter limits model availability and free requests. If a limit is reached, you can try again later. The app never switches to paid models automatically.</small>{providerReady === false && <p role="status">AI setup is still in progress. You can explore the prepared demo review now.</p>}<div className="modal-actions"><button className="text-button" onClick={() => void refreshStatus()}>Refresh status</button><button className="button primary" onClick={() => setSettings(false)}>Got it<Check size={16}/></button></div></dialog>
    <dialog ref={policyRef} className="modal policy-modal" onCancel={() => setPolicy(false)} onClick={e => { if (e.target === policyRef.current) setPolicy(false); }}><div className="modal-heading"><span className="modal-icon"><ShieldCheck size={23}/></span><button className="icon-button" aria-label="Close review policy" onClick={() => setPolicy(false)}><X size={20}/></button></div><div className="eyebrow">BUSINESS-FIRST · V1</div><h2>Reviewing business logic</h2><p>A good user story explains the purpose, rules, and outcome of a feature. Standard UI behavior usually does not need to be specified.</p>{[
      ['What we check', 'Role permissions, constraints, calculations, business values, status relationships, conditions, and testable outcomes.'],
      ['When UI details matter', 'When behavior differs from the standard, or an element needs specific information such as a business limit, required fields, or a status mapping.'],
      ['What is implied', 'Standard clicks, expand/collapse behavior, scrolling, focus, and common UI states are not treated as missing requirements.'],
      ['How we handle unknowns', 'A conflict requires two source quotes. Missing external context is flagged separately. Business decisions are never invented.'],
    ].map(([title, text]) => <div className="policy-row" key={title}><Check size={18}/><div><strong>{title}</strong><p>{text}</p></div></div>)}<button className="button primary full-width" onClick={() => setPolicy(false)}>Got it<ArrowRight size={16}/></button></dialog>
    {notice && <div className="toast" role="status"><Check size={16}/>{notice}</div>}
  </div>;
}
