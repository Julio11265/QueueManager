const tbody = document.querySelector("#queue-body");
const statusEl = document.querySelector("#save-status");
let draggedRow = null;
let saveTimer = null;

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
  const response = await fetch(`/api/rows/${row.dataset.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rowPayload(row))
  });
  if (!response.ok) throw new Error("Save failed");
  setStatus("Saved");
}

function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const debouncedSave = debounce(row => saveRow(row).catch(() => setStatus("Could not save")));

document.querySelectorAll("#queue-body input, #queue-body textarea").forEach(input => {
  input.addEventListener("change", event => debouncedSave(event.target.closest("tr")));
  input.addEventListener("input", event => debouncedSave(event.target.closest("tr")));
});

tbody.addEventListener("dragstart", event => {
  const row = event.target.closest("tr");
  if (!row) return;
  draggedRow = row;
  row.classList.add("dragging");
});

tbody.addEventListener("dragend", async () => {
  if (draggedRow) draggedRow.classList.remove("dragging");
  draggedRow = null;
  const orderedIds = [...tbody.querySelectorAll("tr")].map(row => row.dataset.id);
  const response = await fetch("/api/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ordered_ids: orderedIds })
  });
  setStatus(response.ok ? "Order saved" : "Could not save order");
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
