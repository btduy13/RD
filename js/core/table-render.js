/* ==========================================================================
   TABLE RENDER — Cập nhật DOM bảng tăng dần thay vì innerHTML toàn bộ
   ========================================================================== */

function renderTableIncremental(tbody, rows, renderRowHtml, getRowKey, options) {
  if (!tbody) return;
  const opts = options || {};
  const emptyColspan = opts.emptyColspan || 1;
  const emptyMessage = opts.emptyMessage || "Không có dữ liệu";
  const forceFullRender = !!opts.forceFullRender;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${emptyColspan}" style="text-align:center;color:var(--text-muted);padding:30px;">${emptyMessage}</td></tr>`;
    return;
  }

  const existingMap = new Map();
  tbody.querySelectorAll("tr[data-row-key]").forEach((tr) => {
    existingMap.set(tr.dataset.rowKey, tr);
  });

  if (forceFullRender || existingMap.size === 0 || tbody.querySelector("td[colspan]")) {
    tbody.innerHTML = rows.map((row) => {
      const key = String(getRowKey(row));
      const html = renderRowHtml(row);
      if (html.includes("data-row-key=")) return html;
      return html.replace("<tr ", `<tr data-row-key="${escapeHtmlAttr(key)}" `);
    }).join("");
    return;
  }

  const fragment = document.createDocumentFragment();

  rows.forEach((row) => {
    const key = String(getRowKey(row));
    const html = renderRowHtml(row);
    const temp = document.createElement("tbody");
    temp.innerHTML = html;
    const sourceTr = temp.firstElementChild;
    if (!sourceTr) return;

    const existing = existingMap.get(key);
    if (existing) {
      if (existing.innerHTML !== sourceTr.innerHTML) {
        existing.innerHTML = sourceTr.innerHTML;
      }
      existing.className = sourceTr.className;
      if (sourceTr.dataset.type) existing.dataset.type = sourceTr.dataset.type;
      if (sourceTr.dataset.subtype) existing.dataset.subtype = sourceTr.dataset.subtype;
      if (sourceTr.dataset.id) existing.dataset.id = sourceTr.dataset.id;
      fragment.appendChild(existing);
      existingMap.delete(key);
    } else {
      sourceTr.dataset.rowKey = key;
      fragment.appendChild(sourceTr);
    }
  });

  existingMap.forEach((tr) => tr.remove());
  tbody.innerHTML = "";
  tbody.appendChild(fragment);
}

window.renderTableIncremental = renderTableIncremental;
