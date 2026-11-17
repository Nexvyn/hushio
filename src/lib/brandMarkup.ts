export function brandMarkup(svg: string, instance: string): string {
  let index = 0;
  const prefix = instance.replace(/[^a-zA-Z0-9_-]/g, "");
  return svg.replace(/paint\d+_(?:radial|linear)_4977_8623/g, id => `${prefix}-${id}`)
    .replace(/<path\b[^>]*\/>/g, path => {
      const current = index++;
      const eye = current >= 10 ? path.replace("<path", '<path class="app-logo-eye"') : path;
      const before = current === 1 ? '<g class="app-logo-band">' : current === 3 ? '<g class="app-logo-ear app-logo-ear-left">' : current === 6 ? '<g class="app-logo-ear app-logo-ear-right">' : current === 9 ? '<g class="app-logo-face">' : "";
      const after = [2, 5, 8, 11].includes(current) ? "</g>" : "";
      return before + eye + after;
    });
}
