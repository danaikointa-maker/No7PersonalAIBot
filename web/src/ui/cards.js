// On-screen result cards (ESP32 principle: every tool result has a visual card).
export function renderCard(el, name, data) {
  const card = document.createElement('div');
  card.className = 'card';
  if (data.tone === 'warn') card.style.borderColor = '#fbbf24';

  if (data.title) {
    const h = document.createElement('h4');
    h.textContent = data.title;
    card.appendChild(h);
  }
  if (data.big) {
    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = data.big;
    card.appendChild(big);
  }
  for (const line of data.lines || []) {
    const p = document.createElement('div');
    p.textContent = line;
    p.style.fontSize = '13px';
    p.style.marginTop = '3px';
    card.appendChild(p);
  }
  if (data.url) {
    const a = document.createElement('a');
    a.href = data.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'เปิดต้นทาง ↗';
    a.style.fontSize = '12px';
    a.style.color = '#22d3ee';
    a.style.display = 'inline-block';
    a.style.marginTop = '8px';
    card.appendChild(a);
  }
  const meta = document.createElement('small');
  meta.textContent = ` tool: ${name}`;
  card.appendChild(meta);

  el.appendChild(card);
}

export function renderError(el, message) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.borderColor = '#f87171';
  card.innerHTML = '<h4>⚠️ เรียกเครื่องมือไม่สำเร็จ</h4>';
  const p = document.createElement('div');
  p.style.fontSize = '13px';
  p.textContent = message;
  card.appendChild(p);
  el.appendChild(card);
}
