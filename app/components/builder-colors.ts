const colors = ['#ff984f', '#79cbbb', '#a49bea', '#ed8299', '#d6c66b', '#72aee6', '#ffb45b'];
function hash(label: string) {
  let value = 0;
  for (const character of label) value = (Math.imul(value, 31) + character.codePointAt(0)!) >>> 0;
  return value;
}

export function categoryPalette(labels: string[], accent?: string) {
  const assigned = new Map<string, number>();
  const used = new Set<number>();
  for (const label of [...new Set(labels)].sort()) {
    let index = hash(label) % colors.length;
    while (used.has(index) && used.size < colors.length) index = (index + 1) % colors.length;
    if (used.size >= colors.length) index = colors.length + assigned.size;
    assigned.set(label, index); used.add(index);
  }
  return (label: string) => {
    const index = assigned.get(label) ?? 0;
    if (accent) return index === 0 ? accent : `color-mix(in srgb, ${accent} ${35 + (index * 17) % 60}%, ${index % 2 ? '#ffffff' : '#161616'})`;
    return colors[index] ?? `hsl(${(hash(label) + index * 137.5) % 360} 60% 67%)`;
  };
}
