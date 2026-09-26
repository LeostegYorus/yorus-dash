"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Block, BlockDocument, BlockTab } from "../../lib/block-types";
import type { DashboardResult } from "./dashboard";

type Draft = {
  kind: Block["kind"];
  title: string;
  source: "meta" | "manual";
  amount: string;
  periodStart: string;
  periodEnd: string;
  sourceLabel: string;
  note: string;
  question: string;
  options: Array<{ label: string; count: string }>;
  hasCounts: boolean;
  body: string;
  evidenceType: "fact" | "hypothesis" | "decision";
};
const blank = (): Draft => ({ kind: "note", title: "", source: "manual", amount: "", periodStart: "", periodEnd: "", sourceLabel: "", note: "", question: "", options: [{ label: "", count: "" }, { label: "", count: "" }], hasCounts: false, body: "", evidenceType: "hypothesis" });
function draftOf(block: Block): Draft {
  const base = blank();
  if (block.kind === "investment") return { ...base, kind: block.kind, title: block.title, source: block.source, amount: block.source === "manual" ? (block.amountCents / 100).toFixed(2).replace(".", ",") : "", periodStart: block.source === "manual" ? block.periodStart : "", periodEnd: block.source === "manual" ? block.periodEnd : "", sourceLabel: block.source === "manual" ? block.sourceLabel : "", note: block.source === "manual" ? block.note ?? "" : "" };
  if (block.kind === "question") return { ...base, kind: block.kind, title: block.title, question: block.question, options: block.options.map(option => ({ label: option.label, count: option.count === null ? "" : String(option.count) })), hasCounts: block.options.some(option => option.count !== null), sourceLabel: block.sourceLabel ?? "", periodStart: block.periodStart ?? "", periodEnd: block.periodEnd ?? "" };
  return { ...base, kind: block.kind, title: block.title, body: block.body, evidenceType: block.evidenceType, sourceLabel: block.sourceLabel ?? "" };
}
const blockError = (status: number) => status === 401 ? "Sua sessão expirou. Entre novamente." : status === 403 ? "Você não tem permissão para alterar os blocos deste cliente." : status === 503 ? "Os blocos estão indisponíveis. Tente novamente mais tarde." : "Não foi possível carregar os blocos. Tente novamente.";
function makeBlock(draft: Draft, tab: BlockTab, original?: Block): Block {
  const base = { id: original?.id ?? crypto.randomUUID(), tab, title: draft.title.trim(), updatedAt: original?.updatedAt ?? new Date().toISOString() };
  if (draft.kind === "investment") return draft.source === "meta" ? { ...base, kind: "investment", source: "meta" } : { ...base, kind: "investment", source: "manual", amountCents: Math.round(Number(draft.amount) * 100), periodStart: draft.periodStart, periodEnd: draft.periodEnd, sourceLabel: draft.sourceLabel.trim(), ...(draft.note.trim() ? { note: draft.note.trim() } : {}) };
  if (draft.kind === "question") return { ...base, kind: "question", question: draft.question.trim(), options: draft.options.map(option => ({ label: option.label.trim(), count: draft.hasCounts ? Number(option.count) : null })), ...(draft.sourceLabel.trim() ? { sourceLabel: draft.sourceLabel.trim() } : {}), ...(draft.periodStart ? { periodStart: draft.periodStart } : {}), ...(draft.periodEnd ? { periodEnd: draft.periodEnd } : {}) };
  return { ...base, kind: "note", body: draft.body.trim(), evidenceType: draft.evidenceType, ...(draft.sourceLabel.trim() ? { sourceLabel: draft.sourceLabel.trim() } : {}) };
}
function validation(d: Draft): string {
  if (!d.title.trim()) return "Informe o título do bloco.";
  if (d.kind === "note") return !d.body.trim() ? "Informe o conteúdo." : d.evidenceType === "fact" && !d.sourceLabel.trim() ? "Um fato precisa de fonte." : "";
  if (d.kind === "investment") {
    if (d.source === "meta") return "";
    if (!/^\d+(?:,\d{1,2})?$/.test(d.amount) || !Number.isSafeInteger(Math.round(Number(d.amount.replace(",", ".")) * 100))) return "Use reais sem separador de milhar e vírgula decimal (ex.: 1234,56).";
    if (!d.periodStart || !d.periodEnd || d.periodEnd < d.periodStart) return "Informe um período válido para o valor manual.";
    if (!d.sourceLabel.trim()) return "Informe a fonte do valor manual.";
    return "";
  }
  if (!d.question.trim()) return "Informe a pergunta.";
  if (d.options.length < 2 || d.options.length > 12 || d.options.some(o => !o.label.trim())) return "Informe de 2 a 12 alternativas com rótulos.";
  if (d.hasCounts && (d.options.some(o => !/^\d+$/.test(o.count) || !Number.isSafeInteger(Number(o.count))) || !d.sourceLabel.trim() || !d.periodStart || !d.periodEnd || d.periodEnd < d.periodStart)) return "Para registrar respostas, informe todas as contagens, fonte e período válido.";
  if (!d.hasCounts && ((d.periodStart && !d.periodEnd) || (!d.periodStart && d.periodEnd) || (d.periodStart && d.periodEnd && d.periodEnd < d.periodStart))) return "Informe as duas datas de um período válido.";
  return "";
}

function Editor({ block, tab, currency, busy, onCancel, onSave }: { block?: Block; tab: BlockTab; currency: string; busy: boolean; onCancel: () => void; onSave: (block: Block) => Promise<void> }) {
  const [draft, setDraft] = useState(() => block ? draftOf(block) : blank());
  const [section, setSection] = useState<BlockTab>(block?.tab ?? tab);
  const [error, setError] = useState("");
  const update = (fields: Partial<Draft>) => { setDraft(current => ({ ...current, ...fields })); setError(""); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validation(draft);
    if (problem) { setError(problem); return; }
    const normalized = draft.kind === "investment" ? { ...draft, amount: draft.amount.replace(",", ".") } : draft;
    void onSave(makeBlock(normalized, section, block));
  };
  return <form className="block-editor" onSubmit={submit} noValidate aria-label={block ? `Editar ${block.title}` : "Novo bloco"}>
    <div className="editor-heading"><h3>{block ? "Editar bloco" : "Novo bloco"}</h3><button type="button" className="quiet-button" onClick={onCancel}>Cancelar</button></div>
    <div className="editor-fields">
      <label>Tipo de bloco<select value={draft.kind} onChange={e => update({ ...blank(), kind: e.target.value as Draft["kind"], title: draft.title })} disabled={!!block}><option value="note">Nota e decisão</option><option value="question">Pergunta e distribuição</option><option value="investment">Investimento</option></select></label>
      <label>Seção do painel<select value={section} onChange={e => setSection(e.target.value as BlockTab)}><option value="overview">Visão geral</option><option value="profile">Perfil dos leads</option><option value="costs">Custos e decisão</option></select></label>
      <label>Título do bloco<input value={draft.title} maxLength={120} onChange={e => update({ title: e.target.value })} required /></label>
      {draft.kind === "investment" && <>
        <label>Origem do investimento<select value={draft.source} onChange={e => update({ source: e.target.value as Draft["source"] })}><option value="manual">Valor informado</option><option value="meta">Meta Ads</option></select></label>
        {draft.source === "manual" ? <><label>Valor em {currency} (ex.: 1234,56; sem ponto de milhar)<input inputMode="decimal" value={draft.amount} onChange={e => update({ amount: e.target.value })} placeholder="0,00" required /></label><label>Início do período<input type="date" value={draft.periodStart} onChange={e => update({ periodStart: e.target.value })} required /></label><label>Fim do período<input type="date" value={draft.periodEnd} onChange={e => update({ periodEnd: e.target.value })} required /></label><label>Fonte do valor<input value={draft.sourceLabel} maxLength={120} onChange={e => update({ sourceLabel: e.target.value })} required /></label><label className="field-wide">Observação (opcional)<textarea value={draft.note} maxLength={2000} onChange={e => update({ note: e.target.value })} /></label></> : <p className="editor-hint field-wide">Usa o total de campanhas Meta do filtro de mídia. Nenhum valor é somado aos blocos manuais.</p>}
      </>}
      {draft.kind === "question" && <>
        <label className="field-wide">Pergunta<input value={draft.question} maxLength={240} onChange={e => update({ question: e.target.value })} required /></label>
        <fieldset className="field-wide options-field"><legend>Alternativas</legend>{draft.options.map((option, index) => <div className="option-row" key={index}><label>Alternativa {index + 1}<input value={option.label} maxLength={120} onChange={e => update({ options: draft.options.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} /></label>{draft.hasCounts && <label>Respostas da alternativa {index + 1}<input type="number" min="0" step="1" value={option.count} onChange={e => update({ options: draft.options.map((item, i) => i === index ? { ...item, count: e.target.value } : item) })} /></label>}{draft.options.length > 2 && <button type="button" className="quiet-button" aria-label={`Remover alternativa ${index + 1}`} onClick={() => update({ options: draft.options.filter((_, i) => i !== index) })}>Remover</button>}</div>)}{draft.options.length < 12 && <button type="button" className="quiet-button" onClick={() => update({ options: [...draft.options, { label: "", count: "" }] })}>Adicionar alternativa</button>}</fieldset>
        <label className="check-field field-wide"><input type="checkbox" checked={draft.hasCounts} onChange={e => update({ hasCounts: e.target.checked })} /> Registrar contagens agregadas manualmente</label>
        <label>Fonte {draft.hasCounts ? "das respostas" : "(opcional)"}<input value={draft.sourceLabel} maxLength={120} onChange={e => update({ sourceLabel: e.target.value })} /></label>
        <label>Início do período<input type="date" value={draft.periodStart} onChange={e => update({ periodStart: e.target.value })} /></label><label>Fim do período<input type="date" value={draft.periodEnd} onChange={e => update({ periodEnd: e.target.value })} /></label>
        <p className="editor-hint field-wide">Apenas contagens agregadas; não insira dados pessoais ou atribuição por campanha.</p>
      </>}
      {draft.kind === "note" && <><label>Tipo de informação<select value={draft.evidenceType} onChange={e => update({ evidenceType: e.target.value as Draft["evidenceType"] })}><option value="hypothesis">Hipótese</option><option value="fact">Fato</option><option value="decision">Decisão</option></select></label><label>Fonte {draft.evidenceType === "fact" ? "do fato" : "(opcional)"}<input value={draft.sourceLabel} maxLength={120} onChange={e => update({ sourceLabel: e.target.value })} /></label><label className="field-wide">Conteúdo<textarea value={draft.body} maxLength={4000} onChange={e => update({ body: e.target.value })} required /></label></>}
    </div>
    {error && <p role="alert" className="editor-error">{error}</p>}
    <button className="block-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar bloco"}</button>
  </form>;
}

function BlockCard({ block, meta, currency, onEdit, onRemove, onMove, first, last, busy }: { block: Block; meta: DashboardResult | null; currency: string; onEdit?: () => void; onRemove?: () => void; onMove?: (direction: -1 | 1) => void; first: boolean; last: boolean; busy: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const period = (start?: string, end?: string) => start && end ? `${start} a ${end}` : null;
  const money = (amount: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(amount);
  const total = block.kind === "question" && block.options.every(o => o.count !== null) ? block.options.reduce((sum, o) => sum + (o.count ?? 0), 0) : null;
  return <article className="block-card" aria-label={block.title}>
    <div className="block-card-top"><div><span className="block-category">{block.kind === "investment" ? "INVESTIMENTO" : block.kind === "question" ? "PERFIL / FORMULÁRIO" : block.evidenceType === "fact" ? "FATO" : block.evidenceType === "decision" ? "DECISÃO" : "HIPÓTESE"}</span><h3>{block.title}</h3></div>{onEdit && <div className="block-actions"><button type="button" onClick={onEdit} disabled={busy}>Editar</button><button type="button" onClick={() => onMove?.(-1)} disabled={busy || first} aria-label={`Mover ${block.title} para cima`}>↑</button><button type="button" onClick={() => onMove?.(1)} disabled={busy || last} aria-label={`Mover ${block.title} para baixo`}>↓</button><button type="button" onClick={() => setConfirm(true)} disabled={busy}>Excluir</button></div>}</div>
    {block.kind === "note" && <p className="block-body">{block.body}</p>}
    {block.kind === "investment" && (block.source === "manual" ? <><strong className="block-value">{money(block.amountCents / 100)}</strong>{block.note && <p className="block-body">{block.note}</p>}</> : meta ? <><strong className="block-value">{money(meta.rows.reduce((sum, row) => sum + row.spend, 0))}</strong>{meta.status === "partial" && <p className="block-warning">Consulta parcial — o total pode estar incompleto.</p>}</> : <p className="block-unavailable">Investimento Meta indisponível neste recorte.</p>)}
    {block.kind === "question" && <><p className="block-question">{block.question}</p>{total === null ? <p className="block-unavailable">Pergunta configurada · Sem respostas registradas</p> : total === 0 ? <p className="block-unavailable">0 respostas registradas</p> : <p className="block-total">{new Intl.NumberFormat("pt-BR").format(total)} respostas agregadas informadas</p>}<ul className="answer-list">{block.options.map((option, i) => <li key={i}><span>{option.label}</span><span>{option.count === null ? "não informado" : new Intl.NumberFormat("pt-BR").format(option.count)}{total !== null && total > 0 ? ` · ${new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format((option.count ?? 0) / total)}` : ""}</span>{total !== null && total > 0 && <span className="answer-track" aria-hidden="true"><span data-testid="distribution-bar" className="answer-fill" style={{ width: `${(option.count ?? 0) / total * 100}%` }} /></span>}</li>)}</ul></>}
    <div className="block-provenance">{block.kind === "investment" ? block.source === "manual" ? <><span>Informado manualmente · {block.sourceLabel}</span><span>Período: {period(block.periodStart, block.periodEnd)}</span></> : <><span>Fonte: Meta Ads · campanhas</span><span>Período: {meta ? period(meta.dateRange.start, meta.dateRange.end) : "filtro de mídia"}</span></> : block.kind === "question" ? <><span>{total === null ? "Sem contagens informadas" : "Informado manualmente · contagens agregadas"}{block.sourceLabel ? ` · Fonte: ${block.sourceLabel}` : ""}</span>{period(block.periodStart, block.periodEnd) && <span>Período: {period(block.periodStart, block.periodEnd)}</span>}</> : <span>{block.sourceLabel ? `Fonte: ${block.sourceLabel}` : "Fonte não informada"}</span>}</div>
    {confirm && <div className="block-confirm"><p>Excluir este bloco? Esta ação não pode ser desfeita.</p><button type="button" disabled={busy} onClick={onRemove}>Confirmar exclusão</button><button type="button" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</button></div>}
  </article>;
}

export default function BlockWorkspace({ clientId, tab, admin, currency, meta, metaStart, metaEnd }: { clientId: string; tab: BlockTab; admin: boolean; currency: string; meta: DashboardResult | null; metaStart?: string; metaEnd?: string }) {
  const [blockMeta, setBlockMeta] = useState<DashboardResult | null>(null);
  const [doc, setDoc] = useState<BlockDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/clients/${encodeURIComponent(clientId)}/blocks`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(blockError(response.status)); return response.json() as Promise<BlockDocument>; })
      .then(value => { if (!controller.signal.aborted) { setDoc(value); setLoading(false); setError(""); setConflict(false); } })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os blocos."); setLoading(false); } });
    return () => controller.abort();
  }, [clientId, revision]);
  const needsMeta = tab !== "overview" && !!doc?.blocks.some(block => block.tab === tab && block.kind === "investment" && block.source === "meta");
  useEffect(() => {
    if (!needsMeta || !metaStart || !metaEnd || metaEnd < metaStart) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ client: clientId, start: metaStart, end: metaEnd, level: "campaign" });
    fetch(`/api/dashboard?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Meta indisponível"); return response.json() as Promise<DashboardResult>; })
      .then(value => { if (!controller.signal.aborted && value.client?.id === clientId && value.scope?.level === "campaign" && value.dateRange?.start === metaStart && value.dateRange?.end === metaEnd) setBlockMeta(value); })
      .catch(() => { if (!controller.signal.aborted) setBlockMeta(null); });
    return () => controller.abort();
  }, [clientId, metaStart, metaEnd, needsMeta]);
  const validMeta = meta ?? (blockMeta?.dateRange.start === metaStart && blockMeta?.dateRange.end === metaEnd && blockMeta?.client.id === clientId ? blockMeta : null);
  const reload = () => { setEditing(null); setDoc(null); setLoading(true); setError(""); setRevision(n => n + 1); };
  const save = async (blocks: Block[]) => {
    if (!doc || busy || conflict) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/blocks`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: doc.version, blocks }) });
      if (response.status === 409) { setConflict(true); setError("Outra pessoa alterou estes blocos. Suas alterações não foram salvas. Recarregue para consultar a versão atual antes de editar novamente."); return; }
      if (!response.ok) throw new Error(blockError(response.status));
      const updated = await response.json() as BlockDocument;
      setDoc(updated); setEditing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o bloco."); }
    finally { setBusy(false); }
  };
  const visible = doc?.blocks.filter(block => block.tab === tab) ?? [];
  const editingBlock = editing !== "new" ? doc?.blocks.find(block => block.id === editing) : undefined;
  const move = (block: Block, direction: -1 | 1) => {
    if (!doc) return;
    const blocks = [...doc.blocks];
    const index = blocks.findIndex(item => item.id === block.id);
    const adjacent = visible[visible.findIndex(item => item.id === block.id) + direction];
    if (!adjacent) return;
    const target = blocks.findIndex(item => item.id === adjacent.id);
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    void save(blocks);
  };
  return <section className="blocks-section" aria-label="Blocos configuráveis">
    <div className="blocks-heading"><div><h2>{tab === "overview" ? "Blocos do cliente" : tab === "profile" ? "Perfil dos leads" : "Custos e decisão"}</h2><p>{tab === "profile" ? "Perguntas e distribuições agregadas, sem vínculo automático com campanhas." : tab === "costs" ? "Investimentos informados, hipóteses e decisões com sua própria origem." : "Contexto e dados configurados para este cliente, separados das métricas de mídia."}</p><p className="blocks-filter-note">Os filtros de mídia não alteram os dados informados manualmente.</p></div>{admin && !loading && !error && !editing && doc && doc.blocks.length < 50 && <button type="button" className="block-primary" onClick={() => setEditing("new")}>Adicionar bloco</button>}</div>
    {error && <div className="notice block-notice" role="alert">{error}</div>}
    {conflict ? <button type="button" className="quiet-button" onClick={reload}>Recarregar blocos</button> : error && !doc ? <button type="button" className="quiet-button" onClick={reload}>Tentar carregar blocos</button> : null}
    {loading ? <p role="status" className="blocks-status">Carregando blocos…</p> : doc && <>
      {visible.length === 0 && !editing && <div className="blocks-empty"><p>Nenhum bloco neste espaço.</p><span>{admin ? "Adicione uma informação deste cliente com sua fonte e contexto." : "As informações aparecerão quando forem configuradas pela equipe."}</span></div>}
      <div className="blocks-list">{visible.map((block, index) => <div key={block.id}>{editing === block.id && !conflict ? <Editor key={block.id} block={editingBlock} tab={tab} currency={currency} busy={busy} onCancel={() => setEditing(null)} onSave={updated => save(doc.blocks.map(item => item.id === block.id ? updated : item))} /> : <BlockCard block={block} meta={validMeta} currency={currency} busy={busy || conflict} first={index === 0} last={index === visible.length - 1} onEdit={admin ? () => setEditing(block.id) : undefined} onRemove={admin ? () => save(doc.blocks.filter(item => item.id !== block.id)) : undefined} onMove={admin ? direction => move(block, direction) : undefined} />}</div>)}</div>
      {editing === "new" && !conflict && <Editor tab={tab} currency={currency} busy={busy} onCancel={() => setEditing(null)} onSave={block => save([...doc.blocks, block])} />}
    </>}
  </section>;
}
