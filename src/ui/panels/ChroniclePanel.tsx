import { dayOf } from '../../sim/index.ts';
import type { World } from '../../sim/index.ts';

export function ChroniclePanel({ w }: { w: World }) {
  return (
    <div class="chronicle">
      <ol>
        {[...w.chronicle].reverse().map((c, i) => (
          <li key={i} class={`t-${c.tone}`}>
            <span class="muted small">dia {dayOf(c.tick)}</span> {c.text}
          </li>
        ))}
      </ol>
      <p class="muted small">Arte: KayKit, de Kay Lousberg (www.kaylousberg.com), CC0.</p>
    </div>
  );
}
