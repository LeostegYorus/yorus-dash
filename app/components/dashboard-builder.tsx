"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { findCanvasSpace, placeCanvasWidget, resolveCanvas, type CanvasRect } from "./builder-layout";
import BuilderChart from "./builder-chart";
import BuilderComparison from "./builder-comparison";
import { useBuilderMeta, validateMeta, type MetaState } from "./use-builder-meta";
import { previousPeriod, supportsMetaFilter, type BuilderSelection } from "../../lib/builder-analysis";
import MetaMetricPicker from "./meta-metric-picker";
import AppearanceControls from "./builder-appearance";
import { BASE_META_METRICS, getMetaMetric, type MetaMetric } from "../../lib/meta-metrics";
import { VisualGallery, VisualIcon, VISUAL_PRESETS } from "./builder-visuals";
import type { BuilderDocument, BuilderWidget, BuilderVisualization, ManualDataset, WidgetAppearance } from "../../lib/builder-types";
import "../builder.css";

type Level = "campaign" | "adset" | "ad";
type DataWidget = Extract<BuilderWidget, { kind: "data" }>;
type Field = ManualDataset["fields"][number];
type Draft = { id?: string; title: string; note: string; width: number; kind: "text" | "data"; body: string; sourceKind: "manual" | "meta"; datasetId: string; level: Level; visualization: BuilderVisualization; dimension: string; measure: string; measures: string[]; aggregation: "sum" | "avg" | "count"; format: "number" | "currency" | "percent"; appearance: WidgetAppearance };
const levelDimension: Record<Level, string> = { campaign: "campaignName", adset: "adsetName", ad: "adName" };
const metaMeasures = ["spend", "impressions", "clicks"];
const metaFieldLabels: Record<string, string> = { spend: "Investimento", impressions: "Impressões", clicks: "Cliques", campaignName: "Campanha", adsetName: "Conjunto de anúncios", adName: "Anúncio" };
const radialWarning = "Esta métrica não é aditiva: seus valores não representam partes de um total. Use barras, colunas ou tabela.";
const invalidRadial = (kind: string, visualization: string, measure: string) => kind === "meta" && ["pie", "donut", "treemap"].includes(visualization) && !getMetaMetric(measure)?.additive;
const today = () => new Date().toISOString().slice(0, 10);
const initialDraft = (datasetId = ""): Draft => ({ title: "", note: "", width: 6, kind: "data", body: "", sourceKind: "manual", datasetId, level: "campaign", visualization: "metric", dimension: "", measure: "", measures: [], aggregation: "sum", format: "number", appearance: {} });
const makeDraft = (widget: BuilderWidget): Draft => widget.kind === "text"
  ? { ...initialDraft(), id: widget.id, kind: "text", title: widget.title, body: widget.body, width: widget.width, note: widget.note ?? "", appearance: { ...widget.appearance } }
  : { ...initialDraft(), id: widget.id, title: widget.title, width: widget.width, note: widget.note ?? "", sourceKind: widget.source.kind, datasetId: widget.source.kind === "manual" ? widget.source.datasetId : "", level: widget.source.kind === "meta" ? widget.source.level : "campaign", visualization: widget.visualization, dimension: widget.dimension ?? "", measure: widget.measure, measures: widget.source.kind === "meta" && widget.visualization === "table" ? widget.measures ?? [widget.measure] : [], aggregation: widget.aggregation, format: widget.format, appearance: { ...widget.appearance } };
function formatValue(value: number, format: DataWidget["format"], currency: string, decimals?: number) {
  const precision = decimals === undefined ? {} : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  if (format === "currency") return new Intl.NumberFormat("pt-BR", { style: "currency", currency, ...precision }).format(value);
  if (format === "percent") return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1, ...precision }).format(value);
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, ...precision }).format(value);
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
function metaGroups(rows: Array<Record<string, unknown>>, widget: DataWidget, totals?: Record<string, number | null>) {
  if (!widget.measures && metaMeasures.includes(widget.measure) && widget.aggregation !== "sum") return aggregate(rows, widget, widget.visualization === "metric" ? undefined : widget.dimension);
  const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  if (widget.visualization === "metric") {
    const value = totals && Object.hasOwn(totals, widget.measure) ? numeric(totals[widget.measure]) : metaMeasures.includes(widget.measure) && rows.every(row => numeric(row[widget.measure]) !== null) ? rows.reduce((sum, row) => sum + (row[widget.measure] as number), 0) : null;
    return [{ label: "Total", value }];
  }
  const dimension = widget.dimension ?? "campaignName";
  const labels = rows.map(row => String(row[dimension] ?? "Não informado"));
  return rows.map((row, index) => ({ label: labels.filter(label => label === labels[index]).length > 1 ? `${labels[index]} · ${row[dimension.replace("Name", "Id")] ?? index + 1}` : labels[index], value: numeric(row[widget.measure]) }));
}
function isBuilderDocument(value: unknown): value is BuilderDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<BuilderDocument>;
  return Number.isSafeInteger(doc.version) && Array.isArray(doc.datasets) && Array.isArray(doc.widgets) &&
    doc.datasets.every(dataset => dataset && typeof dataset.id === "string" && typeof dataset.name === "string" && Array.isArray(dataset.fields) && Array.isArray(dataset.rows)) &&
    doc.widgets.every(widget => widget && typeof widget.id === "string" && typeof widget.title === "string" && (widget.kind === "text" ? typeof widget.body === "string" : widget.kind === "data" && !!widget.source && typeof widget.measure === "string" && ["manual", "meta"].includes(widget.source.kind)));
}
function WidgetCard({ widget, dataset, meta, selection, onFilter, comparison, currency, admin, busy, rect, selected, onSelect, onPointerStart, onPointerMove, onPointerEnd, onPointerCancel, onKeyboardMove, onEdit, onRemove, onDuplicate }: { widget: BuilderWidget; dataset?: ManualDataset; meta?: MetaState; selection: BuilderSelection | null; onFilter: (selection: BuilderSelection) => void; comparison?: { state?: MetaState; range: { start: string; end: string } | null }; currency: string; admin: boolean; busy: boolean; rect: CanvasRect; selected: boolean; onSelect: () => void; onPointerStart: (mode: "move" | "resize", event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerCancel: () => void; onKeyboardMove: (mode: "move" | "resize", event: ReactKeyboardEvent<HTMLButtonElement>) => void; onEdit: () => void; onRemove: () => void; onDuplicate: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const appearance = widget.appearance ?? {};
  const widgetStyle = {
    gridColumn: `${rect.x + 1} / span ${rect.width}`, gridRow: `${rect.y + 1} / span ${rect.height}`,
    "--widget-color": appearance.color, "--widget-background": appearance.background,
    "--widget-text": appearance.textColor, "--widget-font-size": appearance.fontSize ? `${appearance.fontSize}px` : undefined,
  } as CSSProperties;
  const tableScroll = useRef<HTMLDivElement>(null);
  const tableColumns = widget.kind === "data" && widget.visualization === "table" ? (widget.measures ?? [widget.measure]).join(",") : "";
  const previousColumns = useRef(tableColumns);
  const pendingColumnScroll = useRef(false);
  useEffect(() => {
    if (tableColumns !== previousColumns.current) {
      pendingColumnScroll.current = true;
      previousColumns.current = tableColumns;
    }
    if (!tableScroll.current || !pendingColumnScroll.current) return;
    tableScroll.current.scrollLeft = tableScroll.current.scrollWidth;
    pendingColumnScroll.current = false;
  }, [tableColumns, meta?.status, meta?.result]);
  let content;
  if (widget.kind === "text") content = <div className="builder-text-scroll"><p className="builder-copy">{widget.body}</p>{widget.note && <p className="builder-note">{widget.note}</p>}</div>;
  else {
    const unavailable = invalidRadial(widget.source.kind, widget.visualization, widget.measure) ? radialWarning : widget.source.kind === "meta" ? meta?.status === "error" ? meta.error : meta?.status === "loading" || !meta ? "Consultando Meta Ads…" : null : !dataset ? "Conjunto manual indisponível." : null;
    const rawRows = widget.source.kind === "manual" ? dataset?.rows as Array<Record<string, unknown>> | undefined : meta?.result?.rows;
    const matched = selection && (widget.source.kind === "manual" ? selection.kind === "manual" && selection.datasetId === widget.source.datasetId : selection.kind === "meta" && supportsMetaFilter(widget.source.level, selection));
    const rows = matched && selection?.kind === "manual" ? rawRows?.filter(row => String(row[selection.dimension] ?? "Não informado") === selection.value) : rawRows;
    const grouped = rows ? widget.source.kind === "meta" ? metaGroups(rows, widget, meta?.result?.totals) : aggregate(rows, widget, widget.visualization === "metric" ? undefined : widget.dimension) : [];
    const filterPoint = (index: number) => {
      const item = grouped[index];
      if (!item || !widget.dimension) return;
      if (widget.source.kind === "manual") onFilter({ kind: "manual", datasetId: widget.source.datasetId, dimension: widget.dimension, value: item.label, label: item.label, widgetId: widget.id });
      else {
        const id = rows?.[index]?.[`${widget.source.level}Id`];
        if (typeof id === "string" && /^\d{1,32}$/.test(id)) onFilter({ kind: "meta", level: widget.source.level, id, label: item.label, widgetId: widget.id });
      }
    };
    const canFilter = widget.visualization !== "metric" && Boolean(widget.dimension) && (widget.source.kind === "manual" || widget.aggregation === "sum");
    const selectedIndex = !matched ? undefined : selection?.kind === "meta" && widget.source.kind === "meta" && selection.level === widget.source.level
      ? rows?.findIndex(row => row[`${selection.level}Id`] === selection.id)
      : selection?.kind === "manual" && selection.dimension === widget.dimension ? grouped.findIndex(item => item.label === selection.value) : undefined;
    const previousValue = comparison?.state?.result ? metaGroups(comparison.state.result.rows, widget, comparison.state.result.totals)[0]?.value ?? null : null;
    const barMagnitude = Math.max(1, ...grouped.map(item => Math.abs(item.value ?? 0)));
    const barMin = Math.min(0, ...grouped.map(item => (item.value ?? 0) / barMagnitude));
    const barMax = Math.max(0, ...grouped.map(item => (item.value ?? 0) / barMagnitude));
    const barRange = barMax - barMin || 1;
    const barZero = -barMin / barRange * 100;
    const columns = widget.source.kind === "meta" ? widget.measures ?? [widget.measure] : [widget.measure];
    const globalWarnings = (meta?.result?.warnings ?? []).filter(warning => !/^(Meta rows have missing metric values|Meta summary unavailable|Meta metric unavailable:|Meta field unavailable:)/.test(warning));
    const missingValues = rows?.some(row => columns.some(id => typeof row[id] !== "number" || !Number.isFinite(row[id]))) || (widget.visualization === "metric" && grouped[0]?.value == null);
    const metaWarning = widget.source.kind === "meta" && meta?.result?.status === "partial" && (globalWarnings.length || !meta.result.warnings.length || missingValues)
      ? globalWarnings.length ? `Consulta parcial: resultados podem estar incompletos. ${globalWarnings.join(" ")}` : "Algumas métricas não foram retornadas neste recorte. Células sem valores não significam zero." : null;
    content = <>
      {unavailable ? <p className="builder-empty-inline" role="status">{unavailable}</p> : !rows?.length ? <p className="builder-empty-inline">Nenhuma linha para esta visualização.</p> : widget.visualization === "metric" ? <strong className="builder-metric">{grouped[0]?.value == null ? "Sem valores informados" : formatValue(grouped[0].value, widget.format, currency, appearance.decimals)}</strong> : widget.visualization === "table" ? <div className="builder-table-scroll" ref={tableScroll}><table><thead><tr><th>{widget.source.kind === "meta" ? metaFieldLabels[widget.dimension ?? ""] ?? "Categoria" : widget.dimension || "Grupo"}</th>{columns.map(id => <th key={id}>{widget.source.kind === "meta" ? getMetaMetric(id)?.label ?? id : id}</th>)}</tr></thead><tbody>{grouped.map((item, index) => <tr key={item.label}><td>{canFilter ? <button type="button" className="builder-filter-category" aria-label={`Filtrar por ${item.label}`} aria-pressed={selectedIndex === index} onClick={() => filterPoint(index)}>{item.label}</button> : item.label}</td>{columns.map(id => { const raw = widget.source.kind === "meta" && (widget.measures || widget.aggregation === "sum" || !metaMeasures.includes(widget.measure)) ? rows[index]?.[id] : item.value; const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null; return <td key={id}>{value === null ? "Sem valores informados" : formatValue(value, widget.source.kind === "meta" ? (!widget.measures && metaMeasures.includes(widget.measure) ? widget.format : getMetaMetric(id)?.format ?? "number") : widget.format, currency, appearance.decimals)}</td>; })}</tr>)}</tbody></table></div> : widget.visualization !== "bar" ? <BuilderChart type={widget.visualization} data={grouped} onSelect={canFilter ? filterPoint : undefined} selectedIndex={selectedIndex} appearance={appearance} formatValue={value => formatValue(value, widget.format, currency, appearance.decimals)} /> : <div className="builder-bars">{grouped.map((item, index) => <div className="builder-bar-row" key={item.label} role={canFilter ? "button" : undefined} tabIndex={canFilter ? 0 : undefined} aria-label={canFilter ? `Filtrar por ${item.label}` : undefined} aria-pressed={canFilter ? selectedIndex === index : undefined} onClick={event => { if (canFilter) { event.stopPropagation(); filterPoint(index); } }} onKeyDown={event => { if (canFilter && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); filterPoint(index); } }}><span>{item.label}</span><strong className={appearance.showLabels === false ? "builder-sr-only" : undefined}>{item.value == null ? "Sem valores informados" : formatValue(item.value, widget.format, currency, appearance.decimals)}</strong><span className="builder-bar-track">{item.value !== null && Number.isFinite(item.value) && <span className={item.value === 0 ? "builder-bar-zero" : "builder-bar-fill"} style={{ left: `${(Math.min(0, item.value / barMagnitude) - barMin) / barRange * 100}%`, width: item.value === 0 ? 3 : `${Math.abs(item.value / barMagnitude) / barRange * 100}%` }} />}<i className="builder-bar-origin" style={{ left: `${barZero}%` }} /></span></div>)}</div>}
      {comparison && !unavailable && <BuilderComparison current={meta} previous={comparison.state} value={grouped[0]?.value ?? null} previousValue={previousValue} range={comparison.range} formatValue={value => formatValue(value, widget.format, currency, appearance.decimals)} />}
      {selection && <p className="builder-filter-context">{matched ? "Filtro aplicado" : "Fora do escopo deste filtro"}</p>}
      {metaWarning && <p className="builder-warning">{metaWarning}</p>}
      <p className="builder-provenance">{widget.source.kind === "manual" ? `Informado manualmente · ${dataset?.sourceLabel ?? "Fonte indisponível"} · ${dataset?.periodStart ?? ""} a ${dataset?.periodEnd ?? ""}` : `Meta Ads · ${widget.source.level}`}</p>
    </>;
  }
  return <article id={`builder-widget-${widget.id}`} aria-label={widget.title} data-selected={selected} className="builder-widget" tabIndex={admin ? 0 : undefined} style={widgetStyle} onClick={event => { if (!(event.target as HTMLElement).closest("button")) onSelect(); }} onKeyDown={event => { if (event.target === event.currentTarget && admin && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(); } }}>
    <header>{admin && <button type="button" className="builder-drag-handle" aria-label={`Arrastar ${widget.title}`} aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" disabled={busy} onPointerDown={event => onPointerStart("move", event)} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerCancel} onKeyDown={event => onKeyboardMove("move", event)}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><circle cx="5" cy="4" r="1.3" /><circle cx="11" cy="4" r="1.3" /><circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" /><circle cx="5" cy="12" r="1.3" /><circle cx="11" cy="12" r="1.3" /></svg></button>}<div className={appearance.showTitle === false ? "builder-sr-only" : "builder-widget-heading"}><small>{widget.kind === "text" ? "TEXTO" : widget.source.kind === "meta" ? "META ADS" : "MANUAL"}</small><h3>{widget.title}</h3></div>{admin && <div className="builder-widget-actions"><button type="button" disabled={busy} onClick={onEdit} aria-label={`Editar ${widget.title}`}>Editar</button><button type="button" disabled={busy} onClick={onDuplicate} aria-label={`Duplicar ${widget.title}`}>Duplicar</button><button type="button" disabled={busy} onClick={() => setConfirm(true)} aria-label={`Excluir ${widget.title}`}>Excluir</button></div>}</header>
    {content}{widget.note && widget.kind !== "text" && <p className="builder-note">{widget.note}</p>}
    {admin && confirm && <div className="builder-confirm"><p>Excluir esta visualização?</p><button type="button" disabled={busy} onClick={onRemove}>Confirmar exclusão</button><button type="button" onClick={() => setConfirm(false)}>Cancelar</button></div>}
    {admin && <button type="button" className="builder-resize-handle" aria-label={`Redimensionar ${widget.title}`} disabled={busy} onPointerDown={event => onPointerStart("resize", event)} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerCancel} onKeyDown={event => onKeyboardMove("resize", event)} />}
  </article>;
}
function BuilderWorkspace({ clientId, clientName, admin: canAdmin, currency, metaConnected }: { clientId: string; clientName?: string; admin: boolean; currency: string; metaConnected: boolean }) {
  const [editing, setEditing] = useState(canAdmin);
  const [focus, setFocus] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"fields" | "appearance">("fields");
  const admin = canAdmin && editing;
  const [panel, setPanel] = useState<"sources" | "inspector" | null>("sources");
  const [savedNotice, setSavedNotice] = useState("");
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
  const [metricNotice, setMetricNotice] = useState({ id: "", text: "" });
  const [selected, setSelected] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<{ key: string; metrics: MetaMetric[]; error: string }>({ key: "", metrics: [], error: "" });
  const [dragPreview, setDragPreview] = useState<BuilderWidget[] | null>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; pointerId: number; startX: number; startY: number; initial: CanvasRect; lastDx: number; lastDy: number } | null>(null);
  const previewRef = useRef<BuilderWidget[] | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(() => `${today().slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [selection, setSelection] = useState<BuilderSelection | null>(null);
  const [compare, setCompare] = useState(false);
  const [history, setHistory] = useState<{ past: BuilderDocument[]; future: BuilderDocument[] }>({ past: [], future: [] });
  const saving = useRef(false);
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
  const measureKey = JSON.stringify(Object.fromEntries(levels.map(level => [level, [...new Set(doc?.widgets.flatMap(widget => widget.kind === "data" && widget.source.kind === "meta" && widget.source.level === level ? widget.visualization === "table" ? widget.measures ?? [widget.measure] : [widget.measure] : []) ?? [])].sort()])));
  const comparisonRange = previousPeriod(start, end);
  const validMetaDates = comparisonRange !== null;
  const entityFilter = selection?.kind === "meta" ? { level: selection.level, id: selection.id } : undefined;
  const meta = useBuilderMeta({ clientId, start, end, levelKey, measureKey, entityFilter, summary: compare });
  const comparisonLevels = levels.filter(level => doc?.widgets.some(widget => widget.kind === "data" && widget.source.kind === "meta" && widget.source.level === level && widget.visualization === "metric")).join(",");
  const previousMeta = useBuilderMeta({ clientId, start: comparisonRange?.start ?? "", end: comparisonRange?.end ?? "", levelKey: comparisonLevels, measureKey, entityFilter, enabled: compare && validMetaDates, summary: true });
  const catalogLevel = widgetDraft?.level ?? "campaign";
  const needsCatalog = metaConnected && widgetDraft?.kind === "data" && widgetDraft.sourceKind === "meta";
  const catalogKey = `${clientId}:${start}:${end}:${catalogLevel}`;
  useEffect(() => {
    if (!needsCatalog || !validMetaDates || catalogState.key === catalogKey) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ client: clientId, start, end, level: catalogLevel, catalog: "1" });
    fetch(`/api/dashboard?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Não foi possível consultar os eventos personalizados.");
      const value: unknown = await response.json();
      if (!validateMeta(value, clientId, catalogLevel, start, end) || !Array.isArray(value.metrics)) throw new Error("Catálogo Meta inválido para este cliente ou período.");
      const metrics = value.metrics.flatMap(item => { const metric = item && typeof item.id === "string" ? getMetaMetric(item.id) : undefined; return metric ? [metric] : []; });
      if (!controller.signal.aborted) setCatalogState({ key: catalogKey, metrics, error: value.status === "partial" ? "A descoberta de eventos foi parcial; alguns campos podem não aparecer." : "" });
    }).catch(reason => { if (!controller.signal.aborted) setCatalogState({ key: catalogKey, metrics: [], error: reason instanceof Error ? reason.message : "Catálogo indisponível." }); });
    return () => controller.abort();
  }, [needsCatalog, validMetaDates, catalogState.key, catalogKey, catalogLevel, clientId, start, end]);
  const catalogue = [...new Map([...BASE_META_METRICS, ...(catalogState.key === catalogKey ? catalogState.metrics : []), ...(doc?.widgets.flatMap(widget => widget.kind === "data" && widget.source.kind === "meta" ? widget.measures ?? [widget.measure] : []).flatMap(id => { const metric = getMetaMetric(id); return metric ? [metric] : []; }) ?? [])].map(metric => [metric.id, metric])).values()];
  async function save(next: BuilderDocument, onSuccess?: () => void, direction?: "undo" | "redo") {
    if (!admin || !doc || saving.current || conflict) return;
    saving.current = true;
    setBusy(true); setError(""); setSavedNotice("");
    const controller = new AbortController();
    pending.add(controller);
    try {
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next), signal: controller.signal });
      if (response.status === 409) { setConflict(true); setError("Outra pessoa alterou este painel. Suas alterações não foram salvas. Recarregue antes de editar novamente."); return; }
      if (!response.ok) throw new Error("Não foi possível salvar. Confira os campos e tente novamente.");
      const updated: unknown = await response.json();
      if (!isBuilderDocument(updated)) throw new Error("Resposta do painel inválida após salvar.");
      if (!controller.signal.aborted) {
        setHistory(current => direction === "undo" ? { past: current.past.slice(0, -1), future: [...current.future, doc].slice(-20) }
          : direction === "redo" ? { past: [...current.past, doc].slice(-20), future: current.future.slice(0, -1) }
          : { past: [...current.past, doc].slice(-20), future: [] });
        setDoc(updated); setSavedNotice(direction === "undo" ? "Alteração desfeita" : direction === "redo" ? "Alteração refeita" : "Alterações salvas"); onSuccess?.();
      }
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { pending.delete(controller); if (!controller.signal.aborted) { saving.current = false; setBusy(false); } }
  }
  const [pending] = useState(() => new Set<AbortController>());
  useEffect(() => () => { pending.forEach(controller => controller.abort()); }, [pending]);
  const reload = () => { pending.forEach(controller => controller.abort()); saving.current = false; setHistory({ past: [], future: [] }); setSelection(null); setDoc(null); setWidgetDraft(null); setDatasetDraft(null); setSelected(null); setError(""); setLoading(true); setConflict(false); setBusy(false); setRevision(value => value + 1); };
  const historyBlocked = busy || conflict || Boolean(widgetDraft || datasetDraft || dragPreview);
  const restoreHistory = (direction: "undo" | "redo") => {
    if (!admin || !doc || historyBlocked) return;
    const target = (direction === "undo" ? history.past : history.future).at(-1);
    if (target) void save({ ...structuredClone(target), version: doc.version }, () => { setSelected(null); setSelection(null); setPanel("sources"); }, direction);
  };
  const historyKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "z" || (event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!admin || historyBlocked) return;
    event.preventDefault(); restoreHistory(event.shiftKey ? "redo" : "undo");
  };
  const toggleSelection = (next: BuilderSelection) => setSelection(current => {
    const same = current?.kind === "meta" && next.kind === "meta" ? current.level === next.level && current.id === next.id
      : current?.kind === "manual" && next.kind === "manual" && current.datasetId === next.datasetId && current.dimension === next.dimension && current.value === next.value;
    return same ? null : next;
  });
  const editDataset = (dataset?: ManualDataset) => { setPanel("inspector"); setWidgetDraft(null); setDatasetDraft(dataset ? structuredClone(dataset) : { id: crypto.randomUUID(), name: "", sourceLabel: "", periodStart: "", periodEnd: "", fields: [], rows: [] }); setError(""); };
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
    void save({ ...doc, datasets: doc.datasets.some(item => item.id === normalized.id) ? doc.datasets.map(item => item.id === normalized.id ? normalized : item) : [...doc.datasets, normalized] }, () => { setDatasetDraft(null); setPanel("sources"); });
  };
  const saveWidget = (event: FormEvent) => {
    event.preventDefault(); if (!doc || !widgetDraft) return;
    const d = widgetDraft;
    if (d.kind === "data" && invalidRadial(d.sourceKind, d.visualization, d.measure)) { setError(radialWarning); return; }
    if (!d.title.trim()) { setError("Informe o título da visualização."); return; }
    if (d.kind === "text" && !d.body.trim()) { setError("Informe o conteúdo do texto."); return; }
    if (d.kind === "data" && d.visualization !== "metric" && !d.dimension) { setError("Selecione uma dimensão (categoria) para este visual."); return; }
    if (d.kind === "data" && (!d.measure || (d.sourceKind === "manual" && !doc.datasets.some(dataset => dataset.id === d.datasetId)) || (d.sourceKind === "meta" && !metaConnected))) { setError("Selecione uma fonte e uma medida disponíveis."); return; }
    const existing = d.id ? doc.widgets.find(item => item.id === d.id) : undefined;
    const oldRect = existing ? resolveCanvas(doc.widgets)[existing.id] : undefined;
    const existingPosition = existing?.position ?? (oldRect ? { x: oldRect.x, y: oldRect.y, height: oldRect.height } : undefined);
    const base = { id: d.id ?? crypto.randomUUID(), title: d.title.trim(), width: d.width, ...(existingPosition ? { position: existingPosition } : {}), ...(d.note.trim() ? { note: d.note.trim() } : {}), ...(Object.keys(d.appearance).length ? { appearance: d.appearance } : {}) };
    const widget: BuilderWidget = d.kind === "text" ? { ...base, kind: "text", body: d.body } : { ...base, kind: "data", source: d.sourceKind === "meta" ? { kind: "meta", level: d.level } : { kind: "manual", datasetId: d.datasetId }, visualization: d.visualization, ...(d.dimension && d.visualization !== "metric" ? { dimension: d.dimension } : {}), measure: d.measure, ...(d.sourceKind === "meta" && d.visualization === "table" && d.aggregation === "sum" ? { measures: d.measures.length ? d.measures : [d.measure] } : {}), aggregation: d.aggregation, format: d.format };
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
  const showSources = admin && panel === "sources";
  const showInspector = admin && panel === "inspector" && Boolean(active || widgetDraft || datasetDraft);
  const duplicateWidget = (widget: BuilderWidget) => {
    if (!admin || !doc || busy || conflict) return;
    if (doc.widgets.length >= 50) { setError("Este painel já tem 50 visuais. Remova um visual antes de duplicar."); return; }
    const copy = structuredClone(widget);
    copy.id = crypto.randomUUID(); copy.title = `${widget.title.slice(0, 112)} (cópia)`;
    delete copy.position;
    const old = resolveCanvas(doc.widgets)[widget.id];
    const free = findCanvasSpace(doc.widgets, old.width, old.height);
    copy.position = { x: free.x, y: free.y, height: free.height };
    const widgets = [...doc.widgets, copy];
    void save({ ...doc, widgets }, () => { setSelected(copy.id); setWidgetDraft(null); setDatasetDraft(null); setPanel("inspector"); });
  };
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
  const addFromPalette = (visualization: BuilderVisualization) => {
    if (!doc || busy || conflict) return;
    setPanel("inspector"); setInspectorTab("fields");
    const first = doc.datasets[0];
    const numeric = first?.fields.find(field => field.type === "number");
    const dimension = first?.fields.find(field => field.type === "text");
    if (!metaConnected && (!first || !numeric || (visualization !== "metric" && !dimension))) {
      setDatasetDraft(null); setSelected(null);
      setWidgetDraft({ ...initialDraft(first?.id), visualization, title: VISUAL_PRESETS.find(preset => preset.kind === visualization)!.label });
      setError("Nenhuma fonte compatível. Crie um conjunto manual com um valor numérico e uma categoria de texto, ou conecte uma fonte autorizada.");
      return;
    }
    const id = crypto.randomUUID();
    const label = VISUAL_PRESETS.find(preset => preset.kind === visualization)!.label;
    const title = visualization === "metric" ? "Investimento Meta Ads" : visualization === "bar" ? "Gasto por campanha" : visualization === "table" ? "Campanhas Meta Ads" : `${label} · Investimento por campanha`;
    const widget: BuilderWidget = { id, title: metaConnected ? title : `${label} · ${first!.name}`, kind: "data", width: visualization === "table" ? 8 : 6, source: metaConnected ? { kind: "meta", level: "campaign" } : { kind: "manual", datasetId: first!.id }, visualization, ...(visualization === "metric" ? {} : { dimension: metaConnected ? "campaignName" : dimension!.id }), measure: metaConnected ? "spend" : numeric!.id, aggregation: "sum", format: metaConnected ? "currency" : "number" };
    const rect = resolveCanvas([...doc.widgets, widget])[id];
    void save({ ...doc, widgets: [...doc.widgets, { ...widget, position: { x: rect.x, y: rect.y, height: rect.height } }] }, () => { setSelected(id); setDatasetDraft(null); setInspectorTab("fields"); setWidgetDraft(makeDraft(widget)); setError(""); });
  };
  const sourceDataset = doc?.datasets.find(item => item.id === widgetDraft?.datasetId);
  const fields = sourceDataset?.fields ?? [];
  const availableMeasures = widgetDraft?.sourceKind === "meta" ? metaMeasures : fields.filter(field => widgetDraft?.aggregation === "count" || field.type === "number").map(field => field.id);
  const dimensions = widgetDraft?.sourceKind === "meta" ? [levelDimension[widgetDraft.level]] : fields.filter(field => field.type === "text").map(field => field.id);
  const setDraft = (patch: Partial<Draft>) => setWidgetDraft(current => current ? { ...current, ...patch } : null);
  const automaticMetrics = !!(widgetDraft?.kind === "data" && widgetDraft.sourceKind === "meta" && widgetDraft.visualization === "table" && doc?.widgets.some(widget => widget.id === widgetDraft.id && widget.kind === "data" && widget.source.kind === "meta" && widget.visualization === "table"));
  const chooseMetaMetrics = (ids: string[]) => {
    if (!widgetDraft || busy || conflict) return;
    const patch: Partial<Draft> = { measure: ids[0] ?? "", measures: ids, format: getMetaMetric(ids[0] ?? "")?.format ?? "number", aggregation: "sum" };
    if (!automaticMetrics || !doc || !widgetDraft.id || !ids.length) { setDraft(patch); return; }
    const id = widgetDraft.id;
    const current = doc.widgets.find(widget => widget.id === id);
    if (current?.kind !== "data") return;
    const widget: DataWidget = { ...current, measure: ids[0], measures: ids, format: patch.format!, aggregation: "sum", source: { kind: "meta", level: widgetDraft.level }, dimension: levelDimension[widgetDraft.level] };
    setMetricNotice({ id, text: "" });
    void save({ ...doc, widgets: doc.widgets.map(item => item.id === id ? widget : item) }, () => {
      setWidgetDraft(draft => draft?.id === id ? { ...draft, ...patch } : draft);
      setMetricNotice({ id, text: "Tabela atualizada. Colunas salvas." });
    });
  };
  const changeVisual = (visualization: BuilderVisualization) => {
    if (!doc || busy || conflict) return;
    if (widgetDraft?.kind === "data") {
      if (invalidRadial(widgetDraft.sourceKind, visualization, widgetDraft.measure)) { setError(radialWarning); return; }
      setDraft({ visualization, dimension: visualization === "metric" ? "" : widgetDraft.dimension || dimensions[0] || "" });
      return;
    }
    if (active?.kind !== "data" || active.visualization === visualization) return;
    const source = active.source;
    if (invalidRadial(source.kind, visualization, active.measure)) { setError(radialWarning); return; }
    const dimension = active.dimension || (source.kind === "meta" ? levelDimension[source.level] : doc.datasets.find(item => item.id === source.datasetId)?.fields.find(field => field.type === "text")?.id);
    if (visualization !== "metric" && !dimension) { setError("Este visual precisa de uma dimensão de texto. Edite os dados e escolha um conjunto com categorias."); return; }
    const rect = canvasRects[active.id];
    const widget: DataWidget = { ...active, visualization, position: active.position ?? { x: rect.x, y: rect.y, height: rect.height } };
    if (visualization !== "table") delete widget.measures;
    if (visualization === "metric") delete widget.dimension;
    else widget.dimension = dimension;
    void save({ ...doc, widgets: doc.widgets.map(item => item.id === widget.id ? widget : item) });
  };
  const visualKind = widgetDraft?.kind === "data" ? widgetDraft.visualization : !widgetDraft && active?.kind === "data" ? active.visualization : undefined;
  return <section className="builder" onKeyDown={historyKeyDown} data-focus={focus} data-mode={admin ? "edit" : "read"} aria-label="Painel configurável">
    <div className="builder-heading"><div><p className="builder-overline">YORUS / STUDIO{clientName && <span className="builder-client-name">{clientName}</span>}</p><h2>Seu painel, do seu jeito</h2><p>{admin ? "Escolha um visual, conecte os campos e organize a leitura." : "Uma visão dos dados e indicadores deste cliente."}</p></div>
      <div className="builder-heading-actions"><button type="button" className="builder-focus-button" aria-label={focus ? "Recolher painel" : "Expandir painel"} aria-pressed={focus} onClick={() => setFocus(!focus)}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={focus ? "M2 7h5V2m11 5h-5V2M2 13h5v5m11-5h-5v5" : "M7 2H2v5m11-5h5v5M2 13v5h5m11-5v5h-5"} /></svg>{focus ? "Recolher" : "Expandir"}</button>{canAdmin ? <div className="builder-mode-switch" role="group" aria-label="Modo do painel">
        <button type="button" aria-label="Visualizar painel" aria-pressed={!editing} disabled={busy} onClick={() => { cancelPointer(); setEditing(false); }}>Visualizar</button>
        <button type="button" aria-label="Editar painel" aria-pressed={editing} disabled={busy} onClick={() => setEditing(true)}>Editar painel</button>
      </div> : <span className="builder-mode">Somente leitura</span>}</div>
    </div>
    {doc && <div className="builder-workbench-toolbar">
      <div className="builder-workbench-actions">{admin && <>
        <button type="button" aria-pressed={showSources} onClick={() => setPanel(showSources ? null : "sources")}>Visuais e fontes</button>
        <button type="button" aria-pressed={showInspector} disabled={!active && !widgetDraft && !datasetDraft} onClick={() => setPanel(showInspector ? null : "inspector")}>Propriedades</button>
        <div className="builder-history" role="group" aria-label="Histórico de edição">
          <button type="button" aria-label="Desfazer" title="Desfazer (Ctrl/Cmd+Z)" disabled={historyBlocked || !history.past.length} onClick={() => restoreHistory("undo")}>↶ <span>Desfazer</span></button>
          <button type="button" aria-label="Refazer" title="Refazer (Ctrl/Cmd+Shift+Z)" disabled={historyBlocked || !history.future.length} onClick={() => restoreHistory("redo")}>↷ <span>Refazer</span></button>
        </div>
      </>}<span className="builder-hint">{doc.widgets.length} {doc.widgets.length === 1 ? "visual" : "visuais"}</span></div>
      <span className="builder-save-status" role="status">{busy ? "Salvando…" : error ? "Alterações não salvas" : widgetDraft || datasetDraft ? "Edição em andamento · confirme em Salvar" : savedNotice || (admin ? "Layout salvo automaticamente ao mover" : "Modo de leitura")}</span>
    </div>}
    {error && <div className="builder-error" role="alert">{error}</div>}
    {conflict ? <button type="button" onClick={reload}>Recarregar painel</button> : !doc && !loading ? <button type="button" onClick={reload}>Tentar novamente</button> : null}
    {loading ? <p role="status" className="builder-loading">Carregando painel…</p> : doc && <div className="builder-shell" data-panel={showSources ? "sources" : showInspector ? "inspector" : "none"}>
      <aside className="builder-sources" aria-label="Fontes de dados" hidden={!showSources}>
        {admin && <div className="builder-chart-palette"><h4>Criar visual</h4><p>Escolha um formato pronto. Depois ajuste os campos e o tamanho no canvas.</p><VisualGallery mode="add" disabled={busy || conflict} onChoose={addFromPalette} /><button className="builder-text-preset" type="button" disabled={busy || conflict} onClick={() => { setPanel("inspector"); setDatasetDraft(null); setInspectorTab("fields"); setWidgetDraft({ ...initialDraft(), kind: "text" }); setSelected(null); }}><VisualIcon kind="text" />Texto</button></div>}
        <h3>Fontes</h3><p className="builder-hint">Conjuntos manuais têm período e origem próprios. O filtro Meta não altera seus valores.</p>
        <div className="builder-source-list"><div className="builder-source"><strong>Meta Ads</strong><span>{metaConnected ? "Conectado" : "Não conectado"}</span></div>{["GA4", "CRM", "Formulários"].map(name => <div className="builder-source" key={name}><strong>{name}</strong><span>Não conectado</span></div>)}</div>
        <div className="builder-pane-heading"><h4>Conjuntos manuais</h4>{admin && <button type="button" disabled={busy || conflict} onClick={() => editDataset()}>Novo conjunto manual</button>}</div>
        {doc.datasets.length ? <ul className="builder-dataset-list">{doc.datasets.map(dataset => <li key={dataset.id}><strong>{dataset.name}</strong><small>{dataset.sourceLabel} · {dataset.rows.length} linhas</small>{admin && <button type="button" disabled={busy || conflict} onClick={() => editDataset(dataset)}>Editar {dataset.name}</button>}</li>)}</ul> : <p className="builder-hint">Nenhum conjunto manual configurado.</p>}
      </aside>
      <section className="builder-canvas" aria-label="Canvas"><div className="builder-pane-heading"><div><h3>Canvas</h3><p>{admin ? "Selecione o título para editar; clique nas categorias para filtrar" : `${doc.widgets.length} visualizações`}</p></div>{admin && <button className="builder-primary" type="button" disabled={busy || conflict} onClick={() => { setPanel("inspector"); setDatasetDraft(null); setInspectorTab("fields"); setWidgetDraft(initialDraft(doc.datasets[0]?.id)); setSelected(null); setError(""); }}>Adicionar visualização</button>}</div>
        {levelKey && <div className="builder-dates"><label>Início Meta<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>Fim Meta<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label><label className="builder-compare-toggle"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} />Comparar com período anterior</label>{compare && <small>Somente indicadores Meta · intervalo anterior de mesma duração</small>}</div>}
        {selection ? <div className="builder-filter-bar" role="status"><span><strong>Filtro ativo:</strong> {selection.label}</span><small>{selection.kind === "manual" ? `Fonte: ${doc.datasets.find(dataset => dataset.id === selection.datasetId)?.name ?? "Manual"}` : `Meta Ads · ${metaFieldLabels[levelDimension[selection.level]]}`}</small><button type="button" onClick={() => setSelection(null)} aria-label="Limpar filtro">Limpar ×</button></div> : <p className="builder-interaction-hint">Clique em uma categoria do gráfico para filtrar os visuais da mesma fonte.</p>}
        {doc.widgets.length ? <div className="builder-grid" ref={canvasRef}>{visibleWidgets.map(widget => <WidgetCard key={widget.id} widget={admin && widgetDraft?.id === widget.id ? { ...widget, appearance: widgetDraft.appearance } : widget} selection={selection} onFilter={toggleSelection} comparison={compare && widget.kind === "data" && widget.source.kind === "meta" && widget.visualization === "metric" ? { state: previousMeta[widget.source.level], range: comparisonRange } : undefined} rect={canvasRects[widget.id]} selected={admin && selected === widget.id} onSelect={() => { if (admin) { setPanel("inspector"); if (selected !== widget.id || datasetDraft) { setSelected(widget.id); setWidgetDraft(null); setDatasetDraft(null); } } }} onPointerStart={(mode, event) => startPointer(widget.id, mode, event)} onPointerMove={updatePointer} onPointerEnd={endPointer} onPointerCancel={cancelPointer} onKeyboardMove={(mode, event) => keyboardMove(widget.id, mode, event)} dataset={widget.kind === "data" && widget.source.kind === "manual" ? doc.datasets.find(item => item.id === (widget.source as { kind: "manual"; datasetId: string }).datasetId) : undefined} meta={widget.kind === "data" && widget.source.kind === "meta" ? !metaConnected ? { status: "error", error: "Meta Ads não conectado." } : !validMetaDates ? { status: "error", error: "Selecione um período Meta válido de até 92 dias." } : meta[widget.source.level] : undefined} currency={currency} admin={admin} busy={busy || conflict} onEdit={() => { setPanel("inspector"); setSelected(widget.id); setInspectorTab("fields"); setWidgetDraft(makeDraft(widget)); setDatasetDraft(null); }} onDuplicate={() => duplicateWidget(widget)} onRemove={() => void save({ ...doc, widgets: doc.widgets.filter(item => item.id !== widget.id) }, () => setSelected(null))} />)}</div> : <div className="builder-empty"><strong>Canvas vazio</strong><p>{admin ? "Escolha um formato na galeria Criar visual. Os campos abrem à direita para você escolher fonte, categoria e valor. Depois mova e redimensione no canvas." : "A equipe ainda não configurou visualizações para este cliente."}</p></div>}
      </section>
      <aside className="builder-inspector" aria-label="Inspetor" hidden={!showInspector}><div className="builder-inspector-heading"><h3>Propriedades</h3>{active && <button type="button" className="builder-locate" onClick={() => document.getElementById(`builder-widget-${active.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}>Ver visual</button>}<button type="button" aria-label="Fechar propriedades" onClick={() => setPanel(null)}>×</button></div>
        {admin && visualKind && !datasetDraft && <div className="builder-chart-palette"><h4>Tipo do visual</h4><VisualGallery mode="change" value={visualKind} disabled={busy || conflict} onChoose={changeVisual} /><p>{widgetDraft ? "Escolha o formato e os campos. Confirme em Salvar visualização." : "Troque o formato sem perder os campos, a posição ou o tamanho."}</p></div>}
        {admin && datasetDraft ? <form className="builder-form" onSubmit={saveDataset} noValidate><h4>{doc.datasets.some(item => item.id === datasetDraft.id) ? "Editar conjunto" : "Novo conjunto"}</h4><label>Nome do conjunto<input value={datasetDraft.name} onChange={event => updateDataset({ name: event.target.value })} required /></label><label>Fonte do conjunto<input value={datasetDraft.sourceLabel} onChange={event => updateDataset({ sourceLabel: event.target.value })} required /></label><label>Início do período manual<input type="date" value={datasetDraft.periodStart} onChange={event => updateDataset({ periodStart: event.target.value })} required /></label><label>Fim do período manual<input type="date" value={datasetDraft.periodEnd} onChange={event => updateDataset({ periodEnd: event.target.value })} required /></label>
          <fieldset><legend>Campos</legend>{datasetDraft.fields.map(field => <div className="builder-field" key={field.id}><label>{`Campo ${field.label}`}<input value={field.label} onChange={event => updateDataset({ fields: datasetDraft.fields.map(item => item.id === field.id ? { ...item, label: event.target.value } : item) })} /></label><span>{field.type === "number" ? "Número" : "Texto"}</span><button type="button" onClick={() => updateDataset({ fields: datasetDraft.fields.filter(item => item.id !== field.id), rows: datasetDraft.rows.map(row => { const copy = { ...row }; delete copy[field.id]; return copy; }) })}>Remover {field.label}</button></div>)}<label>Nome do campo<input value={fieldLabel} onChange={event => setFieldLabel(event.target.value)} /></label><label>Tipo do campo<select value={fieldType} onChange={event => setFieldType(event.target.value as Field["type"])}><option value="text">Texto</option><option value="number">Número</option></select></label><button type="button" onClick={addField}>Adicionar campo</button></fieldset>
          <fieldset><legend>Linhas</legend>{datasetDraft.rows.map((row, index) => <div className="builder-row-editor" key={index}>{datasetDraft.fields.map(field => <label key={field.id}>{`Linha ${index + 1}: ${field.label}`}<input type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? "any" : undefined} value={row[field.id] ?? ""} onChange={event => updateDataset({ rows: datasetDraft.rows.map((item, i) => i === index ? { ...item, [field.id]: event.target.value === "" ? null : field.type === "number" ? Number(event.target.value) : event.target.value } : item) })} /></label>)}<button type="button" onClick={() => updateDataset({ rows: datasetDraft.rows.filter((_, i) => i !== index) })}>Remover linha {index + 1}</button></div>)}<button type="button" onClick={() => updateDataset({ rows: [...datasetDraft.rows, Object.fromEntries(datasetDraft.fields.map(field => [field.id, null]))] })}>Adicionar linha</button></fieldset><div className="builder-form-actions"><button className="builder-primary" type="submit" disabled={busy || conflict}>Salvar conjunto</button><button type="button" onClick={() => setDatasetDraft(null)}>Cancelar</button></div></form>
        : admin && widgetDraft ? <form className="builder-form" onSubmit={saveWidget} noValidate><h4>{widgetDraft.id ? "Editar visualização" : "Nova visualização"}</h4><div className="builder-inspector-tabs" role="tablist" aria-label="Configuração do visual">{([['fields', 'Campos'], ['appearance', 'Aparência']] as const).map(([tab, label]) => <button key={tab} type="button" role="tab" id={`builder-${clientId}-${tab}-tab`} aria-controls={`builder-${clientId}-${tab}-panel`} aria-selected={inspectorTab === tab} tabIndex={inspectorTab === tab ? 0 : -1} onClick={() => setInspectorTab(tab)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'fields' : event.key === 'End' ? 'appearance' : tab === 'fields' ? 'appearance' : 'fields'; setInspectorTab(next); document.getElementById(`builder-${clientId}-${next}-tab`)?.focus(); } }}>{label}</button>)}</div><div className="builder-field-panel" role="tabpanel" id={`builder-${clientId}-fields-panel`} aria-labelledby={`builder-${clientId}-fields-tab`} hidden={inspectorTab !== 'fields'}><label>Tipo<select value={widgetDraft.kind} onChange={event => setDraft({ kind: event.target.value as Draft["kind"] })}><option value="data">Dados</option><option value="text">Texto</option></select></label><label>Título da visualização<input value={widgetDraft.title} onChange={event => setDraft({ title: event.target.value })} required /></label><label>Largura<select value={widgetDraft.width} onChange={event => setDraft({ width: Number(event.target.value) as Draft["width"] })}>{Array.from({ length: 12 }, (_, i) => i + 1).map(value => <option key={value} value={value}>{value} colunas</option>)}</select></label><label>Observação<textarea value={widgetDraft.note} onChange={event => setDraft({ note: event.target.value })} /></label>
          {widgetDraft.kind === "text" ? <label>Conteúdo<textarea value={widgetDraft.body} onChange={event => setDraft({ body: event.target.value })} /></label> : <><label>Fonte<select value={widgetDraft.sourceKind} onChange={event => { const kind = event.target.value as Draft["sourceKind"]; setDraft({ sourceKind: kind, measure: kind === "meta" ? "spend" : "", measures: kind === "meta" ? ["spend"] : [], format: kind === "meta" ? "currency" : "number", dimension: kind === "meta" ? levelDimension[widgetDraft.level] : "" }); }}><option value="manual">Conjunto manual</option>{metaConnected && <option value="meta">Meta Ads</option>}</select></label>
            {widgetDraft.sourceKind === "manual" ? <label>Conjunto<select value={widgetDraft.datasetId} onChange={event => setDraft({ datasetId: event.target.value, measure: "", dimension: "" })}><option value="">Selecione</option>{doc.datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select></label> : <label>Nível Meta<select value={widgetDraft.level} onChange={event => { const level = event.target.value as Level; setDraft({ level, dimension: levelDimension[level] }); }}><option value="campaign">Campanhas</option><option value="adset">Conjuntos de anúncios</option><option value="ad">Anúncios</option></select></label>}
            <label>Visualização<select value={widgetDraft.visualization} onChange={event => setDraft({ visualization: event.target.value as Draft["visualization"] })}>{VISUAL_PRESETS.map(preset => <option key={preset.kind} value={preset.kind}>{preset.label}</option>)}</select></label>
            {widgetDraft.visualization !== "metric" && <label>Dimensão<select value={widgetDraft.dimension} onChange={event => setDraft({ dimension: event.target.value })}><option value="">Selecione</option>{dimensions.map(value => <option key={value} value={value}>{widgetDraft.sourceKind === "meta" ? metaFieldLabels[value] ?? value : fields.find(field => field.id === value)?.label ?? value}</option>)}</select></label>}
            {widgetDraft.sourceKind === "meta" && widgetDraft.aggregation !== "sum" && <p className="builder-hint">Agregação legada preservada: {widgetDraft.aggregation === "avg" ? "média" : "contagem de linhas"}. Trocar as métricas passa a usar os valores da API.</p>}
            {widgetDraft.sourceKind === "meta" ? <MetaMetricPicker metrics={catalogue} selected={widgetDraft.visualization === "table" ? widgetDraft.measures.length ? widgetDraft.measures : widgetDraft.measure ? [widgetDraft.measure] : [] : widgetDraft.measure ? [widgetDraft.measure] : []} multiple={widgetDraft.visualization === "table"} loading={needsCatalog && validMetaDates && catalogState.key !== catalogKey} error={catalogState.key === catalogKey ? catalogState.error : undefined} disabled={busy || conflict} onView={() => document.getElementById(`builder-widget-${widgetDraft.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })} autoApply={automaticMetrics} statusMessage={metricNotice.id === widgetDraft.id ? metricNotice.text : undefined} onChange={chooseMetaMetrics} /> : <label>Medida<select value={widgetDraft.measure} onChange={event => setDraft({ measure: event.target.value })}><option value="">Selecione</option>{availableMeasures.map(value => <option key={value} value={value}>{fields.find(field => field.id === value)?.label ?? value}</option>)}</select></label>}{widgetDraft.sourceKind === "manual" && <label>Agregação<select value={widgetDraft.aggregation} onChange={event => { const aggregation = event.target.value as Draft["aggregation"]; setDraft({ aggregation, measure: aggregation !== "count" && widgetDraft.sourceKind === "manual" && fields.find(field => field.id === widgetDraft.measure)?.type === "text" ? "" : widgetDraft.measure }); }}><option value="sum">Soma</option><option value="avg">Média</option><option value="count">Contagem de linhas</option></select></label>}{widgetDraft.sourceKind === "meta" && widgetDraft.visualization === "table" ? <p className="builder-hint">Formato automático por coluna: moeda, número ou percentual conforme a métrica.</p> : <label>Formato<select value={widgetDraft.format} onChange={event => setDraft({ format: event.target.value as Draft["format"] })}><option value="number">Número</option><option value="currency">Moeda</option>{widgetDraft.sourceKind === "meta" && getMetaMetric(widgetDraft.measure)?.format === "percent" && <option value="percent">Percentual</option>}</select></label>}</>}
          </div><div role="tabpanel" id={`builder-${clientId}-appearance-panel`} aria-labelledby={`builder-${clientId}-appearance-tab`} hidden={inspectorTab !== 'appearance'}><p className="builder-hint">Ajuste e veja o resultado no canvas. Salve quando terminar.</p><AppearanceControls value={widgetDraft.appearance} visualization={widgetDraft.kind === "data" ? widgetDraft.visualization : undefined} disabled={busy || conflict} onChange={appearance => setDraft({ appearance })} /></div><div className="builder-form-actions"><button className="builder-primary" type="submit" disabled={busy || conflict}>Salvar visualização</button><button type="button" onClick={() => setWidgetDraft(null)}>Cancelar</button></div></form>
        : <div className="builder-inspector-empty">{active ? <><h4>{active.title}</h4><p>{active.width} colunas · {active.kind === "text" ? "Texto" : VISUAL_PRESETS.find(preset => preset.kind === active.visualization)?.label}</p>{admin && <div className="builder-size-controls"><p>Selecione um gráfico e ajuste no canvas. Arraste para mover; use o canto para redimensionar.</p><label>Largura no canvas<select value={canvasRects[active.id].width} disabled={busy || conflict} onChange={event => resizeSelection({ width: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 1).map(value => <option value={value} key={value}>{value} colunas</option>)}</select></label><label>Altura no canvas<select value={canvasRects[active.id].height} disabled={busy || conflict} onChange={event => resizeSelection({ height: Number(event.target.value) })}>{Array.from({ length: 23 }, (_, i) => i + 2).map(value => <option value={value} key={value}>{value} linhas</option>)}</select></label><label>Coluna inicial<select value={canvasRects[active.id].x + 1} disabled={busy || conflict} onChange={event => resizeSelection({ x: Number(event.target.value) - 1 })}>{Array.from({ length: 13 - active.width }, (_, i) => i + 1).map(value => <option value={value} key={value}>{value}</option>)}</select></label><label>Linha inicial<input key={`${active.id}-${canvasRects[active.id].y}`} type="number" min={1} max={1200} step={1} defaultValue={canvasRects[active.id].y + 1} disabled={busy || conflict} onBlur={event => { const value = event.target.valueAsNumber; if (Number.isInteger(value) && value >= 1 && value <= 1200 && value - 1 !== canvasRects[active.id].y) resizeSelection({ y: value - 1 }); else event.target.value = String(canvasRects[active.id].y + 1); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label><button type="button" className="builder-primary" onClick={() => { setInspectorTab("fields"); setWidgetDraft(makeDraft(active)); }}>Editar dados e formato</button><button type="button" disabled={busy || conflict} onClick={() => duplicateWidget(active)}>Duplicar visual</button></div>}</> : <p>{admin ? "Clique em um gráfico para selecionar, mover e redimensionar." : "As visualizações são definidas pela equipe."}</p>}</div>}
      </aside>
    </div>}
  </section>;
}
export default function DashboardBuilder(props: { clientId: string; clientName?: string; admin: boolean; currency: string; metaConnected: boolean }) {
  // Keyed workspace discards a previous client's state immediately, even without a parent remount.
  return <BuilderWorkspace key={props.clientId} {...props} />;
}
