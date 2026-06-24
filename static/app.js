const tbody = document.querySelector("#queue-body");
const statusEl = document.querySelector("#save-status");
let draggedRow = null;
let saveTimer = null;
let isSaving = false;
let lastLocalSaveAt = 0;
let pollingEnabled = true;

function setStatus(message) {
  statusEl.textContent = message;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => statusEl.textContent = "", 1800);
}

function rowPayload(row) {
  const payload = {};
  row.querySelectorAll("input, textarea").forEach(input => {
    const field = input.dataset.field;
    if (!field) return;
    if (input.type === "checkbox") {
      payload[field] = input.checked;
    } else {
      payload[field] = input.value;
    }
  });
  return payload;
}

function applyRowClass(row) {
  const isOoo = row.querySelector('[data-field="out_of_office"]').checked;
  const isP1 = row.querySelector('[data-field="on_p1"]').checked;
  row.classList.toggle("ooo-row", isOoo && !isP1);
  row.classList.toggle("p1-row", isP1);
}

async function saveRow(row) {
  applyRowClass(row);
  isSaving = true;
  lastLocalSaveAt = Date.now();

  try {
    const response = await fetch(`/api/rows/${row.dataset.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rowPayload(row))
    });
    if (!response.ok) throw new Error("Save failed");
    setStatus("Saved");
  } finally {
    isSaving = false;
  }
}

function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const debouncedSave = debounce(row => saveRow(row).catch(() => setStatus("Could not save")));

function attachInputListeners(root = document) {
  root.querySelectorAll("#queue-body input, #queue-body textarea").forEach(input => {
    if (input.dataset.listenersAttached === "true") return;
    input.dataset.listenersAttached = "true";
    input.addEventListener("change", event => debouncedSave(event.target.closest("tr")));
    input.addEventListener("input", event => debouncedSave(event.target.closest("tr")));
  });
}

attachInputListeners();

tbody.addEventListener("dragstart", event => {
  const row = event.target.closest("tr");
  if (!row) return;
  draggedRow = row;
  pollingEnabled = false;
  row.classList.add("dragging");
});

tbody.addEventListener("dragend", async () => {
  if (draggedRow) draggedRow.classList.remove("dragging");
  draggedRow = null;
  const orderedIds = [...tbody.querySelectorAll("tr")].map(row => row.dataset.id);

  try {
    isSaving = true;
    lastLocalSaveAt = Date.now();
    const response = await fetch("/api/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_ids: orderedIds })
    });
    setStatus(response.ok ? "Order saved" : "Could not save order");
  } catch {
    setStatus("Could not save order");
  } finally {
    isSaving = false;
    pollingEnabled = true;
  }
});

tbody.addEventListener("dragover", event => {
  event.preventDefault();
  const afterElement = getDragAfterElement(tbody, event.clientY);
  const dragging = document.querySelector(".dragging");
  if (!dragging) return;
  if (afterElement == null) {
    tbody.appendChild(dragging);
  } else {
    tbody.insertBefore(dragging, afterElement);
  }
});

function getDragAfterElement(container, y) {
  const rows = [...container.querySelectorAll("tr:not(.dragging)")];
  return rows.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateInputValue(row, field, value) {
  const input = row.querySelector(`[data-field="${field}"]`);
  if (!input) return;

  // Do not overwrite the field someone is typing in right now.
  if (document.activeElement === input) return;

  if (input.type === "checkbox") {
    input.checked = Boolean(value);
  } else {
    input.value = value ?? "";
  }
}

function applyServerRows(rows) {
  const activeElement = document.activeElement;
  const userIsTyping = activeElement && tbody.contains(activeElement) && ["INPUT", "TEXTAREA"].includes(activeElement.tagName);

  rows.forEach(serverRow => {
    const row = tbody.querySelector(`tr[data-id="${serverRow.id}"]`);
    if (!row) return;

    updateInputValue(row, "out_of_office", serverRow.out_of_office);
    updateInputValue(row, "on_p1", serverRow.on_p1);
    updateInputValue(row, "easy", serverRow.easy);
    updateInputValue(row, "investigation", serverRow.investigation);
    updateInputValue(row, "autoclose", serverRow.autoclose);
    updateInputValue(row, "emea_handovers", serverRow.emea_handovers);
    updateInputValue(row, "jobs_p1", serverRow.jobs_p1);
    applyRowClass(row);
  });

  // Reorder rows to match the server order. Avoid moving rows while the user is typing.
  if (!userIsTyping) {
    rows.forEach(serverRow => {
      const row = tbody.querySelector(`tr[data-id="${serverRow.id}"]`);
      if (row) tbody.appendChild(row);
    });
  }
}

async function refreshRowsFromServer() {
  if (!pollingEnabled || draggedRow || isSaving) return;

  // Give the local save request a moment before accepting remote updates.
  if (Date.now() - lastLocalSaveAt < 1000) return;

  try {
    const response = await fetch("/api/rows", { cache: "no-store" });
    if (!response.ok) throw new Error("Refresh failed");
    const rows = await response.json();
    applyServerRows(rows);
  } catch (error) {
    console.warn("Could not refresh rows", error);
  }
}

// Auto-refresh everyone currently viewing the page.
// 3000 ms keeps the app simple and works well on Render free tier.
setInterval(refreshRowsFromServer, 3000);