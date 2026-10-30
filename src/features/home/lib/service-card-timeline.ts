export interface ServiceCardHeight {
  collapsed: number;
  expanded: number;
}

/** Opening a card offsets the next card by exactly the distance scrolled. */
export function serviceCardStarts(heights: readonly ServiceCardHeight[], gap: number, top: number, viewport: number): number[] {
  if (!heights.length) return [];
  const bottoms: number[] = [top + heights[0]!.expanded];
  for (let index = 1; index < heights.length; index++) {
    bottoms[index] = bottoms[index - 1]! + gap + heights[index]!.collapsed;
  }
  let expandedBefore = 0;
  return heights.map((height, index) => {
    if (index === 0) return Number.NEGATIVE_INFINITY;
    const anchor = Math.min(index + 1, heights.length - 1);
    const start = bottoms[anchor]! + expandedBefore - viewport;
    expandedBefore += height.expanded - height.collapsed;
    return start;
  });
}

export function serviceCardState(height: ServiceCardHeight, start: number, scrollY: number) {
  const distance = height.expanded - height.collapsed;
  const opened = Math.max(0, Math.min(distance, scrollY - start));
  const progress = distance > 0 ? opened / distance : 1;
  return {
    height: height.collapsed + opened,
    phase: progress === 0 ? 0 : progress < 0.34 ? 1 : progress < 0.68 ? 2 : 3,
  };
}
