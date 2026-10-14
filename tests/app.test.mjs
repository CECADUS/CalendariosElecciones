process.env.TZ = "Europe/Madrid";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { addBusinessDays, formatDateInput, parseDateInput, suggestNextVotingDate } from "../front/calculator.js";

// Minimal DOM fixture: execute the real app and its registered event handlers,
// without a browser dependency or replacing the calendar calculation functions.
class Element {
  constructor(attributes = {}) {
    this.attributes = attributes;
    this.dataset = Object.fromEntries(Object.entries(attributes)
      .filter(([key]) => key.startsWith("data-"))
      .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
    this.value = attributes.value ?? "";
    this.hidden = "hidden" in attributes;
    this.disabled = "disabled" in attributes;
    this.children = [];
    this.listeners = new Map();
  }
  set innerHTML(html) { this.children = parseElements(html); }
  appendChild(child) { this.children.push(child); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type, target = this) {
    for (const listener of this.listeners.get(type) ?? []) listener({ target });
  }
  querySelector(selector) {
    return this.children.find((child) => matches(child, selector))
      ?? this.children.map((child) => child.querySelector(selector)).find(Boolean) ?? null;
  }
}
class Input extends Element {}
class Button extends Element {}

function matches(element, selector) {
  if (selector.startsWith("#")) return element.attributes.id === selector.slice(1);
  const attributes = [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
  assert.ok(attributes.length, `Unsupported selector: ${selector}`);
  return attributes.every(([, key, value]) => value === undefined
    ? key in element.attributes : element.attributes[key] === value);
}

function parseElements(html) {
  return [...html.matchAll(/<(\w+)\b([^>]*)>/g)].map(([, tag, raw]) => {
    const attributes = Object.fromEntries([...raw.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)]
      .map(([, key, value]) => [key, value ?? ""]));
    return new (tag === "input" ? Input : tag === "button" ? Button : Element)(attributes);
  });
}

const html = await readFile(new URL("../front/index.html", import.meta.url), "utf8");
let instance = 0;
async function mount(type, mode = "minimum") {
  const document = new Element();
  document.innerHTML = html;
  document.createElement = () => new Element();
  globalThis.document = document;
  globalThis.HTMLInputElement = Input;
  globalThis.HTMLButtonElement = Button;
  globalThis.requestAnimationFrame = (callback) => callback();
  await import(`../front/app.js?test=${++instance}`);
  const find = (selector) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing element: ${selector}`);
    return element;
  };
  find("#calendar-type").value = type;
  find("#academic-year").value = "2025-2026";
  find("#convocation-date").value = "10/11/2025";
  find('[data-native-picker="convocation"]').value = "2025-11-10";
  find("#calculation-mode").value = mode;
  find("#calculation-mode").dispatch("change");
  return find;
}

function expectedVoting(type, convocationDate) {
  return formatDateInput(suggestNextVotingDate({ type, convocationDate,
    academicYear: "2025-2026", calculationMode: "minimum", excludedDatesInput: [] }));
}

function changeConvocation(find, value, method) {
  if (method === "picker") {
    const [day, month, year] = value.split("/");
    const input = find('[data-native-picker="convocation"]');
    input.value = `${year}-${month}-${day}`;
    input.dispatch("change");
  } else {
    const input = find("#convocation-date");
    input.value = value;
    input.dispatch("input");
    input.dispatch("change");
    input.dispatch("blur");
  }
}

let failures = 0;
async function runTest(name, callback) {
  try { await callback(); console.log(`ok - ${name}`); }
  catch (error) { failures++; console.error(`not ok - ${name}`); console.error(error); }
}

for (const type of ["department", "group", "course"]) {
  for (const method of ["picker", "text"]) {
    await runTest(`${type}: actualiza el minimo desde ${method} y permite editar la votacion`, async () => {
      const find = await mount(type);
      for (const date of ["03/11/2025", "17/11/2025"]) {
        changeConvocation(find, date, method);
        assert.equal(find('[data-voting-id="1"]').value, expectedVoting(type, date));
      }
      const voting = find('[data-voting-id="1"]');
      const manual = formatDateInput(addBusinessDays(parseDateInput(voting.value), 2, new Set()));
      if (method === "picker") {
        const native = find('[data-voting-native="1"]');
        const [day, month, year] = manual.split("/");
        native.value = `${year}-${month}-${day}`;
        find("[data-voting-list]").dispatch("change", native);
      } else {
        voting.value = manual;
        find("[data-voting-list]").dispatch("input", voting);
        find("[data-voting-list]").dispatch("blur", voting);
      }
      find("#convocation-date").dispatch("blur");
      assert.equal(find('[data-voting-id="1"]').value, manual);
      assert.equal(voting.disabled, false);
      assert.ok(!("readonly" in voting.attributes));
      find("[data-calculate]").dispatch("click");
      assert.equal(find("[data-errors]").hidden, true);
      assert.equal(find("[data-download]").disabled, false);
      changeConvocation(find, "03/11/2025", method);
      assert.equal(find('[data-voting-id="1"]').value, expectedVoting(type, "03/11/2025"));
      assert.equal(find("[data-download]").disabled, true);
    });
  }
  await runTest(`${type}: conserva la votacion en maximos al cambiar la convocatoria`, async () => {
    const find = await mount(type, "maximum");
    const before = find('[data-voting-id="1"]').value;
    changeConvocation(find, "03/11/2025", "picker");
    assert.equal(find('[data-voting-id="1"]').value, before);
  });
  await runTest(`${type}: ignora convocatorias incompletas o invalidas`, async () => {
    const find = await mount(type);
    const before = find('[data-voting-id="1"]').value;
    for (const value of ["", "03/11", "31/11/2025"]) {
      changeConvocation(find, value, "text");
      assert.equal(find('[data-voting-id="1"]').value, before);
    }
  });
}

await runTest("recalcula el minimo al cambiar de Departamento a Curso o Grupo", async () => {
  const find = await mount("department");
  for (const type of ["course", "group"]) {
    find("#calendar-type").value = type;
    find("#calendar-type").dispatch("change");
    assert.equal(find('[data-voting-id="1"]').value, expectedVoting(type, "10/11/2025"));
  }
});

await runTest("actualiza la primera votacion y conserva las jornadas adicionales validas", async () => {
  const find = await mount("group");
  find("[data-add-voting]").dispatch("click");
  const second = find('[data-voting-id="2"]').value;
  changeConvocation(find, "03/11/2025", "picker");
  assert.equal(find('[data-voting-id="1"]').value, expectedVoting("group", "03/11/2025"));
  assert.equal(find('[data-voting-id="2"]').value, second);
  changeConvocation(find, "17/11/2025", "picker");
  const first = expectedVoting("group", "17/11/2025");
  assert.equal(find('[data-voting-id="1"]').value, first);
  assert.equal(find('[data-voting-id="2"]').value,
    formatDateInput(addBusinessDays(parseDateInput(first), 1, new Set())));
});

if (failures) process.exitCode = 1;
