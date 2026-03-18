import {
  ACADEMIC_NON_TEACHING_PERIODS,
  CALENDAR_TYPES,
  MAX_VOTING_DATES,
  calculateSchedule,
  formatDateInput,
  formatDateLong,
  isBusinessDay,
  parseDateInput,
  parseExcludedDates,
  suggestNextVotingDate,
  suggestAcademicYear,
} from "./calculator.js";
import { downloadFilledPdf } from "./pdf-generator.js";

const form = document.querySelector("[data-calendar-form]");
const typeInput = document.querySelector("#calendar-type");
const academicYearInput = document.querySelector("#academic-year");
const calculationModeInput = document.querySelector("#calculation-mode");
const convocationInput = document.querySelector("#convocation-date");
const convocationNative = document.querySelector('[data-native-picker="convocation"]');
const errorBox = document.querySelector("[data-errors]");
const assumptionsBox = document.querySelector("[data-assumptions]");
const outputBody = document.querySelector("[data-output-body]");
const outputPlaceholder = document.querySelector("[data-output-placeholder]");
const calculateButton = document.querySelector("[data-calculate]");
const downloadButton = document.querySelector("[data-download]");
const statusPill = document.querySelector("[data-status-pill]");
const votingList = document.querySelector("[data-voting-list]");
const excludedList = document.querySelector("[data-excluded-list]");
const addVotingButton = document.querySelector("[data-add-voting]");
const addSingleButton = document.querySelector("[data-add-single]");
const addRangeButton = document.querySelector("[data-add-range]");
const votingHelp = document.querySelector("[data-voting-help]");

let currentSchedule = null;
let hasCalculated = false;
let votingEntries = [];
let excludedEntries = [];
let votingCounter = 0;
let excludedCounter = 0;

function nextBusinessDay(fromDate) {
  const candidate = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 12, 0, 0, 0);
  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

function formatMaskedDate(rawValue) {
  const digits = String(rawValue).replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function toIso(value) {
  const parsed = parseDateInput(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
}

function syncTextAndNative(textInput, nativeInput, force = false) {
  textInput.value = formatMaskedDate(textInput.value);
  const iso = toIso(textInput.value);
  if (iso) {
    nativeInput.value = iso;
  } else if (force) {
    nativeInput.value = "";
  }
}

function openPicker(nativeInput) {
  if (typeof nativeInput.showPicker === "function") {
    nativeInput.showPicker();
    return;
  }
  nativeInput.click();
}

function createVotingEntry(value = "") {
  votingCounter += 1;
  return {
    id: String(votingCounter),
    value,
  };
}

function createExcludedEntry(kind, start = "", end = "") {
  excludedCounter += 1;
  return {
    id: String(excludedCounter),
    kind,
    start,
    end,
  };
}

function isDepartmentType() {
  return typeInput.value === "department";
}

function getVotingLimit() {
  return isDepartmentType() ? 1 : MAX_VOTING_DATES;
}

function syncVotingHelp() {
  if (!votingHelp) {
    return;
  }

  if (isDepartmentType()) {
    votingHelp.textContent = "Este calendario usa una única jornada de votación.";
    return;
  }

  votingHelp.textContent = "Puedes introducir entre 1 y 5 jornadas de votación. Se rellenarán juntas en una sola casilla del PDF o en la plantilla ampliada cuando haya varias fechas.";
}

function syncDepartmentFields() {
  syncVotingHelp();
  syncVotingLimit();
}

function setStatus(text, state) {
  statusPill.textContent = text;
  statusPill.dataset.state = state;
}

function showOutputPlaceholder(text) {
  outputBody.hidden = true;
  outputBody.innerHTML = "";
  outputPlaceholder.hidden = false;
  outputPlaceholder.textContent = text;
}

function clearMessages() {
  errorBox.hidden = true;
  errorBox.innerHTML = "";
  assumptionsBox.hidden = true;
  assumptionsBox.innerHTML = "";
}

function invalidateComputedState() {
  const dirty = hasCalculated || !errorBox.hidden || !assumptionsBox.hidden || !outputBody.hidden;
  hasCalculated = false;
  currentSchedule = null;
  clearMessages();
  syncDepartmentFields();
  showOutputPlaceholder(
    dirty
      ? "Has cambiado los datos. Pulsa Calcular para obtener un nuevo calendario."
      : "Completa los datos y pulsa Calcular.",
  );
  setStatus(dirty ? "Pendiente de recalcular" : "Sin calcular", dirty ? "dirty" : "idle");
  downloadButton.disabled = true;
}

function syncVotingLimit() {
  const limit = getVotingLimit();
  const limitReached = votingEntries.length >= limit;
  addVotingButton.disabled = limitReached;
  addVotingButton.textContent = limitReached
    ? `Máximo ${limit} votación${limit === 1 ? "" : "es"}`
    : "Añadir fecha de votación";
}

function renderVotingEntries() {
  syncVotingLimit();

  if (votingEntries.length === 0) {
    votingList.innerHTML = `
      <div class="empty-builder">
        No hay fechas de votación añadidas. Pulsa el botón para incorporar al menos una.
      </div>
    `;
    return;
  }

  votingList.innerHTML = votingEntries.map((entry, index) => `
    <div class="range-item" data-voting-row="${entry.id}">
      <div class="range-header">
        <strong>Jornada de votación ${index + 1}</strong>
        <button type="button" class="remove-chip" data-remove-voting="${entry.id}">Eliminar</button>
      </div>
      <div class="mini-date-control">
        <label>Fecha</label>
        <div class="date-control compact">
          <input type="text" value="${entry.value}" data-voting-id="${entry.id}" placeholder="dd/mm/aaaa" inputmode="numeric" autocomplete="off">
          <button type="button" class="picker-trigger compact" data-voting-open-picker="${entry.id}">Calendario</button>
          <input type="date" class="native-picker" data-voting-native="${entry.id}" tabindex="-1" aria-hidden="true" value="${toIso(entry.value)}">
        </div>
      </div>
    </div>
  `).join("");
}

function renderExcludedEntries() {
  if (excludedEntries.length === 0) {
    excludedList.innerHTML = `
      <div class="empty-builder">
        No hay días inhábiles adicionales marcados. Puedes añadir fechas sueltas o rangos completos.
      </div>
    `;
    return;
  }

  excludedList.innerHTML = excludedEntries.map((entry) => {
    const label = entry.kind === "single" ? "Fecha adicional" : "Rango inhábil";
    const endField = entry.kind === "range"
      ? `
        <div class="mini-date-control">
          <label>Hasta</label>
          <div class="date-control compact">
            <input type="text" value="${entry.end}" data-entry-id="${entry.id}" data-entry-field="end" placeholder="dd/mm/aaaa" inputmode="numeric" autocomplete="off">
            <button type="button" class="picker-trigger compact" data-entry-open-picker="${entry.id}:end">Calendario</button>
            <input type="date" class="native-picker" data-entry-native="${entry.id}:end" tabindex="-1" aria-hidden="true" value="${toIso(entry.end)}">
          </div>
        </div>
      `
      : "";

    return `
      <div class="range-item" data-entry-row="${entry.id}">
        <div class="range-header">
          <strong>${label}</strong>
          <button type="button" class="remove-chip" data-remove-entry="${entry.id}">Eliminar</button>
        </div>
        <div class="range-fields ${entry.kind === "range" ? "double" : "single"}">
          <div class="mini-date-control">
            <label>${entry.kind === "range" ? "Desde" : "Fecha"}</label>
            <div class="date-control compact">
              <input type="text" value="${entry.start}" data-entry-id="${entry.id}" data-entry-field="start" placeholder="dd/mm/aaaa" inputmode="numeric" autocomplete="off">
              <button type="button" class="picker-trigger compact" data-entry-open-picker="${entry.id}:start">Calendario</button>
              <input type="date" class="native-picker" data-entry-native="${entry.id}:start" tabindex="-1" aria-hidden="true" value="${toIso(entry.start)}">
            </div>
          </div>
          ${endField}
        </div>
      </div>
    `;
  }).join("");
}

function buildExcludedDatesInput() {
  return excludedEntries.map((entry) => ({
    kind: entry.kind,
    start: entry.start,
    end: entry.end,
  }));
}

function resolveAcademicYear(entries = votingEntries) {
  const typedAcademicYear = academicYearInput.value.trim();
  if (typedAcademicYear) {
    return typedAcademicYear;
  }

  const latestVotingDate = [...entries]
    .map((entry) => parseDateInput(entry.value))
    .filter(Boolean)
    .at(-1);
  const convocationDate = parseDateInput(convocationInput.value);
  const fallbackDate = latestVotingDate ?? convocationDate ?? nextBusinessDay(new Date());
  return suggestAcademicYear(fallbackDate);
}

function buildDisabledDates(entries = votingEntries) {
  const excludedDates = parseExcludedDates(buildExcludedDatesInput());
  const academicYear = resolveAcademicYear(entries);
  const academicRanges = ACADEMIC_NON_TEACHING_PERIODS[academicYear] ?? [];
  const academicDates = parseExcludedDates(academicRanges);
  return new Set([...excludedDates.set, ...academicDates.set]);
}

function getSuggestedVotingValue(entries = votingEntries) {
  const suggestion = suggestNextVotingDate({
    type: typeInput.value,
    convocationDate: convocationInput.value,
    electionDatesInput: entries.map((entry) => entry.value),
    academicYear: academicYearInput.value,
    calculationMode: calculationModeInput.value,
    excludedDatesInput: buildExcludedDatesInput(),
  });

  return suggestion ? formatDateInput(suggestion) : "";
}

function normalizeVotingEntriesForCurrentType({ enforceBusinessDays = true, forceFirstSuggested = false } = {}) {
  let changed = false;
  const limit = getVotingLimit();

  if (votingEntries.length > limit) {
    votingEntries = votingEntries.slice(0, limit);
    changed = true;
  }

  if (votingEntries.length === 0) {
    votingEntries = [createVotingEntry(getSuggestedVotingValue([]))];
    return true;
  }

  const disabledDates = buildDisabledDates(votingEntries);
  const normalizedEntries = [];

  for (const [index, entry] of votingEntries.entries()) {
    const suggestedValue = getSuggestedVotingValue(normalizedEntries);
    const suggestedDate = parseDateInput(suggestedValue);
    const currentDate = parseDateInput(entry.value);
    const needsBusinessDayFix = enforceBusinessDays && currentDate && !isBusinessDay(currentDate, disabledDates);
    const needsMinimumFix = suggestedDate && (!currentDate || currentDate < suggestedDate);
    const needsModeRealign = forceFirstSuggested && index === 0 && !!suggestedDate;
    const nextValue = needsBusinessDayFix || needsMinimumFix || needsModeRealign ? suggestedValue : entry.value;

    if (nextValue !== entry.value) {
      changed = true;
    }

    normalizedEntries.push({ ...entry, value: nextValue });
  }

  votingEntries = normalizedEntries;

  return changed;
}

function seedFormValues() {
  const baseDate = nextBusinessDay(new Date());

  votingCounter = 0;
  excludedCounter = 0;
  typeInput.value = "group";
  calculationModeInput.value = "maximum";
  convocationInput.value = formatDateInput(baseDate);
  convocationNative.value = toIso(convocationInput.value);
  academicYearInput.value = suggestAcademicYear(baseDate);
  excludedEntries = [];
  const firstVotingValue = getSuggestedVotingValue([]);
  const firstVotingDate = parseDateInput(firstVotingValue);
  academicYearInput.value = suggestAcademicYear(firstVotingDate ?? baseDate);
  votingEntries = [createVotingEntry(firstVotingValue)];
  syncDepartmentFields();
  renderVotingEntries();
  renderExcludedEntries();
}

function renderErrors(schedule) {
  errorBox.innerHTML = "";

  if (!schedule || schedule.valid) {
    errorBox.hidden = true;
    return;
  }

  const list = document.createElement("ul");
  for (const error of schedule.errors ?? ["No se ha podido calcular el calendario."]) {
    const item = document.createElement("li");
    item.textContent = error;
    list.appendChild(item);
  }

  errorBox.appendChild(list);
  errorBox.hidden = false;
}

function renderAssumptions(schedule) {
  assumptionsBox.innerHTML = "";

  if (!schedule?.valid) {
    assumptionsBox.hidden = true;
    return;
  }

  const list = document.createElement("ul");
  for (const assumption of schedule.assumptions) {
    const item = document.createElement("li");
    item.textContent = assumption;
    list.appendChild(item);
  }

  assumptionsBox.appendChild(list);
  assumptionsBox.hidden = false;
}

function groupEvents(events) {
  const grouped = [];
  for (const event of events) {
    const last = grouped.at(-1);
    if (last && last.category === event.category) {
      last.events.push(event);
      continue;
    }
    grouped.push({ category: event.category, events: [event] });
  }
  return grouped;
}

function renderSingleDateToken(date, meta) {
  return `
    <div class="date-token">
      <span class="date-token-value">${formatDateInput(date)}</span>
      <span class="date-token-meta">${meta}</span>
    </div>
  `;
}

function renderLinkedRangeEntries(event) {
  return `
    <div class="summary-chip">${event.webValue}</div>
    <div class="multi-date-grid">
      ${event.entries.map((entry) => `
        <div class="date-pill">
          <strong>${formatDateInput(entry.startDate)} - ${formatDateInput(entry.endDate)}</strong>
          <span class="date-pill-meta">${entry.referenceLabel}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderLinkedSingleEntries(event) {
  return `
    <div class="summary-chip">${event.webValue}</div>
    <div class="multi-date-grid">
      ${event.entries.map((entry) => `
        <div class="date-pill">
          <strong>${formatDateInput(entry.date)}</strong>
          <span class="date-pill-meta">${entry.referenceLabel}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderEventDate(event) {
  if (event.id === "unitary_act" && Array.isArray(event.dates) && event.dates.length > 1) {
    return `
      <div class="summary-chip">${event.webValue}</div>
      <div class="multi-date-grid">
        ${event.dates.map((date) => `
          <div class="date-pill">
            <strong>${formatDateInput(date)}</strong>
            <span class="date-pill-meta">${formatDateLong(date)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (event.kind === "multi-range") {
    return renderLinkedRangeEntries(event);
  }

  if (event.kind === "multi-single") {
    return renderLinkedSingleEntries(event);
  }

  if (event.kind === "range" && !event.collapsed) {
    return `
      <div class="date-range-visual">
        ${renderSingleDateToken(event.startDate, "Inicio")}
        <span class="range-separator">hasta</span>
        ${renderSingleDateToken(event.endDate, "Fin")}
      </div>
      <p class="event-date-caption">${event.webValue}</p>
    `;
  }

  return renderSingleDateToken(event.startDate, formatDateLong(event.startDate));
}

function renderEvents(schedule) {
  outputBody.innerHTML = groupEvents(schedule.events).map((group) => `
    <section class="phase-section">
      <div class="phase-heading">
        <span>${group.category}</span>
      </div>
      <div class="phase-grid">
        ${group.events.map((event) => `
          <article class="event-card ${event.id === "unitary_act" ? "event-card-hero" : ""}">
            <div class="event-card-top">
              <div>
                <p class="event-kicker">${group.category}</p>
                <h3>${event.label}</h3>
              </div>
              <div class="event-date-shell">
                ${renderEventDate(event)}
              </div>
            </div>
            ${event.id === "unitary_act"
              ? `<ul class="unitary-list">${event.items.map((item) => `<li>${item}</li>`).join("")}</ul>`
              : `<p class="event-reference">${event.reference}</p>`}
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  outputPlaceholder.hidden = true;
  outputBody.hidden = false;
}

function collectFormState() {
  return {
    type: typeInput.value,
    convocationDate: convocationInput.value,
    electionDatesInput: votingEntries.map((entry) => entry.value),
    academicYear: academicYearInput.value,
    calculationMode: calculationModeInput.value,
    excludedDatesInput: buildExcludedDatesInput(),
  };
}

function performCalculation() {
  const schedule = calculateSchedule(collectFormState());
  hasCalculated = true;
  currentSchedule = schedule.valid ? schedule : null;

  renderErrors(schedule);
  renderAssumptions(schedule);

  if (!schedule.valid) {
    showOutputPlaceholder("Corrige los datos y pulsa Calcular de nuevo.");
    setStatus("Revisar datos", "error");
    downloadButton.disabled = true;
    return;
  }

  renderEvents(schedule);
  setStatus(`${CALENDAR_TYPES[schedule.type].label} · ${schedule.academicYear}`, "success");
  downloadButton.disabled = false;
}

function bindStaticDateControl(textInput, nativeInput, pickerButtonSelector) {
  const pickerButton = document.querySelector(pickerButtonSelector);

  textInput.addEventListener("input", () => {
    textInput.value = formatMaskedDate(textInput.value);
    invalidateComputedState();
  });

  textInput.addEventListener("blur", () => {
    syncTextAndNative(textInput, nativeInput, true);
    invalidateComputedState();
  });

  nativeInput.addEventListener("change", () => {
    const parsed = parseDateInput(nativeInput.value);
    textInput.value = parsed ? formatDateInput(parsed) : "";
    invalidateComputedState();
  });

  pickerButton.addEventListener("click", () => openPicker(nativeInput));
}

bindStaticDateControl(convocationInput, convocationNative, '[data-picker-button="convocation"]');

addVotingButton.addEventListener("click", () => {
  if (votingEntries.length >= getVotingLimit()) {
    return;
  }

  votingEntries.push(createVotingEntry(getSuggestedVotingValue()));
  renderVotingEntries();
  invalidateComputedState();
});

addSingleButton.addEventListener("click", () => {
  excludedEntries.push(createExcludedEntry("single"));
  if (normalizeVotingEntriesForCurrentType()) {
    renderVotingEntries();
  }
  renderExcludedEntries();
  invalidateComputedState();
});

addRangeButton.addEventListener("click", () => {
  excludedEntries.push(createExcludedEntry("range"));
  if (normalizeVotingEntriesForCurrentType()) {
    renderVotingEntries();
  }
  renderExcludedEntries();
  invalidateComputedState();
});

votingList.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.votingId) {
    return;
  }

  input.value = formatMaskedDate(input.value);
  const entry = votingEntries.find((item) => item.id === input.dataset.votingId);
  if (entry) {
    entry.value = input.value;
  }
  invalidateComputedState();
});

votingList.addEventListener("blur", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.votingId) {
    return;
  }

  const nativeInput = votingList.querySelector(`[data-voting-native="${input.dataset.votingId}"]`);
  if (nativeInput instanceof HTMLInputElement) {
    syncTextAndNative(input, nativeInput, true);
  }
  const entry = votingEntries.find((item) => item.id === input.dataset.votingId);
  if (entry) {
    entry.value = input.value;
  }
  invalidateComputedState();
}, true);

votingList.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.votingNative) {
    return;
  }

  const entry = votingEntries.find((item) => item.id === input.dataset.votingNative);
  const textInput = votingList.querySelector(`[data-voting-id="${input.dataset.votingNative}"]`);
  const parsed = parseDateInput(input.value);

  if (entry && textInput instanceof HTMLInputElement) {
    entry.value = parsed ? formatDateInput(parsed) : "";
    textInput.value = entry.value;
  }
  invalidateComputedState();
});

votingList.addEventListener("click", (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  if (button.dataset.removeVoting) {
    votingEntries = votingEntries.filter((entry) => entry.id !== button.dataset.removeVoting);
    renderVotingEntries();
    invalidateComputedState();
    return;
  }

  if (button.dataset.votingOpenPicker) {
    const nativeInput = votingList.querySelector(`[data-voting-native="${button.dataset.votingOpenPicker}"]`);
    if (nativeInput instanceof HTMLInputElement) {
      openPicker(nativeInput);
    }
  }
});

excludedList.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.entryId || !input.dataset.entryField) {
    return;
  }

  input.value = formatMaskedDate(input.value);
  const entry = excludedEntries.find((item) => item.id === input.dataset.entryId);
  if (entry) {
    entry[input.dataset.entryField] = input.value;
  }
  invalidateComputedState();
});

excludedList.addEventListener("blur", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.entryId || !input.dataset.entryField) {
    return;
  }

  const nativeInput = excludedList.querySelector(`[data-entry-native="${input.dataset.entryId}:${input.dataset.entryField}"]`);
  if (nativeInput instanceof HTMLInputElement) {
    syncTextAndNative(input, nativeInput, true);
  }
  const entry = excludedEntries.find((item) => item.id === input.dataset.entryId);
  if (entry) {
    entry[input.dataset.entryField] = input.value;
  }
  if (normalizeVotingEntriesForCurrentType()) {
    renderVotingEntries();
  }
  invalidateComputedState();
}, true);

excludedList.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.entryNative) {
    return;
  }

  const [entryId, field] = input.dataset.entryNative.split(":");
  const entry = excludedEntries.find((item) => item.id === entryId);
  const textInput = excludedList.querySelector(`[data-entry-id="${entryId}"][data-entry-field="${field}"]`);
  const parsed = parseDateInput(input.value);

  if (entry && textInput instanceof HTMLInputElement) {
    entry[field] = parsed ? formatDateInput(parsed) : "";
    textInput.value = entry[field];
  }
  if (normalizeVotingEntriesForCurrentType()) {
    renderVotingEntries();
  }
  invalidateComputedState();
});

excludedList.addEventListener("click", (event) => {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  if (button.dataset.removeEntry) {
    excludedEntries = excludedEntries.filter((entry) => entry.id !== button.dataset.removeEntry);
    if (normalizeVotingEntriesForCurrentType()) {
      renderVotingEntries();
    }
    renderExcludedEntries();
    invalidateComputedState();
    return;
  }

  if (button.dataset.entryOpenPicker) {
    const nativeInput = excludedList.querySelector(`[data-entry-native="${button.dataset.entryOpenPicker}"]`);
    if (nativeInput instanceof HTMLInputElement) {
      openPicker(nativeInput);
    }
  }
});

typeInput.addEventListener("change", () => {
  if (normalizeVotingEntriesForCurrentType()) {
    renderVotingEntries();
  }
  syncDepartmentFields();
  invalidateComputedState();
});
academicYearInput.addEventListener("input", invalidateComputedState);
calculationModeInput.addEventListener("change", () => {
  if (normalizeVotingEntriesForCurrentType({ forceFirstSuggested: true })) {
    renderVotingEntries();
  }
  invalidateComputedState();
});
calculateButton.addEventListener("click", performCalculation);

downloadButton.addEventListener("click", async () => {
  if (!currentSchedule?.valid) {
    return;
  }

  const initialText = downloadButton.textContent;
  downloadButton.disabled = true;
  downloadButton.textContent = "Preparando PDF...";

  try {
    await downloadFilledPdf(currentSchedule);
  } catch (error) {
    errorBox.hidden = false;
    errorBox.innerHTML = "<ul><li>No se ha podido generar el PDF. Abre la herramienta por HTTP o HTTPS para que el navegador pueda cargar la plantilla y la tipografía.</li></ul>";
    console.error(error);
  } finally {
    downloadButton.disabled = !currentSchedule?.valid;
    downloadButton.textContent = initialText;
  }
});

form.addEventListener("reset", () => {
  requestAnimationFrame(() => {
    seedFormValues();
    invalidateComputedState();
  });
});

seedFormValues();
syncDepartmentFields();
invalidateComputedState();

