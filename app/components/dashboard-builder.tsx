"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { placeCanvasWidget, resolveCanvas, type CanvasRect } from "./builder-layout";
import type { BuilderDocument, BuilderWidget, ManualDataset } from "../../lib/builder-types";
import "../builder.css";

type Level = "campaign" | "adset" | "ad";
type DataWidget = Extract<BuilderWidget, { kind: "data" }>;
type MetaResult = { client: { id: string }; provider: "meta"; scope: { level: Level }; dateRange: { start: string; end: string }; status: "succeeded" | "partial"; warnings: string[]; rows: Array<Record<string, unknown>> };
type MetaState = { status: "loading" | "error" | "ready"; error?: string; result?: MetaResult };
type Field = ManualDataset["fields"][number];
type Draft = { id?: string; title: string; note: string; width: number; kind: "text" | "data"; body: string; sourceKind: "manual" | "meta"; datasetId: string; level: Level; visualization: "metric" | "bar" | "table"; dimension: string; measure: string; aggregation: "sum" | "avg" | "count"; format: "number" | "currency" | "percent" };
const levelDimension: Record<Level, string> = { campaign: "campaignName", adset: "adsetName", ad: "adName" };
const metaMeasures = ["spend", "impressions", "clicks"];
const today = () => new Date().toISOString().slice(0, 10);
const initialDraft = (datasetId = ""): Draft => ({ title: "", note: "", width: 6, kind: "data", body: "", sourceKind: "manual", datasetId, level: "campaign", visualization: "metric", dimension: "", measure: "", aggregation: "sum", format: "number" });
const makeDraft = (widget: BuilderWidget): Draft => widget.kind === "text"
  ? { ...initialDraft(), id: widget.id, kind: "text", title: widget.title, body: widget.body, width: widget.width, note: widget.note ?? "" }
  : { ...initialDraft(), id: widget.id, title: widget.title, width: widget.width, note: widget.note ?? "", sourceKind: widget.source.kind, datasetId: widget.source.kind === "manual" ? widget.source.datasetId : "", level: widget.source.kind === "meta" ? widget.source.level : "campaign", visualization: widget.visualization, dimension: widget.dimension ?? "", measure: widget.measure, aggregation: widget.aggregation, format: widget.format };
function formatValue(value: number, format: DataWidget["format"], currency: string) {
  if (format === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
  if (format === "percent") return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}
function aggregate(rows: Array<Record<string, unknown>>, widget: DataWidget, dimension?: string) {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const label = dimension ? String(row[dimension] ?? "Não informado") : "Total";
    const values = groups.get(label) ?? [];
    const raw = row[widget.measure];
    // Count means row count; sum/avg ignore empty and non-numeric values.
    if (widget.aggregation === "count") values.push(1);
    else if (typeof raw === "number" && Number.isFinite(raw)) values.push(raw);
    groups.set(label, values);
  }
  return [...groups].map(([label, values]) => ({ label, value: values.length ? widget.aggregation === "count" || widget.aggregation === "sum" ? values.reduce((sum, n) => sum + n, 0) : values.reduce((sum, n) => sum + n, 0) / values.length : null }));
}
function isBuilderDocument(value: unknown): value is BuilderDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<BuilderDocument>;
  return Number.isSafeInteger(doc.version) && Array.isArray(doc.datasets) && Array.isArray(doc.widgets) &&
    doc.datasets.every(dataset => dataset && typeof dataset.id === "string" && typeof dataset.name === "string" && Array.isArray(dataset.fields) && Array.isArray(dataset.rows)) &&
    doc.widgets.every(widget => widget && typeof widget.id === "string" && typeof widget.title === "string" && (widget.kind === "text" ? typeof widget.body === "string" : widget.kind === "data" && !!widget.source && typeof widget.measure === "string" && ["manual", "meta"].includes(widget.source.kind)));
}
function validateMeta(payload: unknown, clientId: string, level: Level, start: string, end: string): payload is MetaResult {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as MetaResult;
  return value.provider === "meta" && value.client?.id === clientId && value.scope?.level === level && value.dateRange?.start === start && value.dateRange?.end === end && ["partial", "succeeded"].includes(value.status) && Array.isArray(value.rows) && value.rows.every(row => row && metaMeasures.every(measure => typeof row[measure] === "number" && Number.isFinite(row[measure] as number)));
}
function WidgetCard({ widget, dataset, meta, currency, admin, busy, rect, selected, onSelect, onPointerStart, onPointerMove, onPointerEnd, onPointerCancel, onKeyboardMove, onEdit, onRemove }: { widget: BuilderWidget; dataset?: ManualDataset; meta?: MetaState; currency: string; admin: boolean; busy: boolean; rect: CanvasRect; selected: boolean; onSelect: () => void; onPointerStart: (mode: "move" | "resize", event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerCancel: () => void; onKeyboardMove: (mode: "move" | "resize", event: ReactKeyboardEvent<HTMLButtonElement>) => void; onEdit: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  let content;
  if (widget.kind === "text") content = <div className="builder-text-scroll"><p className="builder-copy">{widget.body}</p>{widget.note && <p className="builder-note">{widget.note}</p>}</div>;
  else {
    const unavailable = widget.source.kind === "meta" ? meta?.status === "error" ? meta.error : meta?.status === "loading" || !meta ? "Consultando Meta Ads…" : null : !dataset ? "Conjunto manual indisponível." : null;
    const rows = widget.source.kind === "manual" ? dataset?.rows as Array<Record<string, unknown>> | undefined : meta?.result?.rows;
    const grouped = rows ? aggregate(rows, widget, widget.visualization === "metric" ? undefined : widget.dimension) : [];
    const max = Math.max(0, ...grouped.map(item => item.value ?? 0));
    content = <>
      {unavailable ? <p className="builder-empty-inline" role="status">{unavailable}</p> : !rows?.length ? <p className="builder-empty-inline">Nenhuma linha para esta visualização.</p> : widget.visualization === "metric" ? <strong className="builder-metric">{grouped[0]?.value == null ? "Sem valores informados" : formatValue(grouped[0].value, widget.format, currency)}</strong> : widget.visualization === "table" ? <div className="builder-table-scroll"><table><thead><tr><th>{widget.dimension || "Grupo"}</th><th>{widget.measure}</th></tr></thead><tbody>{grouped.map(item => <tr key={item.label}><td>{item.label}</td><td>{item.value == null ? "Sem valores informados" : formatValue(item.value, widget.format, currency)}</td></tr>)}</tbody></table></div> : <div className="builder-bars">{grouped.map(item => <div className="builder-bar-row" key={item.label}><span>{item.label}</span><strong>{item.value == null ? "Sem valores informados" : formatValue(item.value, widget.format, currency)}</strong><span className="builder-bar-track"><span style={{ width: `${max > 0 ? Math.max(0, (item.value ?? 0) / max * 100) : 0}%` }} /></span></div>)}</div>}
      {meta?.result?.status === "partial" && widget.source.kind === "meta" && <p className="builder-warning">Consulta parcial: resultados podem estar incompletos. {meta.result.warnings.join(" ")}</p>}
      <p className="builder-provenance">{widget.source.kind === "manual" ? `Informado manualmente · ${dataset?.sourceLabel ?? "Fonte indisponível"} · ${dataset?.periodStart ?? ""} a ${dataset?.periodEnd ?? ""}` : `Meta Ads · ${widget.source.level}`}</p>
    </>;
  }
  return <article aria-label={widget.title} data-selected={selected} className="builder-widget" tabIndex={admin ? 0 : undefined} style={{ gridColumn: `${rect.x + 1} / span ${rect.width}`, gridRow: `${rect.y + 1} / span ${rect.height}` }} onClick={event => { if (!(event.target as HTMLElement).closest("button")) onSelect(); }} onKeyDown={event => { if (event.target === event.currentTarget && admin && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(); } }}>
    <header>{admin && <button type="button" className="builder-drag-handle" aria-label={`Arrastar ${widget.title}`} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" disabled={busy} onPointerDown={event => onPointerStart("move", event)} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerCancel} onKeyDown={event => onKeyboardMove("move", event)}>Arrastar</button>}<div><small>{widget.kind === "text" ? "TEXTO" : widget.source.kind === "meta" ? "META ADS" : "MANUAL"}</small><h3>{widget.title}</h3></div>{admin && <div className="builder-widget-actions"><button type="button" disabled={busy} onClick={onEdit} aria-label={`Editar ${widget.title}`}>Editar</button><button type="button" disabled={busy} onClick={() => setConfirm(true)} aria-label={`Excluir ${widget.title}`}>Excluir</button></div>}</header>
    {content}{widget.note && widget.kind !== "text" && <p className="builder-note">{widget.note}</p>}
    {confirm && <div className="builder-confirm"><p>Excluir esta visualização?</p><button type="button" disabled={busy} onClick={onRemove}>Confirmar exclusão</button><button type="button" onClick={() => setConfirm(false)}>Cancelar</button></div>}
    {admin && <button type="button" className="builder-resize-handle" aria-label={`Redimensionar ${widget.title}`} disabled={busy} onPointerDown={event => onPointerStart("resize", event)} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerCancel} onKeyDown={event => onKeyboardMove("resize", event)} />}
  </article>;
}
function BuilderWorkspace({ clientId, admin, currency, metaConnected }: { clientId: string; admin: boolean; currency: string; metaConnected: boolean }) {
  const [doc, setDoc] = useState<BuilderDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [datasetDraft, setDatasetDraft] = useState<ManualDataset | null>(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<Field["type"]>("text");
  const [widgetDraft, setWidgetDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<BuilderWidget[] | null>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; pointerId: number; startX: number; startY: number; initial: CanvasRect; lastDx: number; lastDy: number } | null>(null);
  const previewRef = useRef<BuilderWidget[] | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(() => `${today().slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [metaState, setMetaState] = useState<{ key: string; results: Partial<Record<Level, MetaState>> }>({ key: "", results: {} });
  const url = `/api/clients/${encodeURIComponent(clientId)}/builder`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Não foi possível carregar o painel configurável.");
      const value: unknown = await response.json();
      if (!isBuilderDocument(value)) throw new Error("Resposta do painel inválida.");
      return value;
    }).then(value => { if (!controller.signal.aborted) { setDoc(value); setLoading(false); setError(""); setConflict(false); } }).catch(reason => { if (!controller.signal.aborted) { setLoading(false); setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel configurável."); } });
    return () => controller.abort();
  }, [url, revision]);
  const levels = metaConnected ? [...new Set(doc?.widgets.flatMap(widget => widget.kind === "data" && widget.source.kind === "meta" ? [widget.source.level] : []) ?? [])] : [];
  const levelKey = levels.sort().join(",");
  const validMetaDates = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end && (Date.parse(end) - Date.parse(start)) <= 92 * 86400000;
  const requestKey = `${clientId}:${start}:${end}:${levelKey}`;
  const meta = metaState.key === requestKey ? metaState.results : {};
  useEffect(() => {
    if (!levelKey || !validMetaDates) return;
    const controller = new AbortController();
    const requested = levelKey.split(",") as Level[];
    for (const level of requested) {
      const params = new URLSearchParams({ client: clientId, start, end, level });
      fetch(`/api/dashboard?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("Meta Ads indisponível para este recorte.");
        const value: unknown = await response.json();
        if (!validateMeta(value, clientId, level, start, end)) throw new Error("Resposta Meta não corresponde ao cliente, nível ou período solicitado.");
        return value;
      }).then(result => { if (!controller.signal.aborted) setMetaState(current => ({ key: requestKey, results: { ...(current.key === requestKey ? current.results : {}), [level]: { status: "ready", result } } })); }).catch(reason => { if (!controller.signal.aborted) setMetaState(current => ({ key: requestKey, results: { ...(current.key === requestKey ? current.results : {}), [level]: { status: "error", error: reason instanceof Error ? reason.message : "Meta Ads indisponível." } } })); });
    }
    return () => controller.abort();
  }, [clientId, levelKey, start, end, requestKey, validMetaDates]);
  async function save(next: BuilderDocument, onSuccess?: () => void) {
    if (!doc || busy || conflict) return;
    setBusy(true); setError("");
    const controller = new AbortController();
    pending.add(controller);
    try {
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next), signal: controller.signal });
      if (response.status === 409) { setConflict(true); setError("Outra pessoa alterou este painel. Suas alterações não foram salvas. Recarregue antes de editar novamente."); return; }
      if (!response.ok) throw new Error("Não foi possível salvar. Confira os campos e tente novamente.");
      const updated: unknown = await response.json();
      if (!isBuilderDocument(updated)) throw new Error("Resposta do painel inválida após salvar.");
      if (!controller.signal.aborted) { setDoc(updated); onSuccess?.(); }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { pending.delete(controller); if (!controller.signal.aborted) setBusy(false); }
  }
  const [pending] = useState(() => new Set<AbortController>());
  useEffect(() => () => { pending.forEach(controller => controller.abort()); }, [pending]);
  const reload = () => { pending.forEach(controller => controller.abort()); setDoc(null); setWidgetDraft(null); setDatasetDraft(null); setSelected(null); setError(""); setLoading(true); setConflict(false); setBusy(false); setRevision(value => value + 1); };
  const editDataset = (dataset?: ManualDataset) => { setWidgetDraft(null); setDatasetDraft(dataset ? structuredClone(dataset) : { id: crypto.randomUUID(), name: "", sourceLabel: "", periodStart: "", periodEnd: "", fields: [], rows: [] }); setError(""); };
  const updateDataset = (patch: Partial<ManualDataset>) => setDatasetDraft(current => current ? { ...current, ...patch } : null);
  const addField = () => {
    if (!datasetDraft || !fieldLabel.trim()) { setError("Informe o nome do campo."); return; }
    const base = fieldLabel.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "").slice(0, 58).replace(/-+$/g, "") || "campo";
    let id = base, suffix = 2;
    while (datasetDraft.fields.some(field => field.id === id)) id = `${base}-${suffix++}`;
    updateDataset({ fields: [...datasetDraft.fields, { id, label: fieldLabel.trim(), type: fieldType }], rows: datasetDraft.rows.map(row => ({ ...row, [id]: null })) });
    setFieldLabel(""); setFieldType("text"); setError("");
  };
  const saveDataset = (event: FormEvent) => {
    event.preventDefault(); if (!doc || !datasetDraft) return;
    if (!datasetDraft.name.trim() || !datasetDraft.sourceLabel.trim() || !datasetDraft.periodStart || !datasetDraft.periodEnd || datasetDraft.periodStart > datasetDraft.periodEnd || !datasetDraft.fields.length) { setError("Informe nome, fonte, período válido e ao menos um campo."); return; }
    const normalized = { ...datasetDraft, name: datasetDraft.name.trim(), sourceLabel: datasetDraft.sourceLabel.trim() };
    void save({ ...doc, datasets: doc.datasets.some(item => item.id === normalized.id) ? doc.datasets.map(item => item.id === normalized.id ? normalized : item) : [...doc.datasets, normalized] }, () => setDatasetDraft(null));
  };
  const saveWidget = (event: FormEvent) => {
    event.preventDefault(); if (!doc || !widgetDraft) return;
    const d = widgetDraft;
    if (!d.title.trim()) { setError("Informe o título da visualização."); return; }
    if (d.kind === "text" && !d.body.trim()) { setError("Informe o conteúdo do texto."); return; }
    if (d.kind === "data" && d.visualization !== "metric" && !d.dimension) { setError("Selecione uma dimensão para barras ou tabela."); return; }
    if (d.kind === "data" && (!d.measure || (d.sourceKind === "manual" && !doc.datasets.some(dataset => dataset.id === d.datasetId)) || (d.sourceKind === "meta" && !metaConnected))) { setError("Selecione uma fonte e uma medida disponíveis."); return; }
    const existingPosition = d.id ? doc.widgets.find(item => item.id === d.id)?.position : undefined;
    const base = { id: d.id ?? crypto.randomUUID(), title: d.title.trim(), width: d.width, ...(existingPosition ? { position: existingPosition } : {}), ...(d.note.trim() ? { note: d.note.trim() } : {}) };
    const widget: BuilderWidget = d.kind === "text" ? { ...base, kind: "text", body: d.body } : { ...base, kind: "data", source: d.sourceKind === "meta" ? { kind: "meta", level: d.level } : { kind: "manual", datasetId: d.datasetId }, visualization: d.visualization, ...(d.dimension && d.visualization !== "metric" ? { dimension: d.dimension } : {}), measure: d.measure, aggregation: d.aggregation, format: d.format };
    const widgets = d.id ? doc.widgets.map(item => item.id === d.id ? widget : item) : [...doc.widgets, widget];
    const arranged = d.id && existingPosition ? placeCanvasWidget(widgets, widget.id, { ...resolveCanvas(doc.widgets)[widget.id], width: d.width }) : widgets;
    void save({ ...doc, widgets: arranged }, () => { setWidgetDraft(null); setSelected(widget.id); });
  };
  const keyboardMove = (id: string, mode: "move" | "resize", event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const deltas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = deltas[event.key];
    if (!delta || !doc || busy || conflict) return;
    event.preventDefault(); event.stopPropagation();
    const rect = resolveCanvas(doc.widgets)[id];
    const next = placeCanvasWidget(doc.widgets, id, mode === "move" ? { ...rect, x: rect.x + delta[0], y: rect.y + delta[1] } : { ...rect, width: rect.width + delta[0], height: rect.height + delta[1] });
    setSelected(id);
    const placed = resolveCanvas(next)[id];
    if (placed.x !== rect.x || placed.y !== rect.y || placed.width !== rect.width || placed.height !== rect.height) void save({ ...doc, widgets: next });
  };
  const active = doc?.widgets.find(widget => widget.id === selected);
  const visibleWidgets = dragPreview ?? doc?.widgets ?? [];
  const canvasRects = useMemo(() => resolveCanvas(dragPreview ?? doc?.widgets ?? []), [dragPreview, doc?.widgets]);
  const resizeSelection = (patch: Partial<CanvasRect>) => {
    if (!doc || !active || busy || conflict) return;
    const next = placeCanvasWidget(doc.widgets, active.id, { ...canvasRects[active.id], ...patch });
    void save({ ...doc, widgets: next });
  };
  const startPointer = (id: string, mode: "move" | "resize", event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!doc || busy || conflict || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const initial = resolveCanvas(doc.widgets)[id];
    dragRef.current = { id, mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, initial, lastDx: 0, lastDy: 0 };
    setSelected(id); setWidgetDraft(null); setDatasetDraft(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const updatePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!doc || !drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const width = canvasRef.current?.getBoundingClientRect().width ?? 0;
    if (width < 120) return;
    const stepX = (width - 11 * 10) / 12 + 10;
    const dx = Math.round((event.clientX - drag.startX) / stepX);
    const dy = Math.round((event.clientY - drag.startY) / 44);
    if (dx === drag.lastDx && dy === drag.lastDy) return;
    drag.lastDx = dx; drag.lastDy = dy;
    const rect = drag.mode === "move" ? { ...drag.initial, x: drag.initial.x + dx, y: drag.initial.y + dy } : { ...drag.initial, width: drag.initial.width + dx, height: drag.initial.height + dy };
    const next = placeCanvasWidget(doc.widgets, drag.id, rect);
    previewRef.current = next;
    setDragPreview(next);
  };
  const endPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!doc || !drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    updatePointer(event);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    const next = previewRef.current;
    previewRef.current = null;
    if (!next) { setDragPreview(null); return; }
    const placed = resolveCanvas(next)[drag.id];
    if (placed.x === drag.initial.x && placed.y === drag.initial.y && placed.width === drag.initial.width && placed.height === drag.initial.height) { setDragPreview(null); return; }
    void save({ ...doc, widgets: next }).finally(() => setDragPreview(null));
  };
  const cancelPointer = () => { dragRef.current = null; previewRef.current = null; setDragPreview(null); };
  const addFromPalette = (visualization: "metric" | "bar" | "table") => {
    if (!doc || busy || conflict) return;
    const first = doc.datasets[0];
    const numeric = first?.fields.find(field => field.type === "number");
    const dimension = first?.fields.find(field => field.type === "text");
    if (!metaConnected && (!first || !numeric || (visualization !== "metric" && !dimension))) {
      setError("Crie um conjunto manual com campo numérico e, para barras ou tabela, também um campo de texto.");
      return;
    }
    const id = crypto.randomUUID();
    const title = visualization === "metric" ? "Investimento Meta Ads" : visualization === "bar" ? "Gasto por campanha" : "Campanhas Meta Ads";
    const widget: BuilderWidget = { id, title: metaConnected ? title : `${visualization === "metric" ? "Métrica" : visualization === "bar" ? "Barras" : "Tabela"} · ${first!.name}`, kind: "data", width: visualization === "table" ? 8 : 6, source: metaConnected ? { kind: "meta", level: "campaign" } : { kind: "manual", datasetId: first!.id }, visualization, ...(visualization === "metric" ? {} : { dimension: metaConnected ? "campaignName" : dimension!.id }), measure: metaConnected ? "spend" : numeric!.id, aggregation: "sum", format: metaConnected ? "currency" : "number" };
    const rect = resolveCanvas([...doc.widgets, widget])[id];
    void save({ ...doc, widgets: [...doc.widgets, { ...widget, position: { x: rect.x, y: rect.y, height: rect.height } }] }, () => { setSelected(id); setWidgetDraft(null); setError(""); });
  };
  const sourceDataset = doc?.datasets.find(item => item.id === widgetDraft?.datasetId);
  const fields = sourceDataset?.fields ?? [];
  const availableMeasures = widgetDraft?.sourceKind === "meta" ? metaMeasures : fields.filter(field => widgetDraft?.aggregation === "count" || field.type === "number").map(field => field.id);
  const dimensions = widgetDraft?.sourceKind === "meta" ? [levelDimension[widgetDraft.level]] : fields.filter(field => field.type === "text").map(field => field.id);
  const setDraft = (patch: Partial<Draft>) => setWidgetDraft(current => current ? { ...current, ...patch } : null);
  return <section className="builder" aria-label="Painel configurável">
    <div className="builder-heading"><div><p className="builder-overline">YORUS / BUILDER</p><h2>Painel configurável</h2><p>Organize dados informados e métricas conectadas em um espaço próprio do cliente.</p></div><span className="builder-mode">{admin ? "Modo edição" : "Somente leitura"}</span></div>
    {error && <div className="builder-error" role="alert">{error}</div>}
    {conflict ? <button type="button" onClick={reload}>Recarregar painel</button> : !doc && !loading ? <button type="button" onClick={reload}>Tentar novamente</button> : null}
    {loading ? <p role="status" className="builder-loading">Carregando painel…</p> : doc && <div className="builder-shell">
      <aside className="builder-sources" aria-label="Fontes de dados"><h3>Fontes</h3><p className="builder-hint">Conjuntos manuais têm período e origem próprios. O filtro Meta não altera seus valores.</p>
        <div className="builder-source-list"><div className="builder-source"><strong>Meta Ads</strong><span>{metaConnected ? "Conectado" : "Não conectado"}</span></div>{["GA4", "CRM", "Formulários"].map(name => <div className="builder-source" key={name}><strong>{name}</strong><span>Não conectado</span></div>)}</div>
        {admin && <div className="builder-chart-palette"><h4>Adicionar ao canvas</h4><p>Escolha um gráfico; depois selecione, arraste e ajuste o tamanho.</p><div>{([['metric', 'Métrica'], ['bar', 'Barras'], ['table', 'Tabela']] as const).map(([kind, label]) => <button type="button" key={kind} disabled={busy || conflict} aria-label={`Adicionar gráfico de ${label.toLowerCase()}`} onClick={() => addFromPalette(kind)}>{label}</button>)}<button type="button" disabled={busy || conflict} onClick={() => { setDatasetDraft(null); setWidgetDraft({ ...initialDraft(), kind: "text" }); setSelected(null); }}>Texto</button></div></div>}
        <div className="builder-pane-heading"><h4>Conjuntos manuais</h4>{admin && <button type="button" disabled={busy || conflict} onClick={() => editDataset()}>Novo conjunto manual</button>}</div>
        {doc.datasets.length ? <ul className="builder-dataset-list">{doc.datasets.map(dataset => <li key={dataset.id}><strong>{dataset.name}</strong><small>{dataset.sourceLabel} · {dataset.rows.length} linhas</small>{admin && <button type="button" disabled={busy || conflict} onClick={() => editDataset(dataset)}>Editar {dataset.name}</button>}</li>)}</ul> : <p className="builder-hint">Nenhum conjunto manual configurado.</p>}
      </aside>
      <section className="builder-canvas" aria-label="Canvas"><div className="builder-pane-heading"><div><h3>Canvas</h3><p>{doc.widgets.length} visualizações</p></div>{admin && <button className="builder-primary" type="button" disabled={busy || conflict} onClick={() => { setDatasetDraft(null); setWidgetDraft(initialDraft(doc.datasets[0]?.id)); setSelected(null); setError(""); }}>Adicionar visualização</button>}</div>
        {levelKey && <div className="builder-dates"><label>Início Meta<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>Fim Meta<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label></div>}
        {doc.widgets.length ? <div className="builder-grid" ref={canvasRef}>{visibleWidgets.map(widget => <WidgetCard key={widget.id} widget={widget} rect={canvasRects[widget.id]} selected={selected === widget.id} onSelect={() => { if (admin) { setSelected(widget.id); setWidgetDraft(null); setDatasetDraft(null); } }} onPointerStart={(mode, event) => startPointer(widget.id, mode, event)} onPointerMove={updatePointer} onPointerEnd={endPointer} onPointerCancel={cancelPointer} onKeyboardMove={(mode, event) => keyboardMove(widget.id, mode, event)} dataset={widget.kind === "data" && widget.source.kind === "manual" ? doc.datasets.find(item => item.id === (widget.source as { kind: "manual"; datasetId: string }).datasetId) : undefined} meta={widget.kind === "data" && widget.source.kind === "meta" ? !metaConnected ? { status: "error", error: "Meta Ads não conectado." } : !validMetaDates ? { status: "error", error: "Selecione um período Meta válido de até 92 dias." } : meta[widget.source.level] : undefined} currency={currency} admin={admin} busy={busy || conflict} onEdit={() => { setSelected(widget.id); setWidgetDraft(makeDraft(widget)); setDatasetDraft(null); }} onRemove={() => void save({ ...doc, widgets: doc.widgets.filter(item => item.id !== widget.id) }, () => setSelected(null))} />)}</div> : <div className="builder-empty"><strong>Canvas vazio</strong><p>{admin ? "Escolha Métrica, Barras ou Tabela à esquerda para começar com uma fonte conectada. Depois clique no gráfico para mover e redimensionar." : "A equipe ainda não configurou visualizações para este cliente."}</p></div>}
      </section>
      <aside className="builder-inspector" aria-label="Inspetor"><h3>Inspetor</h3>
        {admin && datasetDraft ? <form className="builder-form" onSubmit={saveDataset} noValidate><h4>{doc.datasets.some(item => item.id === datasetDraft.id) ? "Editar conjunto" : "Novo conjunto"}</h4><label>Nome do conjunto<input value={datasetDraft.name} onChange={event => updateDataset({ name: event.target.value })} required /></label><label>Fonte do conjunto<input value={datasetDraft.sourceLabel} onChange={event => updateDataset({ sourceLabel: event.target.value })} required /></label><label>Início do período manual<input type="date" value={datasetDraft.periodStart} onChange={event => updateDataset({ periodStart: event.target.value })} required /></label><label>Fim do período manual<input type="date" value={datasetDraft.periodEnd} onChange={event => updateDataset({ periodEnd: event.target.value })} required /></label>
          <fieldset><legend>Campos</legend>{datasetDraft.fields.map(field => <div className="builder-field" key={field.id}><label>{`Campo ${field.label}`}<input value={field.label} onChange={event => updateDataset({ fields: datasetDraft.fields.map(item => item.id === field.id ? { ...item, label: event.target.value } : item) })} /></label><span>{field.type === "number" ? "Número" : "Texto"}</span><button type="button" onClick={() => updateDataset({ fields: datasetDraft.fields.filter(item => item.id !== field.id), rows: datasetDraft.rows.map(row => { const copy = { ...row }; delete copy[field.id]; return copy; }) })}>Remover {field.label}</button></div>)}<label>Nome do campo<input value={fieldLabel} onChange={event => setFieldLabel(event.target.value)} /></label><label>Tipo do campo<select value={fieldType} onChange={event => setFieldType(event.target.value as Field["type"])}><option value="text">Texto</option><option value="number">Número</option></select></label><button type="button" onClick={addField}>Adicionar campo</button></fieldset>
          <fieldset><legend>Linhas</legend>{datasetDraft.rows.map((row, index) => <div className="builder-row-editor" key={index}>{datasetDraft.fields.map(field => <label key={field.id}>{`Linha ${index + 1}: ${field.label}`}<input type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? "any" : undefined} value={row[field.id] ?? ""} onChange={event => updateDataset({ rows: datasetDraft.rows.map((item, i) => i === index ? { ...item, [field.id]: event.target.value === "" ? null : field.type === "number" ? Number(event.target.value) : event.target.value } : item) })} /></label>)}<button type="button" onClick={() => updateDataset({ rows: datasetDraft.rows.filter((_, i) => i !== index) })}>Remover linha {index + 1}</button></div>)}<button type="button" onClick={() => updateDataset({ rows: [...datasetDraft.rows, Object.fromEntries(datasetDraft.fields.map(field => [field.id, null]))] })}>Adicionar linha</button></fieldset><div className="builder-form-actions"><button className="builder-primary" type="submit" disabled={busy || conflict}>Salvar conjunto</button><button type="button" onClick={() => setDatasetDraft(null)}>Cancelar</button></div></form>
        : admin && widgetDraft ? <form className="builder-form" onSubmit={saveWidget} noValidate><h4>{widgetDraft.id ? "Editar visualização" : "Nova visualização"}</h4><label>Tipo<select value={widgetDraft.kind} onChange={event => setDraft({ kind: event.target.value as Draft["kind"] })}><option value="data">Dados</option><option value="text">Texto</option></select></label><label>Título da visualização<input value={widgetDraft.title} onChange={event => setDraft({ title: event.target.value })} required /></label><label>Largura<select value={widgetDraft.width} onChange={event => setDraft({ width: Number(event.target.value) as Draft["width"] })}>{Array.from({ length: 12 }, (_, i) => i + 1).map(value => <option key={value} value={value}>{value} colunas</option>)}</select></label><label>Observação<textarea value={widgetDraft.note} onChange={event => setDraft({ note: event.target.value })} /></label>
          {widgetDraft.kind === "text" ? <label>Conteúdo<textarea value={widgetDraft.body} onChange={event => setDraft({ body: event.target.value })} /></label> : <><label>Fonte<select value={widgetDraft.sourceKind} onChange={event => { const kind = event.target.value as Draft["sourceKind"]; setDraft({ sourceKind: kind, measure: kind === "meta" ? "spend" : "", dimension: kind === "meta" ? levelDimension[widgetDraft.level] : "" }); }}><option value="manual">Conjunto manual</option>{metaConnected && <option value="meta">Meta Ads</option>}</select></label>
            {widgetDraft.sourceKind === "manual" ? <label>Conjunto<select value={widgetDraft.datasetId} onChange={event => setDraft({ datasetId: event.target.value, measure: "", dimension: "" })}><option value="">Selecione</option>{doc.datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select></label> : <label>Nível Meta<select value={widgetDraft.level} onChange={event => { const level = event.target.value as Level; setDraft({ level, dimension: levelDimension[level] }); }}><option value="campaign">Campanhas</option><option value="adset">Conjuntos de anúncios</option><option value="ad">Anúncios</option></select></label>}
            <label>Visualização<select value={widgetDraft.visualization} onChange={event => setDraft({ visualization: event.target.value as Draft["visualization"] })}><option value="metric">Métrica</option><option value="bar">Barras</option><option value="table">Tabela</option></select></label>
            {widgetDraft.visualization !== "metric" && <label>Dimensão<select value={widgetDraft.dimension} onChange={event => setDraft({ dimension: event.target.value })}><option value="">Selecione</option>{dimensions.map(value => <option key={value} value={value}>{fields.find(field => field.id === value)?.label ?? value}</option>)}</select></label>}
            <label>Medida<select value={widgetDraft.measure} onChange={event => setDraft({ measure: event.target.value })}><option value="">Selecione</option>{availableMeasures.map(value => <option key={value} value={value}>{fields.find(field => field.id === value)?.label ?? value}</option>)}</select></label><label>Agregação<select value={widgetDraft.aggregation} onChange={event => { const aggregation = event.target.value as Draft["aggregation"]; setDraft({ aggregation, measure: aggregation !== "count" && widgetDraft.sourceKind === "manual" && fields.find(field => field.id === widgetDraft.measure)?.type === "text" ? "" : widgetDraft.measure }); }}><option value="sum">Soma</option><option value="avg">Média</option><option value="count">Contagem de linhas</option></select></label><label>Formato<select value={widgetDraft.format} onChange={event => setDraft({ format: event.target.value as Draft["format"] })}><option value="number">Número</option><option value="currency">Moeda</option></select></label></>}
          <div className="builder-form-actions"><button className="builder-primary" type="submit" disabled={busy || conflict}>Salvar visualização</button><button type="button" onClick={() => setWidgetDraft(null)}>Cancelar</button></div></form>
        : <div className="builder-inspector-empty">{active ? <><h4>{active.title}</h4><p>{active.width} colunas · {active.kind === "text" ? "Texto" : active.visualization}</p>{admin && <div className="builder-size-controls"><p>Selecione um gráfico e ajuste no canvas. Arraste para mover; use o canto para redimensionar.</p><label>Largura no canvas<select value={canvasRects[active.id].width} disabled={busy || conflict} onChange={event => resizeSelection({ width: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 1).map(value => <option value={value} key={value}>{value} colunas</option>)}</select></label><label>Altura no canvas<select value={canvasRects[active.id].height} disabled={busy || conflict} onChange={event => resizeSelection({ height: Number(event.target.value) })}>{Array.from({ length: 23 }, (_, i) => i + 2).map(value => <option value={value} key={value}>{value} linhas</option>)}</select></label><button type="button" onClick={() => setWidgetDraft(makeDraft(active))}>Editar dados e formato</button></div>}</> : <p>{admin ? "Clique em um gráfico para selecionar, mover e redimensionar." : "As visualizações são definidas pela equipe."}</p>}</div>}
      </aside>
    </div>}
  </section>;
}
export default function DashboardBuilder(props: { clientId: string; admin: boolean; currency: string; metaConnected: boolean }) {
  // Keyed workspace discards a previous client's state immediately, even without a parent remount.
  return <BuilderWorkspace key={props.clientId} {...props} />;
}
