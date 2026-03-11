export const CALENDAR_TYPES = {
  course: {
    id: "course",
    label: "Delegación de curso",
  },
  group: {
    id: "group",
    label: "Delegación de grupo",
  },
};

export const CALCULATION_MODES = {
  minimum: {
    id: "minimum",
    label: "Plazos mínimos",
  },
  maximum: {
    id: "maximum",
    label: "Plazos máximos",
  },
};

export const MAX_VOTING_DATES = 5;

export const UNITARY_ACT_ITEMS = [
  "Presentación de candidaturas",
  "Publicación de candidaturas provisionales",
  "Plazo de reclamación a las candidaturas presentadas",
  "Resolución de reclamaciones a candidaturas",
  "Proclamación definitiva de candidaturas",
  "Campaña electoral",
  "Votación",
  "Escrutinio",
  "Publicación provisional de candidaturas electas",
];

function cloneDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

export function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateInput(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function formatDateDayMonth(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function parseDateInput(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return cloneDate(value);
  }

  const normalized = String(value).trim();
  let year;
  let month;
  let day;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    [year, month, day] = normalized.split("-").map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    [day, month, year] = normalized.split("/").map(Number);
  } else {
    return null;
  }

  const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return candidate;
}

export function suggestAcademicYear(date) {
  const year = date.getFullYear();
  return date.getMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function expandDateRange(startDate, endDate, set) {
  const current = cloneDate(startDate);
  while (current <= endDate) {
    set.add(isoDate(current));
    current.setDate(current.getDate() + 1);
  }
}

export function parseExcludedDates(rawValue) {
  const set = new Set();
  const invalid = [];

  if (!rawValue) {
    return { set, invalid };
  }

  if (Array.isArray(rawValue)) {
    for (const entry of rawValue) {
      if (!entry) {
        continue;
      }

      if (entry.kind === "single") {
        const date = parseDateInput(entry.start ?? entry.value ?? entry.date ?? "");
        if (!date) {
          invalid.push(entry.start ?? entry.value ?? entry.date ?? "fecha vacía");
          continue;
        }
        set.add(isoDate(date));
        continue;
      }

      if (entry.kind === "range") {
        const startDate = parseDateInput(entry.start ?? "");
        const endDate = parseDateInput(entry.end ?? "");
        if (!startDate || !endDate) {
          invalid.push(`${entry.start ?? ""} - ${entry.end ?? ""}`.trim());
          continue;
        }
        if (endDate < startDate) {
          invalid.push(`${formatDateInput(startDate)} - ${formatDateInput(endDate)}`);
          continue;
        }
        expandDateRange(startDate, endDate, set);
      }
    }

    return { set, invalid };
  }

  for (const token of String(rawValue).split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)) {
    const parsed = parseDateInput(token);
    if (!parsed) {
      invalid.push(token);
      continue;
    }
    set.add(isoDate(parsed));
  }

  return { set, invalid };
}

function orderAndDeduplicateDates(dates) {
  return [...dates]
    .sort((left, right) => left.getTime() - right.getTime())
    .filter((date, index, list) => index === 0 || isoDate(date) !== isoDate(list[index - 1]));
}

export function parseVotingDates(rawValue) {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const invalid = [];
  const parsedDates = [];
  let providedCount = 0;

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      continue;
    }

    providedCount += 1;
    const date = parseDateInput(normalized);
    if (!date) {
      invalid.push(normalized);
      continue;
    }

    parsedDates.push(date);
  }

  const dates = orderAndDeduplicateDates(parsedDates);
  return {
    dates,
    invalid,
    duplicatesRemoved: dates.length !== parsedDates.length,
    providedCount,
  };
}

export function isBusinessDay(date, extraDisabledDates) {
  const weekday = date.getDay();
  return weekday !== 0 && weekday !== 6 && !extraDisabledDates.has(isoDate(date));
}

export function addBusinessDays(date, amount, extraDisabledDates) {
  if (amount === 0) {
    return cloneDate(date);
  }

  const result = cloneDate(date);
  const step = amount > 0 ? 1 : -1;
  let remaining = Math.abs(amount);

  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    if (isBusinessDay(result, extraDisabledDates)) {
      remaining -= 1;
    }
  }

  return result;
}

export function formatDateLong(date) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDateCompact(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

export function formatRangeLong(startDate, endDate) {
  if (isoDate(startDate) === isoDate(endDate)) {
    return formatDateLong(startDate);
  }

  return `Del ${formatDateLong(startDate)} al ${formatDateLong(endDate)}`;
}

export function formatRangeCompact(startDate, endDate) {
  if (isoDate(startDate) === isoDate(endDate)) {
    return formatDateCompact(startDate);
  }

  return `${formatDateCompact(startDate)} al ${formatDateCompact(endDate)}`;
}

function singleDayEvent(id, label, date, reference, category) {
  return {
    id,
    kind: "single",
    label,
    category,
    reference,
    startDate: date,
    endDate: date,
    webValue: formatDateLong(date),
    pdfValue: formatDateCompact(date),
  };
}

function rangeEvent(id, label, startDate, endDate, reference, category) {
  return {
    id,
    kind: "range",
    label,
    category,
    reference,
    startDate,
    endDate,
    collapsed: isoDate(startDate) === isoDate(endDate),
    webValue: formatRangeLong(startDate, endDate),
    pdfValue: formatRangeCompact(startDate, endDate),
  };
}

function buildVotingReference(anchorDate) {
  return `(Votación del ${formatDateDayMonth(anchorDate)})`;
}

function multiRangeEvent(id, label, entries, reference, category) {
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    referenceLabel: buildVotingReference(entry.anchorDate),
    webValue: formatRangeLong(entry.startDate, entry.endDate),
    pdfValue: formatRangeCompact(entry.startDate, entry.endDate),
  }));

  return {
    id,
    kind: "multi-range",
    label,
    category,
    reference,
    startDate: normalizedEntries[0].startDate,
    endDate: normalizedEntries.at(-1).endDate,
    entries: normalizedEntries,
    webValue: `${normalizedEntries.length} plazos vinculados a las votaciones`,
    pdfValue: normalizedEntries.map((entry) => `${entry.pdfValue} ${entry.referenceLabel}`),
    pdfBlocks: normalizedEntries.map((entry) => ({
      primary: entry.pdfValue,
      secondary: entry.referenceLabel,
    })),
  };
}

function multiSingleEvent(id, label, entries, reference, category) {
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    referenceLabel: buildVotingReference(entry.anchorDate),
    webValue: formatDateLong(entry.date),
    pdfValue: formatDateCompact(entry.date),
  }));

  return {
    id,
    kind: "multi-single",
    label,
    category,
    reference,
    startDate: normalizedEntries[0].date,
    endDate: normalizedEntries.at(-1).date,
    entries: normalizedEntries,
    webValue: `${normalizedEntries.length} proclamaciones vinculadas a las votaciones`,
    pdfValue: normalizedEntries.map((entry) => `${entry.pdfValue} ${entry.referenceLabel}`),
    pdfBlocks: normalizedEntries.map((entry) => ({
      primary: entry.pdfValue,
      secondary: entry.referenceLabel,
    })),
  };
}

function unitaryActEvent(dates) {
  const orderedDates = orderAndDeduplicateDates(dates);
  const firstDate = orderedDates[0];
  const lastDate = orderedDates.at(-1);
  const multipleDates = orderedDates.length > 1;

  return {
    id: "unitary_act",
    kind: multipleDates ? "multiple" : "single",
    label: "Unidad de acto",
    category: "Unidad de acto",
    reference: multipleDates
      ? "Proceso concentrado en varias jornadas lectivas dentro de una misma unidad de acto."
      : "Proceso concentrado en una única jornada lectiva.",
    startDate: firstDate,
    endDate: lastDate,
    dates: orderedDates,
    dateLabels: orderedDates.map((date) => formatDateLong(date)),
    webValue: multipleDates ? `${orderedDates.length} jornadas de votación` : formatDateLong(firstDate),
    pdfValue: multipleDates ? orderedDates.map((date) => formatDateCompact(date)) : formatDateCompact(firstDate),
    items: UNITARY_ACT_ITEMS,
  };
}

function buildResultsClaimEntries(votingDates, extraDisabledDates, calculationMode) {
  const endOffset = calculationMode === "minimum" ? 2 : 3;

  return votingDates.map((votingDate) => ({
    anchorDate: votingDate,
    startDate: addBusinessDays(votingDate, 1, extraDisabledDates),
    endDate: addBusinessDays(votingDate, endOffset, extraDisabledDates),
  }));
}

function buildFinalProclamationEntries(resultsClaimEntries, extraDisabledDates, calculationMode) {
  const resolutionOffset = calculationMode === "minimum" ? 1 : 2;

  return resultsClaimEntries.map((entry) => ({
    anchorDate: entry.anchorDate,
    date: addBusinessDays(entry.endDate, resolutionOffset, extraDisabledDates),
  }));
}

function buildResultsClaimEvent(entries) {
  if (entries.length === 1) {
    return rangeEvent(
      "results_claim_period",
      "Plazo de reclamación de los resultados electorales provisionales",
      entries[0].startDate,
      entries[0].endDate,
      "Periodo de impugnación de resultados provisionales.",
      "Resultados",
    );
  }

  return multiRangeEvent(
    "results_claim_period",
    "Plazo de reclamación de los resultados electorales provisionales",
    entries,
    "Se genera un plazo independiente de reclamación por cada jornada de votación.",
    "Resultados",
  );
}

function buildFinalProclamationEvent(entries) {
  if (entries.length === 1) {
    return singleDayEvent(
      "final_proclamation",
      "Resolución de reclamaciones y proclamación definitiva de candidatos electos",
      entries[0].date,
      "Cierre definitivo del proceso.",
      "Resultados",
    );
  }

  return multiSingleEvent(
    "final_proclamation",
    "Resolución de reclamaciones y proclamación definitiva de candidatos electos",
    entries,
    "Se genera una proclamación definitiva independiente por cada plazo de reclamación vinculado a una votación.",
    "Resultados",
  );
}

function buildAssumptions(calculationMode, multipleVotingDates, includeManualConvocation, duplicatesRemoved) {
  const assumptions = [
    calculationMode === "minimum"
      ? "Se ha aplicado el criterio de plazos mínimos en los tramos abiertos del procedimiento."
      : "Se ha aplicado el criterio de plazos máximos en los tramos abiertos del procedimiento.",
    "Los días inhábiles excluyen sábados, domingos y cualquier fecha o rango adicional marcado en la interfaz.",
  ];

  if (includeManualConvocation) {
    assumptions.unshift("La convocatoria se introduce manualmente para adaptarla al calendario concreto del centro.");
  }

  if (multipleVotingDates) {
    assumptions.push("La unidad de acto se mantiene en un único bloque y, si hay varias votaciones, el PDF reparte sus fechas dentro de la misma casilla.");
    assumptions.push("Cada jornada de votación genera su propio plazo de reclamación de resultados y su propia proclamación definitiva.");
  }

  if (duplicatesRemoved) {
    assumptions.push("Las fechas de votación repetidas se han fusionado para evitar duplicidades en el calendario.");
  }

  return assumptions;
}

function buildCourseSchedule(convocationDate, votingDates, academicYear, extraDisabledDates, calculationMode, duplicatesRemoved) {
  const resultsClaimEntries = buildResultsClaimEntries(votingDates, extraDisabledDates, calculationMode);
  const finalProclamationEntries = buildFinalProclamationEntries(resultsClaimEntries, extraDisabledDates, calculationMode);

  return {
    valid: true,
    type: "course",
    academicYear,
    calculationMode,
    assumptions: buildAssumptions(calculationMode, votingDates.length > 1, true, duplicatesRemoved),
    events: [
      singleDayEvent(
        "convocation",
        "Convocatoria, publicación de esta y del calendario electoral",
        convocationDate,
        "Convocatoria del proceso.",
        "Preparación",
      ),
      unitaryActEvent(votingDates),
      buildResultsClaimEvent(resultsClaimEntries),
      buildFinalProclamationEvent(finalProclamationEntries),
    ],
  };
}

function buildGroupSchedule(convocationDate, votingDates, academicYear, extraDisabledDates, calculationMode, duplicatesRemoved) {
  const firstVotingDate = votingDates[0];
  const provisionalCensus = addBusinessDays(convocationDate, 1, extraDisabledDates);
  const censusPublicationEnd = addBusinessDays(provisionalCensus, 4, extraDisabledDates);
  const censusClaimEnd = addBusinessDays(censusPublicationEnd, 3, extraDisabledDates);
  const definitiveCensus = addBusinessDays(
    censusClaimEnd,
    calculationMode === "minimum" ? 1 : 3,
    extraDisabledDates,
  );
  const resultsClaimEntries = buildResultsClaimEntries(votingDates, extraDisabledDates, calculationMode);
  const finalProclamationEntries = buildFinalProclamationEntries(resultsClaimEntries, extraDisabledDates, calculationMode);

  const errors = [];

  if (firstVotingDate < definitiveCensus) {
    errors.push("La primera votación no puede celebrarse antes de que quede cerrado el trámite del censo definitivo.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    type: "group",
    academicYear,
    calculationMode,
    assumptions: buildAssumptions(calculationMode, votingDates.length > 1, false, duplicatesRemoved),
    events: [
      singleDayEvent(
        "convocation",
        "Convocatoria, publicación de esta y del calendario electoral",
        convocationDate,
        "Convocatoria del proceso.",
        "Preparación",
      ),
      singleDayEvent(
        "provisional_census_publication",
        "Publicación de los censos electorales provisionales",
        provisionalCensus,
        "Apertura del trámite de censo.",
        "Censo",
      ),
      rangeEvent(
        "census_publication_period",
        "Plazo en el que se mantendrán publicados los censos electorales",
        provisionalCensus,
        censusPublicationEnd,
        "Periodo de exposición del censo.",
        "Censo",
      ),
      rangeEvent(
        "census_claim_period",
        "Plazo de reclamaciones de los censos provisionales",
        provisionalCensus,
        censusClaimEnd,
        "Periodo de reclamación al censo.",
        "Censo",
      ),
      singleDayEvent(
        "definitive_census_publication",
        "Resolución de reclamaciones y publicación del censo definitivo",
        definitiveCensus,
        "Cierre del trámite de censo.",
        "Censo",
      ),
      unitaryActEvent(votingDates),
      buildResultsClaimEvent(resultsClaimEntries),
      buildFinalProclamationEvent(finalProclamationEntries),
    ],
  };
}

export function calculateSchedule({
  type,
  convocationDate: convocationInput,
  electionDate: legacyElectionInput,
  electionDatesInput = [],
  academicYear: academicYearInput,
  calculationMode = "maximum",
  excludedDatesInput = [],
}) {
  const errors = [];
  const excludedDates = parseExcludedDates(excludedDatesInput);
  const convocationDate = parseDateInput(convocationInput);
  const votingDates = parseVotingDates(
    Array.isArray(electionDatesInput) && electionDatesInput.length > 0
      ? electionDatesInput
      : [legacyElectionInput],
  );

  if (!CALENDAR_TYPES[type]) {
    errors.push("Selecciona un tipo de calendario válido.");
  }

  if (!CALCULATION_MODES[calculationMode]) {
    errors.push("Selecciona un criterio de cálculo válido.");
  }

  if (!convocationDate) {
    errors.push("Introduce una fecha de convocatoria válida en formato dd/mm/aaaa.");
  }

  if (votingDates.providedCount === 0) {
    errors.push("Introduce al menos una fecha de votación válida en formato dd/mm/aaaa.");
  }

  if (votingDates.providedCount > MAX_VOTING_DATES) {
    errors.push(`Solo puedes introducir hasta ${MAX_VOTING_DATES} fechas de votación.`);
  }

  if (votingDates.invalid.length > 0) {
    errors.push(`Hay fechas de votación no válidas: ${votingDates.invalid.join(", ")}.`);
  }

  if (excludedDates.invalid.length > 0) {
    errors.push(`Hay fechas inhábiles adicionales no válidas: ${excludedDates.invalid.join(", ")}.`);
  }

  if (convocationDate && !isBusinessDay(convocationDate, excludedDates.set)) {
    errors.push("La convocatoria debe situarse en un día hábil según el cómputo configurado.");
  }

  for (const votingDate of votingDates.dates) {
    if (!isBusinessDay(votingDate, excludedDates.set)) {
      errors.push(`La votación del ${formatDateInput(votingDate)} debe situarse en un día hábil según el cómputo configurado.`);
    }
  }

  const firstVotingDate = votingDates.dates[0];
  if (convocationDate && firstVotingDate && firstVotingDate < convocationDate) {
    errors.push("La primera votación no puede celebrarse antes de la convocatoria.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const anchorDate = votingDates.dates.at(-1) ?? convocationDate;
  const academicYear = academicYearInput?.trim() || suggestAcademicYear(anchorDate);

  if (type === "course") {
    return buildCourseSchedule(
      convocationDate,
      votingDates.dates,
      academicYear,
      excludedDates.set,
      calculationMode,
      votingDates.duplicatesRemoved,
    );
  }

  return buildGroupSchedule(
    convocationDate,
    votingDates.dates,
    academicYear,
    excludedDates.set,
    calculationMode,
    votingDates.duplicatesRemoved,
  );
}
