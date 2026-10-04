import type { BuilderVisualization, WidgetAppearance } from '../../lib/builder-types';

export default function AppearanceControls({ value, visualization, disabled, onChange }: {
  value: WidgetAppearance;
  visualization?: BuilderVisualization;
  disabled: boolean;
  onChange: (appearance: WidgetAppearance) => void;
}) {
  const patch = (changes: Partial<WidgetAppearance>) => onChange({ ...value, ...changes });
  const hasLegend = visualization && ['column', 'line', 'area', 'pie', 'donut', 'treemap', 'lollipop'].includes(visualization);
  const hasLabels = visualization && ['bar', 'column', 'line', 'area', 'treemap', 'lollipop'].includes(visualization);
  return <div className="builder-appearance">
    <fieldset disabled={disabled}>
      <legend>Cores e texto</legend>
      {visualization && <label className="builder-color-field">Cor do gráfico<input type="color" value={value.color ?? '#ff6a00'} onChange={event => patch({ color: event.target.value })} /></label>}
      <label className="builder-color-field">Cor do fundo<input type="color" value={value.background ?? '#1d1d1b'} onChange={event => patch({ background: event.target.value })} /></label>
      <label className="builder-color-field">Cor do texto<input type="color" value={value.textColor ?? '#f1f0ec'} onChange={event => patch({ textColor: event.target.value })} /></label>
      <label>Tamanho do texto<select value={value.fontSize ?? ''} onChange={event => {
        const next = { ...value };
        if (event.target.value === '') delete next.fontSize;
        else next.fontSize = Number(event.target.value);
        onChange(next);
      }}><option value="">Padrão do visual</option>{Array.from({ length: 21 }, (_, index) => index + 12).map(size => <option key={size} value={size}>{size} px</option>)}</select></label>
      {visualization && <label>Casas decimais<select value={value.decimals ?? ''} onChange={event => {
        const next = { ...value };
        if (event.target.value === '') delete next.decimals;
        else next.decimals = Number(event.target.value);
        onChange(next);
      }}><option value="">Automático pela métrica</option>{[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
      <label className="builder-check"><input type="checkbox" checked={value.showTitle !== false} onChange={event => patch({ showTitle: event.target.checked })} />Mostrar título</label>
      {hasLegend && <label className="builder-check"><input type="checkbox" checked={value.showLegend !== false} onChange={event => patch({ showLegend: event.target.checked })} />Mostrar legenda</label>}
      {hasLabels && <label className="builder-check"><input type="checkbox" checked={value.showLabels ?? ['bar', 'treemap'].includes(visualization!)} onChange={event => patch({ showLabels: event.target.checked })} />Mostrar valores no gráfico</label>}
      <button type="button" onClick={() => onChange({})}>Restaurar aparência padrão</button>
    </fieldset>
  </div>;
}
