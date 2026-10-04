type Item = { label: string; value: number | null };
type Tile = { index: number; share: number; x: number; y: number; width: number; height: number };

// Normalize before adding: finite values can overflow when summed directly.
function tiles(data: Item[], width: number, height: number): Tile[] {
  const max = Math.max(...data.map(item => item.value ?? 0), 0);
  if (!max) return [];
  const weighted = data.flatMap((item, index) => item.value !== null && item.value / max > 0 ? [{ index, weight: item.value / max }] : []).sort((a, b) => b.weight - a.weight || a.index - b.index);
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  const result: Tile[] = [];
  function split(items: typeof weighted, x: number, y: number, w: number, h: number) {
    if (items.length === 1) { result.push({ index: items[0].index, share: items[0].weight / total, x, y, width: w, height: h }); return; }
    const sum = items.reduce((acc, item) => acc + item.weight, 0);
    let cut = 1, first = items[0].weight;
    while (cut < items.length - 1 && Math.abs(first + items[cut].weight - sum / 2) < Math.abs(first - sum / 2)) first += items[cut++].weight;
    const ratio = first / sum;
    if (w >= h) { split(items.slice(0, cut), x, y, w * ratio, h); split(items.slice(cut), x + w * ratio, y, w * (1 - ratio), h); }
    else { split(items.slice(0, cut), x, y, w, h * ratio); split(items.slice(cut), x, y + h * ratio, w, h * (1 - ratio)); }
  }
  if (weighted.length) split(weighted, 0, 0, width, height);
  return result.sort((a, b) => a.index - b.index);
}

export default function Treemap({ data, width, height, color, formatValue, fontSize, showLabels, interaction }: {
  data: Item[]; width: number; height: number; color: (label: string) => string;
  formatValue: (value: number) => string; fontSize: number; showLabels: boolean;
  interaction?: (index: number) => React.SVGProps<SVGGElement>;
}) {
  return tiles(data, width, height).map(tile => {
    const item = data[tile.index];
    const capacity = Math.floor((tile.width - 20) / (fontSize * 0.7));
    const label = Array.from(item.label).length > capacity ? `${Array.from(item.label).slice(0, Math.max(0, capacity - 1)).join('')}…` : item.label;
    const value = formatValue(item.value!);
    return <g key={tile.index} {...interaction?.(tile.index)}>
      <rect className="builder-treemap-tile" x={tile.x} y={tile.y} width={tile.width} height={tile.height} fill={color(item.label)} fillOpacity=".24" stroke={color(item.label)} strokeWidth="2">
        <title>{item.label}: {value} · {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(tile.share * 100)}%</title>
      </rect>
      {capacity >= 4 && tile.height >= fontSize * 3 && <text className="builder-treemap-label" x={tile.x + 10} y={tile.y + fontSize + 12}>{label}</text>}
      {showLabels && value.length <= capacity && tile.height >= fontSize * 4.5 && <text className="builder-treemap-value" x={tile.x + 10} y={tile.y + fontSize * 2.6 + 12}>{value}</text>}
    </g>;
  });
}
