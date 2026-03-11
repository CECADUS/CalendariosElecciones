const PAGE_HEIGHT_PX = 1123;
const PX_TO_PT = 0.75;
const CELL_INNER_PADDING_PT = 3.5;
const WHITE = { r: 1, g: 1, b: 1 };
const ACCENT = "#8D0739";
const TEXT = "#222222";
const RAW_PAGE = { width: 1240, height: 1754 };
let pdfLibLoader = null;
let fontLoader = null;
const textImageCache = new Map();

function toPt(value) {
  return value * PX_TO_PT;
}

function toPxFromPt(value) {
  return value / PX_TO_PT;
}

function rowCell(topPx, bottomPx) {
  return {
    x: 56.25,
    y: toPt(PAGE_HEIGHT_PX - bottomPx),
    width: 91.5,
    height: toPt(bottomPx - topPx),
  };
}

function pxRect(x, top, width, height) {
  return {
    x: toPt(x),
    y: toPt(PAGE_HEIGHT_PX - top - height),
    width: toPt(width),
    height: toPt(height),
  };
}

function rawRowCell(top, bottom) {
  return {
    kind: "raw-row",
    top,
    bottom,
    x: 118,
    width: 190.293,
  };
}

const TEMPLATE_CONFIG = {
  course: {
    templatePath: "./templates/CalendarioCurso.pdf",
    yearBox: pxRect(497, 207, 112, 26),
    yearTextOffsetPx: { x: -4, y: -2 },
    cells: {
      convocation: rowCell(297, 330),
      unitary_act: rowCell(330, 583),
      results_claim_period: rowCell(583, 616),
      final_proclamation: rowCell(616, 650),
    },
  },
  group: {
    templatePath: "./templates/CalendarioGrupo.pdf",
    yearBox: pxRect(497, 207, 112, 26),
    yearTextOffsetPx: { x: -4, y: -2 },
    cells: {
      convocation: rowCell(297, 333),
      provisional_census_publication: rowCell(330, 367),
      census_publication_period: rowCell(364, 401),
      census_claim_period: rowCell(398, 435),
      definitive_census_publication: rowCell(431, 469),
      unitary_act: rowCell(465, 717),
      results_claim_period: rowCell(717, 751),
      final_proclamation: rowCell(751, 784),
    },
  },
  course_multi: {
    templatePath: "./templates/CalendarioCurso2.pdf",
    yearBox: pxRect(497, 207, 112, 26),
    yearTextOffsetPx: { x: -4, y: -2 },
    cells: {
      convocation: rawRowCell(412.293, 573),
      unitary_act: rawRowCell(517.043, 915.348),
      results_claim_period: rawRowCell(915.348, 1075.645),
      final_proclamation: rawRowCell(1075.645, 1235.895),
    },
  },
  group_multi: {
    templatePath: "./templates/CalendarioGrupo2.pdf",
    yearBox: pxRect(497, 207, 112, 26),
    yearTextOffsetPx: { x: -4, y: -2 },
    cells: {
      convocation: rawRowCell(412.293, 573),
      provisional_census_publication: rawRowCell(464.543, 626),
      census_publication_period: rawRowCell(517.043, 678),
      census_claim_period: rawRowCell(569.605, 730),
      definitive_census_publication: rawRowCell(621.855, 783),
      unitary_act: rawRowCell(726.855, 1125.145),
      results_claim_period: rawRowCell(1125.145, 1285.41),
      final_proclamation: rawRowCell(1285.41, 1445.707),
    },
  },
};

function selectTemplateConfig(schedule) {
  const multipleVotingDates = Array.isArray(schedule.events.find((event) => event.id === "unitary_act")?.pdfValue);
  if (!multipleVotingDates) {
    return TEMPLATE_CONFIG[schedule.type];
  }
  return TEMPLATE_CONFIG[`${schedule.type}_multi`];
}

function resolveCell(page, descriptor) {
  if (!descriptor) {
    return null;
  }

  if (descriptor.kind !== "raw-row") {
    return descriptor;
  }

  const scaleX = page.getWidth() / RAW_PAGE.width;
  const scaleY = page.getHeight() / RAW_PAGE.height;
  return {
    x: descriptor.x * scaleX,
    y: page.getHeight() - descriptor.bottom * scaleY,
    width: descriptor.width * scaleX,
    height: (descriptor.bottom - descriptor.top) * scaleY,
  };
}

async function ensurePdfLib() {
  if (window.PDFLib) {
    return window.PDFLib;
  }

  if (!pdfLibLoader) {
    pdfLibLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
      script.async = true;
      script.onload = () => resolve(window.PDFLib);
      script.onerror = () => reject(new Error("No se ha podido cargar pdf-lib."));
      document.head.appendChild(script);
    });
  }

  return pdfLibLoader;
}

async function ensureArialNarrow() {
  if (fontLoader) {
    return fontLoader;
  }

  fontLoader = (async () => {
    const regular = new FontFace("ArialNarrowEmbedded", "url(./fonts/ARIALN.TTF)");
    const italic = new FontFace("ArialNarrowEmbeddedItalic", "url(./fonts/ARIALNI.TTF)");
    await Promise.all([regular.load(), italic.load()]);
    document.fonts.add(regular);
    document.fonts.add(italic);
    await document.fonts.ready;
  })();

  return fontLoader;
}

function wrapText(context, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function fitFontSize(context, lines, targetFontSizePx, maxWidthPx, fontFamily, fontStyle) {
  let currentFontSize = targetFontSizePx;
  while (currentFontSize > 6) {
    context.font = `${fontStyle} ${currentFontSize}px "${fontFamily}"`;
    const widestLine = Math.max(...lines.map((line) => context.measureText(line).width), 0);
    if (widestLine <= maxWidthPx) {
      return currentFontSize;
    }
    currentFontSize -= 0.4;
  }
  return currentFontSize;
}

function fitStackedFontSize(
  context,
  lines,
  targetFontSizePx,
  maxWidthPx,
  maxHeightPx,
  fontFamily,
  fontStyle,
  lineHeightFactor,
) {
  let currentFontSize = targetFontSizePx;
  while (currentFontSize > 5.2) {
    context.font = `${fontStyle} ${currentFontSize}px "${fontFamily}"`;
    const widestLine = Math.max(...lines.map((line) => context.measureText(line).width), 0);
    const totalHeight = lines.length * currentFontSize * lineHeightFactor;
    if (widestLine <= maxWidthPx && totalHeight <= maxHeightPx) {
      return currentFontSize;
    }
    currentFontSize -= 0.35;
  }
  return currentFontSize;
}

function fitBlockFonts(context, blocks, options) {
  let primarySize = toPxFromPt(options.primaryFontSizePt);
  let secondarySize = blocks.some((block) => block.secondary) ? toPxFromPt(options.secondaryFontSizePt) : 0;
  const maxWidth = options.widthPx - options.paddingPx * 2;
  const maxHeight = options.heightPx - options.paddingPx * 2;

  while (primarySize > 5.2) {
    context.font = `${options.fontStyle} ${primarySize}px "${options.fontFamily}"`;
    const primaryWidth = Math.max(...blocks.map((block) => context.measureText(block.primary).width), 0);

    let secondaryWidth = 0;
    if (secondarySize > 0) {
      context.font = `${options.fontStyle} ${secondarySize}px "${options.fontFamily}"`;
      secondaryWidth = Math.max(...blocks.map((block) => block.secondary ? context.measureText(block.secondary).width : 0), 0);
    }

    const blockHeights = blocks.map((block) => {
      if (!block.secondary) {
        return primarySize * options.primaryLineHeight;
      }
      return primarySize * options.primaryLineHeight + secondarySize * options.secondaryLineHeight + options.secondaryGapPx;
    });
    const totalHeight = Math.max(...blockHeights, 0) * blocks.length;

    if (Math.max(primaryWidth, secondaryWidth) <= maxWidth && totalHeight <= maxHeight) {
      return { primarySize, secondarySize };
    }

    primarySize -= 0.3;
    if (secondarySize > 0) {
      secondarySize = Math.max(secondarySize - 0.22, 4.8);
    }
  }

  return { primarySize, secondarySize };
}

async function renderTextImage(text, {
  maxWidthPt,
  fontSizePt,
  color = TEXT,
  fontFamily = "ArialNarrowEmbedded",
  fontStyle = "normal",
  paddingPx = 4,
  lineHeightFactor = 1.14,
}) {
  await ensureArialNarrow();

  const cacheKey = JSON.stringify({ text, maxWidthPt, fontSizePt, color, fontFamily, fontStyle, paddingPx, lineHeightFactor });
  if (textImageCache.has(cacheKey)) {
    return textImageCache.get(cacheKey);
  }

  const scale = 3;
  const baseFontSizePx = toPxFromPt(fontSizePt);
  const maxWidthPx = toPxFromPt(maxWidthPt);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  context.font = `${fontStyle} ${baseFontSizePx}px "${fontFamily}"`;
  const lines = wrapText(context, text, maxWidthPx - paddingPx * 2);
  const fittedFontSizePx = fitFontSize(context, lines, baseFontSizePx, maxWidthPx - paddingPx * 2, fontFamily, fontStyle);

  context.font = `${fontStyle} ${fittedFontSizePx}px "${fontFamily}"`;
  const widths = lines.map((line) => context.measureText(line).width);
  const lineHeightPx = fittedFontSizePx * lineHeightFactor;
  const cssWidth = Math.max(...widths, 0) + paddingPx * 2;
  const cssHeight = lineHeightPx * lines.length + paddingPx * 2;

  canvas.width = Math.max(1, Math.ceil(cssWidth * scale));
  canvas.height = Math.max(1, Math.ceil(cssHeight * scale));
  context.scale(scale, scale);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.font = `${fontStyle} ${fittedFontSizePx}px "${fontFamily}"`;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";

  lines.forEach((line, index) => {
    const x = cssWidth / 2;
    const y = paddingPx + lineHeightPx * index + lineHeightPx / 2;
    context.fillText(line, x, y);
  });

  const dataUrl = canvas.toDataURL("image/png");
  const bytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
  const rendered = {
    bytes,
    widthPt: cssWidth * PX_TO_PT,
    heightPt: cssHeight * PX_TO_PT,
  };

  textImageCache.set(cacheKey, rendered);
  return rendered;
}

async function renderStackedLinesImage(lines, cell, {
  fontSizePt,
  color = TEXT,
  fontFamily = "ArialNarrowEmbedded",
  fontStyle = "normal",
  paddingPx = 3,
  lineHeightFactor = 1.12,
  slotFillRatio = 0.52,
  distributionRatio = 1,
}) {
  await ensureArialNarrow();

  const cacheKey = JSON.stringify({ lines, cell, fontSizePt, color, fontFamily, fontStyle, paddingPx, lineHeightFactor, slotFillRatio, distributionRatio, stacked: true });
  if (textImageCache.has(cacheKey)) {
    return textImageCache.get(cacheKey);
  }

  const scale = 3;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const cssWidth = toPxFromPt(cell.width);
  const cssHeight = toPxFromPt(cell.height);
  const baseFontSizePx = toPxFromPt(fontSizePt);
  const usableWidth = cssWidth - paddingPx * 2;
  const usableHeight = cssHeight - paddingPx * 2;
  const effectiveHeightPx = usableHeight * distributionRatio;
  const slotHeightPx = effectiveHeightPx / lines.length;
  const fittedFontSizePx = Math.min(
    fitStackedFontSize(context, lines, baseFontSizePx, usableWidth, effectiveHeightPx, fontFamily, fontStyle, lineHeightFactor),
    slotHeightPx * slotFillRatio,
  );
  const slotOffsetPx = paddingPx + (usableHeight - effectiveHeightPx) / 2 + slotHeightPx / 2;

  canvas.width = Math.max(1, Math.ceil(cssWidth * scale));
  canvas.height = Math.max(1, Math.ceil(cssHeight * scale));
  context.scale(scale, scale);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.font = `${fontStyle} ${fittedFontSizePx}px "${fontFamily}"`;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";

  lines.forEach((line, index) => {
    const x = cssWidth / 2;
    const y = slotOffsetPx + slotHeightPx * index;
    context.fillText(line, x, y);
  });

  const dataUrl = canvas.toDataURL("image/png");
  const bytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
  const rendered = {
    bytes,
    widthPt: cell.width,
    heightPt: cell.height,
  };

  textImageCache.set(cacheKey, rendered);
  return rendered;
}

async function renderEntryBlocksImage(blocks, cell, {
  primaryFontSizePt,
  secondaryFontSizePt,
  color = TEXT,
  fontFamily = "ArialNarrowEmbedded",
  fontStyle = "normal",
  paddingPx = 3,
  primaryLineHeight = 1.06,
  secondaryLineHeight = 1.02,
  secondaryGapPx = 1.4,
}) {
  await ensureArialNarrow();

  const cacheKey = JSON.stringify({ blocks, cell, primaryFontSizePt, secondaryFontSizePt, color, fontFamily, fontStyle, paddingPx, primaryLineHeight, secondaryLineHeight, secondaryGapPx, blocksMode: true });
  if (textImageCache.has(cacheKey)) {
    return textImageCache.get(cacheKey);
  }

  const scale = 3;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const cssWidth = toPxFromPt(cell.width);
  const cssHeight = toPxFromPt(cell.height);
  const sizes = fitBlockFonts(context, blocks, {
    widthPx: cssWidth,
    heightPx: cssHeight,
    paddingPx,
    fontFamily,
    fontStyle,
    primaryFontSizePt,
    secondaryFontSizePt,
    primaryLineHeight,
    secondaryLineHeight,
    secondaryGapPx,
  });

  const blockHeights = blocks.map((block) => {
    if (!block.secondary) {
      return sizes.primarySize * primaryLineHeight;
    }
    return sizes.primarySize * primaryLineHeight + sizes.secondarySize * secondaryLineHeight + secondaryGapPx;
  });
  const totalContentHeight = blockHeights.reduce((sum, value) => sum + value, 0);
  const availableGap = Math.max(cssHeight - paddingPx * 2 - totalContentHeight, 0);
  const interBlockGap = availableGap / (blocks.length + 1);
  let currentY = paddingPx + interBlockGap;

  canvas.width = Math.max(1, Math.ceil(cssWidth * scale));
  canvas.height = Math.max(1, Math.ceil(cssHeight * scale));
  context.scale(scale, scale);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";

  blocks.forEach((block, index) => {
    const x = cssWidth / 2;
    const primaryHeight = sizes.primarySize * primaryLineHeight;
    context.font = `${fontStyle} ${sizes.primarySize}px "${fontFamily}"`;
    context.fillText(block.primary, x, currentY + primaryHeight / 2);

    if (block.secondary) {
      const secondaryHeight = sizes.secondarySize * secondaryLineHeight;
      context.font = `${fontStyle} ${sizes.secondarySize}px "${fontFamily}"`;
      context.fillText(block.secondary, x, currentY + primaryHeight + secondaryGapPx + secondaryHeight / 2);
    }

    currentY += blockHeights[index] + interBlockGap;
  });

  const dataUrl = canvas.toDataURL("image/png");
  const bytes = await fetch(dataUrl).then((response) => response.arrayBuffer());
  const rendered = {
    bytes,
    widthPt: cell.width,
    heightPt: cell.height,
  };

  textImageCache.set(cacheKey, rendered);
  return rendered;
}

async function drawImageData(pdf, page, imageData, cell) {
  const image = await pdf.embedPng(imageData.bytes);
  const x = cell.x + (cell.width - imageData.widthPt) / 2;
  const y = cell.y + (cell.height - imageData.heightPt) / 2;

  page.drawImage(image, {
    x,
    y,
    width: imageData.widthPt,
    height: imageData.heightPt,
  });
}

async function drawTextImage(pdf, page, text, cell, options = {}) {
  const imageData = await renderTextImage(text, {
    maxWidthPt: cell.width - CELL_INNER_PADDING_PT * 2,
    ...options,
  });
  await drawImageData(pdf, page, imageData, cell);
}

async function drawStackedLines(pdf, page, lines, cell, options = {}) {
  const imageData = await renderStackedLinesImage(lines, cell, options);
  await drawImageData(pdf, page, imageData, cell);
}

async function drawEntryBlocks(pdf, page, blocks, cell, options = {}) {
  const imageData = await renderEntryBlocksImage(blocks, cell, options);
  await drawImageData(pdf, page, imageData, cell);
}

async function drawAcademicYear(pdf, page, config, academicYear) {
  const { rgb } = await ensurePdfLib();
  page.drawRectangle({
    x: config.yearBox.x,
    y: config.yearBox.y,
    width: config.yearBox.width,
    height: config.yearBox.height,
    color: rgb(WHITE.r, WHITE.g, WHITE.b),
  });

  const textCell = {
    x: config.yearBox.x + toPt(config.yearTextOffsetPx.x),
    y: config.yearBox.y + toPt(config.yearTextOffsetPx.y),
    width: config.yearBox.width,
    height: config.yearBox.height,
  };

  await drawTextImage(pdf, page, academicYear, textCell, {
    fontSizePt: 16,
    color: ACCENT,
    paddingPx: 1,
    lineHeightFactor: 1.02,
  });
}

function fontSizeForEvent(event) {
  return event.kind === "range" || event.kind === "multi-range" ? 9 : 11;
}

function unitaryActDistributionRatio(count) {
  if (count <= 2) {
    return 0.58;
  }
  if (count === 3) {
    return 0.76;
  }
  return 1;
}

export async function generateFilledPdf(schedule) {
  const { PDFDocument } = await ensurePdfLib();
  const config = selectTemplateConfig(schedule);
  const sourceBytes = await fetch(config.templatePath).then((response) => response.arrayBuffer());
  const pdf = await PDFDocument.load(sourceBytes);
  const page = pdf.getPage(0);

  await drawAcademicYear(pdf, page, config, schedule.academicYear);

  for (const event of schedule.events) {
    const cell = resolveCell(page, config.cells[event.id]);
    if (!cell) {
      continue;
    }

    if (event.pdfBlocks) {
      await drawEntryBlocks(pdf, page, event.pdfBlocks, cell, {
        primaryFontSizePt: event.kind === "multi-range" ? 9 : 11,
        secondaryFontSizePt: 7.2,
        color: TEXT,
        paddingPx: 3,
      });
      continue;
    }

    if (Array.isArray(event.pdfValue)) {
      await drawStackedLines(pdf, page, event.pdfValue, cell, {
        fontSizePt: event.id === "unitary_act" ? 10.4 : fontSizeForEvent(event),
        color: TEXT,
        paddingPx: event.id === "unitary_act" ? 1 : event.kind === "multi-range" ? 2 : 3,
        lineHeightFactor: event.kind === "multi-range" ? 1.05 : 1.08,
        slotFillRatio: event.id === "unitary_act" ? 0.34 : 0.52,
        distributionRatio: event.id === "unitary_act" ? unitaryActDistributionRatio(event.pdfValue.length) : 1,
      });
      continue;
    }

    await drawTextImage(pdf, page, event.pdfValue, cell, {
      fontSizePt: fontSizeForEvent(event),
      color: TEXT,
      paddingPx: event.kind === "range" ? 2 : 3,
    });
  }

  return pdf.save();
}

export async function downloadFilledPdf(schedule) {
  const bytes = await generateFilledPdf(schedule);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `calendario-electoral-${schedule.type}-${schedule.academicYear}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}





