"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MetaMetric } from "../../lib/meta-metrics";

export default function MetaMetricPicker({ metrics, selected, multiple, loading, error, disabled, autoApply = false, statusMessage, onView, onChange }: { metrics: MetaMetric[]; selected: string[]; multiple: boolean; loading: boolean; error?: string; disabled: boolean; autoApply?: boolean; statusMessage?: string; onView?: () => void; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 280, maxHeight: 280 });
  const input = useRef<HTMLInputElement>(null), popup = useRef<HTMLDivElement>(null);
  const listId = useId();
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const query = normalize(search).trim();
  const score = (metric: MetaMetric) => metric.id === query ? 0 : metric.id === `actions:${query}` ? 1 : metric.field === "actions" ? 2 : !metric.actionType ? 3 : 4;
  const visible = metrics.filter(metric => normalize(`${metric.label} ${metric.id} ${metric.group}`).includes(query)).sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label, "pt-BR"));
  const blocked = (metric: MetaMetric) => disabled || (multiple && (selected.includes(metric.id) ? selected.length === 1 : selected.length >= 20));
  const place = () => {
    const rect = input.current?.getBoundingClientRect(); if (!rect) return;
    const width = Math.min(Math.max(rect.width, 300), window.innerWidth - 24);
    const above = rect.top - 12, below = window.innerHeight - rect.bottom - 12;
    const useAbove = below < 220 && above > below;
    const maxHeight = Math.max(80, Math.min(300, useAbove ? above - 6 : below - 6));
    const next = { left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: useAbove ? Math.max(12, rect.top - maxHeight - 6) : rect.bottom + 6, width, maxHeight };
    setPosition(current => Object.keys(next).every(key => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node) && event.target !== input.current) setOpen(false); };
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" }); }, [open, active, listId]);
  const choose = (metric: MetaMetric) => {
    if (blocked(metric)) return;
    onChange(multiple ? selected.includes(metric.id) ? selected.filter(id => id !== metric.id) : [...selected, metric.id] : [metric.id]);
    setOpen(false); setSearch(""); setActive(-1);
  };
  return <div className="builder-meta-picker">
    <label>Buscar métricas Meta<input ref={input} type="search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 && visible[active] ? `${listId}-${active}` : undefined} value={search} disabled={disabled} onFocus={() => { input.current?.scrollIntoView?.({ block: "nearest" }); place(); setOpen(true); }} onChange={event => { setSearch(event.target.value); setActive(-1); place(); setOpen(true); }} onKeyDown={event => {
      if (event.key === "Tab") setOpen(false);
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); place(); setOpen(true); setActive(index => Math.max(0, Math.min(visible.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter") { event.preventDefault(); if (open && visible[Math.max(0, active)]) choose(visible[Math.max(0, active)]); }
    }} placeholder="Digite lead, alcance, CPC…" /></label>
    <p className="builder-hint">{autoApply ? "Clique em uma opção para adicionar e atualizar a tabela." : "Clique em uma opção e confirme em Salvar visualização."}</p>
    {open && createPortal(<div ref={popup} id={listId} role="listbox" aria-label="Métricas encontradas" aria-multiselectable={multiple || undefined} className="builder-meta-dropdown" style={position}>
      <div className="builder-meta-result-heading">{visible.length} opções · {multiple ? "clique para adicionar/remover" : "clique para escolher"}</div>
      {visible.map((metric, index) => <button key={metric.id} id={`${listId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={selected.includes(metric.id)} aria-label={`${selected.includes(metric.id) ? "Remover" : "Adicionar"} ${metric.label} (${metric.id})`} disabled={blocked(metric)} data-active={index === active} onMouseDown={event => event.preventDefault()} onClick={() => choose(metric)}>
        <span>{metric.label}<small>{metric.id}</small></span><strong aria-hidden="true">{selected.includes(metric.id) ? "Selecionada" : "Adicionar"}</strong>
      </button>)}
      {!visible.length && <p role="status">Nenhuma métrica corresponde à busca.</p>}
    </div>, document.body)}
    {multiple ? <fieldset className="builder-meta-columns"><legend>Colunas da tabela · {selected.length}/20</legend>
      <div className="builder-meta-selected">{selected.map(id => { const metric = metrics.find(item => item.id === id); return <span key={id} title={id}>{metric?.label ?? id}<button type="button" disabled={disabled || selected.length === 1} aria-label={`Remover coluna ${metric?.label ?? id}`} onClick={() => onChange(selected.filter(value => value !== id))}>Remover</button></span>; })}</div>
      <p className="builder-hint">A primeira coluna é usada ao trocar para outro tipo de gráfico. Até 20 métricas por tabela.</p>
    </fieldset> : <label>Medida<select value={selected[0] ?? ""} disabled={disabled} onChange={event => onChange(event.target.value ? [event.target.value] : [])}><option value="">Selecione</option>{metrics.map(metric => <option value={metric.id} key={metric.id}>{metric.label}</option>)}</select></label>}
    {disabled && autoApply ? <p className="builder-hint" role="status">Atualizando tabela…</p> : statusMessage && <p className="builder-metric-saved" role="status">{statusMessage}</p>}
    {statusMessage && autoApply && onView && <button type="button" onClick={onView}>Ver tabela atualizada</button>}
    {loading && <p className="builder-hint" role="status">Consultando eventos personalizados…</p>}
    {error && <p className="builder-warning" role="status">{error} O catálogo padrão continua disponível.</p>}
    <p className="builder-hint">{metrics.length} campos no catálogo · API v26.0. Nem toda métrica tem dados em toda conta ou período. Ausência de dado não é zero.</p>
  </div>;
}
