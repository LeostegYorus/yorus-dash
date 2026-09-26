"use client";
import { useState } from "react";
import type { MetaMetric } from "../../lib/meta-metrics";

export default function MetaMetricPicker({ metrics, selected, multiple, loading, error, disabled, onChange }: { metrics: MetaMetric[]; selected: string[]; multiple: boolean; loading: boolean; error?: string; disabled: boolean; onChange: (ids: string[]) => void }) {
  const [search, setSearch] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = metrics.filter(metric => normalize(`${metric.label} ${metric.id} ${metric.group}`).includes(normalize(search)));
  const options = metrics.filter(metric => visible.includes(metric) || selected.includes(metric.id));
  const groups = [...new Set(options.map(metric => metric.group))];
  return <div className="builder-meta-picker">
    <label>Buscar métricas Meta<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Alcance, CPC, leads, vídeo…" /></label>
    <p className="builder-hint">{metrics.length} campos no catálogo · API v26.0. Disponibilidade depende da conta, objetivo e período. Ausência de dado não é zero.</p>
    {loading && <p className="builder-hint" role="status">Consultando eventos e conversões personalizados…</p>}
    {error && <p className="builder-warning" role="status">{error} O catálogo padrão continua disponível.</p>}
    <label>Medida<select value={selected[0] ?? ""} disabled={disabled} onChange={event => onChange(event.target.value ? [event.target.value, ...(multiple ? selected.filter(id => id !== event.target.value) : [])].slice(0, 20) : [])}>
      <option value="">Selecione</option>
      {groups.map(group => <optgroup key={group} label={group}>{options.filter(metric => metric.group === group).map(metric => <option value={metric.id} key={metric.id}>{metric.label}</option>)}</optgroup>)}
    </select></label>
    {multiple && <fieldset className="builder-meta-columns"><legend>Colunas da tabela · {selected.length}/20</legend>
      <p className="builder-hint">Marque as métricas que quer lado a lado. A primeira é usada ao trocar para outro tipo de gráfico.</p>
      <div className="builder-meta-selected">{selected.map(id => <span key={id} title={id}>{metrics.find(metric => metric.id === id)?.label ?? id}</span>)}</div>
      <div className="builder-meta-options">{visible.map(metric => <label className="builder-meta-option" key={metric.id}>
        <input type="checkbox" aria-label={`${metric.label} (${metric.id})`} checked={selected.includes(metric.id)} disabled={disabled || (!selected.includes(metric.id) && selected.length >= 20)} onChange={event => onChange(event.target.checked ? [...selected, metric.id] : selected.filter(id => id !== metric.id))} />
        <span>{metric.label}<small>{metric.id}</small></span>
      </label>)}</div>
    </fieldset>}
    {!visible.length && <p className="builder-hint" role="status">Nenhuma métrica corresponde à busca.</p>}
    <p className="builder-hint">Campos de identificação e segmentações não são medidas. Taxas, custos e alcance usam os valores calculados pela Meta, sem somar públicos ou tirar média de percentuais.</p>
  </div>;
}
