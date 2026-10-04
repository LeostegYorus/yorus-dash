import { useState } from "react";
import type { BuilderVisualization } from "../../lib/builder-types";

export const VISUAL_PRESETS: Array<{ kind: BuilderVisualization; label: string; hint: string }> = [
  { kind: "metric", label: "Métrica", hint: "Um valor em destaque" },
  { kind: "bar", label: "Barras", hint: "Comparar categorias na horizontal" },
  { kind: "column", label: "Colunas", hint: "Comparar categorias na vertical" },
  { kind: "line", label: "Linhas", hint: "Conectar valores na ordem das categorias" },
  { kind: "area", label: "Área", hint: "Valores com preenchimento até a linha zero" },
  { kind: "pie", label: "Pizza", hint: "Participação de cada categoria no total" },
  { kind: "donut", label: "Rosca", hint: "Participações com centro aberto" },
  { kind: "table", label: "Tabela", hint: "Categorias e valores detalhados" },
  { kind: "lollipop", label: "Pontos", hint: "Comparar valores por categoria a partir do zero" },
  { kind: "treemap", label: "Treemap", hint: "Comparar participações pela área de cada bloco" },
];

export function VisualIcon({ kind }: { kind: BuilderVisualization | "text" }) {
  return <svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "metric" ? <><rect x="3" y="6" width="26" height="20" rx="2" /><path d="M9 13l3-2v10m-3 0h6m4-9h5l-5 9h5" /></> :
      kind === "bar" ? <><path d="M5 4v24h23" /><path d="M9 7h17v4H9zm0 7h10v4H9zm0 7h14v4H9z" fill="currentColor" fillOpacity=".25" /></> :
      kind === "column" ? <><path d="M4 4v24h24" /><path d="M8 16h4v8H8zm7-9h4v17h-4zm7 5h4v12h-4z" fill="currentColor" fillOpacity=".25" /></> :
      kind === "line" || kind === "area" ? <><path d="M4 4v24h24" />{kind === "area" && <path d="M7 21l6-9 6 5 8-11v18H7z" fill="currentColor" fillOpacity=".25" stroke="none" />}<path d="M7 21l6-9 6 5 8-11" /><circle cx="13" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="17" r="1.5" fill="currentColor" /></> :
      kind === "pie" ? <><path d="M15 4a12 12 0 1 0 13 13H15z" fill="currentColor" fillOpacity=".2" /><path d="M19 3v10h10A12 12 0 0 0 19 3z" fill="currentColor" fillOpacity=".5" /></> :
      kind === "donut" ? <><circle cx="16" cy="16" r="11" /><circle cx="16" cy="16" r="5" /><path d="M16 5v6m5 5h6m-7 4 4 4" /></> :
      kind === "table" ? <><rect x="4" y="5" width="24" height="22" rx="1" /><path d="M4 12h24M4 19h24M12 5v22M21 5v22" /><path d="M5 6h22v5H5z" fill="currentColor" fillOpacity=".25" stroke="none" /></> :
      kind === "treemap" ? <><rect x="3" y="5" width="26" height="23" rx="2" /><path d="M18 5v23m0-12h11M24 16v12" /><path d="M4 6h13v21H4z" fill="currentColor" fillOpacity=".3" /></> :
      kind === "lollipop" ? <><path d="M4 28h25M9 28V17m8 11V8m8 20V13" /><circle cx="9" cy="14" r="3" /><circle cx="17" cy="5" r="3" /><circle cx="25" cy="10" r="3" /></> : <><path d="M6 7h20M16 7v20M11 27h10M6 7v5m20-5v5" /></>}
  </svg>;
}

export function VisualGallery({ mode, value, disabled, onChoose }: { mode: "add" | "change"; value?: BuilderVisualization; disabled: boolean; onChoose: (kind: BuilderVisualization) => void }) {
  const [query, setQuery] = useState("");
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = VISUAL_PRESETS.filter(preset => normalize(`${preset.label} ${preset.hint}`).includes(normalize(query)));
  const groups = mode === "add" ? [
    { title: "Resumo e detalhe", kinds: ['metric', 'table'] },
    { title: "Comparar categorias", kinds: ['bar', 'column', 'lollipop'] },
    { title: "Linhas e área", kinds: ['line', 'area'] },
    { title: "Participação no total", kinds: ['pie', 'donut', 'treemap'] },
  ] : [{ title: '', kinds: VISUAL_PRESETS.map(preset => preset.kind) }];
  return <div className="builder-gallery" role="group" aria-label={mode === "add" ? "Criar visual" : "Tipo do visual"}>
    {mode === 'add' && <label className="builder-gallery-search"><span className="builder-sr-only">Buscar gráfico</span><input type="search" placeholder="Buscar gráfico…" value={query} onChange={event => setQuery(event.target.value)} /></label>}
    {groups.map(group => {
      const presets = matches.filter(preset => group.kinds.includes(preset.kind));
      return presets.length > 0 && <div className="builder-gallery-section" key={group.title}>
        {group.title && <p className="builder-gallery-label">{group.title}</p>}
        <div className="builder-visual-gallery">{presets.map(preset => <button key={preset.kind} type="button" disabled={disabled} title={preset.hint} aria-label={`${mode === "add" ? "Adicionar gráfico de" : "Usar visual de"} ${preset.label.toLowerCase()}`} aria-pressed={mode === "change" ? value === preset.kind : undefined} onClick={() => onChoose(preset.kind)}><VisualIcon kind={preset.kind} /><span>{preset.label}</span>{['treemap', 'lollipop'].includes(preset.kind) && <i className="builder-new-badge">Novo</i>}</button>)}</div>
      </div>;
    })}
    {!matches.length && <p className="builder-hint" role="status">Nenhum gráfico encontrado.</p>}
  </div>;
}
