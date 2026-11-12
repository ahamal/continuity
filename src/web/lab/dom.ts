type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

function fill(el: Element, props: Props | null, children: Child[]): void {
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name.startsWith('on') && typeof value === 'function') {
      el.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
    } else if (name === 'class') {
      el.setAttribute('class', String(value));
    } else {
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

/** Replace everything inside an element. */
export function put(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  fill(el, null, children);
}

/** Build an HTML element. */
export function h(tag: string, props: Props | null = null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  fill(el, props, children);
  return el;
}

/** Build an SVG element. */
export function s(tag: string, props: Props | null = null, ...children: Child[]): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  fill(el, props, children);
  return el;
}

/** Join class names, skipping the ones that are switched off. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
