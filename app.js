const state = {
  records: [],
  month: "",
  type: "",
  year: "",
  showSums: false,
  showCompare: false,
  comparePeriod: "month",
  compareMonth: "",
  compareQuarter: "",
  compareYear: "",
  compareType: "",
};

const els = {
  refreshNote: document.querySelector("#refreshNote"),
  monthFilter: document.querySelector("#monthFilter"),
  typeFilter: document.querySelector("#typeFilter"),
  yearFilter: document.querySelector("#yearFilter"),
  resetFilters: document.querySelector("#resetFilters"),
  toggleSums: document.querySelector("#toggleSums"),
  toggleCompare: document.querySelector("#toggleCompare"),
  comparePanel: document.querySelector("#comparePanel"),
  compareTitle: document.querySelector("#compareTitle"),
  compareContext: document.querySelector("#compareContext"),
  comparePeriodButtons: document.querySelectorAll("[data-compare-period]"),
  compareMonthWrap: document.querySelector("#compareMonthWrap"),
  compareQuarterWrap: document.querySelector("#compareQuarterWrap"),
  compareMonth: document.querySelector("#compareMonth"),
  compareQuarter: document.querySelector("#compareQuarter"),
  compareYear: document.querySelector("#compareYear"),
  compareType: document.querySelector("#compareType"),
  compareHead: document.querySelector("#compareHead"),
  compareBody: document.querySelector("#compareBody"),
  sumPanel: document.querySelector("#sumPanel"),
  sumContext: document.querySelector("#sumContext"),
  sumElectricityKwh: document.querySelector("#sumElectricityKwh"),
  sumGasKwh: document.querySelector("#sumGasKwh"),
  sumElectricityCharge: document.querySelector("#sumElectricityCharge"),
  sumGasCharge: document.querySelector("#sumGasCharge"),
  sumDirectDebit: document.querySelector("#sumDirectDebit"),
  yearPanel: document.querySelector("#yearPanel"),
  yearTitle: document.querySelector("#yearTitle"),
  yearContext: document.querySelector("#yearContext"),
  yearElectricityKwh: document.querySelector("#yearElectricityKwh"),
  yearGasKwh: document.querySelector("#yearGasKwh"),
  yearElectricityCharge: document.querySelector("#yearElectricityCharge"),
  yearGasCharge: document.querySelector("#yearGasCharge"),
  yearDirectDebit: document.querySelector("#yearDirectDebit"),
  resultCount: document.querySelector("#resultCount"),
  recordsBody: document.querySelector("#recordsBody"),
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

const numberFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
});

const moneyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : value || "";
}

function formatMonth(value) {
  const date = parseDate(value);
  return date ? monthFormatter.format(date) : value || "";
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? numberFormatter.format(number) : "";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? moneyFormatter.format(number) : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function recordMatchesType(record, type = state.type) {
  if (!type) return true;
  if (type === "Electricity") {
    return record.type === "Electricity" || record.type === "Electricity and Gas";
  }
  if (type === "Gas") {
    return record.type === "Gas" || record.type === "Electricity and Gas";
  }
  if (type === "Direct Debit") {
    return record.directDebit !== null && record.directDebit !== undefined && record.directDebit !== "";
  }
  return true;
}

function filteredRecords() {
  return state.records.filter((record) => {
    const monthMatches = !state.month || record.month === state.month;
    const yearMatches = !state.year || (record.date || "").startsWith(state.year);
    return monthMatches && yearMatches && recordMatchesType(record);
  });
}

function populateMonths() {
  const months = [...new Set(state.records.map((record) => record.month).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  els.monthFilter.innerHTML = '<option value="">All months</option>';
  months.forEach((month) => {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = formatMonth(month);
    els.monthFilter.appendChild(option);
  });
}

function populateYears() {
  const years = [
    ...new Set(
      state.records
        .map((record) => (record.date || "").slice(0, 4))
        .filter((year) => /^\d{4}$/.test(year))
    ),
  ].sort((a, b) => b.localeCompare(a));

  els.yearFilter.innerHTML = '<option value="">All years</option>';
  els.compareYear.innerHTML = '<option value="">All years</option>';
  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    els.yearFilter.appendChild(option);
    els.compareYear.appendChild(option.cloneNode(true));
  });
}

function typeClass(type) {
  if (type === "Gas") return "gas";
  if (type === "Electricity and Gas") return "both";
  if (type === "Direct Debit") return "dd";
  return "";
}

function displayType(record) {
  return state.type === "Direct Debit" ? "Direct Debit" : record.type;
}

function calculateTotals(records) {
  return records.reduce(
    (acc, record) => {
      acc.electricity += Number(record.electricityKwh || 0);
      acc.gas += Number(record.gasKwh || 0);
      acc.electricityCharge += Number(record.electricityCharge || 0);
      acc.gasCharge += Number(record.gasCharge || 0);
      acc.directDebit += Number(record.directDebit || 0);
      acc.balance += Number(record.balance || 0);
      return acc;
    },
    {
      electricity: 0,
      gas: 0,
      electricityCharge: 0,
      gasCharge: 0,
      directDebit: 0,
      balance: 0,
    }
  );
}

function updateTotalCardVisibility(panel) {
  if (!panel) return;
  panel.querySelectorAll("[data-total-kind]").forEach((card) => {
    const kind = card.dataset.totalKind;
    card.hidden =
      (state.type === "Electricity" && kind === "gas") ||
      (state.type === "Gas" && kind === "electricity") ||
      (state.type === "Direct Debit" && (kind === "electricity" || kind === "gas"));
  });
}

function renderResultCount(records) {
  els.resultCount.textContent = `${records.length} ${records.length === 1 ? "record" : "records"}`;
}

function renderSums(records) {
  const totals = calculateTotals(records);
  els.sumPanel.hidden = !state.showSums;
  els.toggleSums.textContent = state.showSums ? "Hide Sum" : "Show Sum";
  els.toggleSums.setAttribute("aria-expanded", state.showSums ? "true" : "false");
  els.sumContext.textContent = `${records.length} ${records.length === 1 ? "record" : "records"}`;
  els.sumElectricityKwh.textContent = formatNumber(totals.electricity);
  els.sumGasKwh.textContent = formatNumber(totals.gas);
  els.sumElectricityCharge.textContent = formatMoney(totals.electricityCharge);
  els.sumGasCharge.textContent = formatMoney(totals.gasCharge);
  els.sumDirectDebit.textContent = formatMoney(totals.directDebit);
  updateTotalCardVisibility(els.sumPanel);
}

function renderYearTotals() {
  const records = state.records.filter((record) => {
    const yearMatches = !state.year || (record.date || "").startsWith(state.year);
    return yearMatches && recordMatchesType(record);
  });
  const totals = calculateTotals(records);
  const yearText = state.year || "All Years";
  els.yearTitle.textContent = `${yearText} ${state.type || "All Types"} Totals`;
  els.yearContext.textContent = `${records.length} ${records.length === 1 ? "record" : "records"}`;
  els.yearElectricityKwh.textContent = formatNumber(totals.electricity);
  els.yearGasKwh.textContent = formatNumber(totals.gas);
  els.yearElectricityCharge.textContent = formatMoney(totals.electricityCharge);
  els.yearGasCharge.textContent = formatMoney(totals.gasCharge);
  els.yearDirectDebit.textContent = formatMoney(totals.directDebit);
  updateTotalCardVisibility(els.yearPanel);
}

function monthName(month) {
  return formatMonth(`2026-${month}-01`).replace(" 2026", "");
}

function quarterMonths(quarter) {
  return {
    Q1: ["01", "02", "03"],
    Q2: ["04", "05", "06"],
    Q3: ["07", "08", "09"],
    Q4: ["10", "11", "12"],
  }[quarter] || [];
}

function compareLabel() {
  if (state.comparePeriod === "quarter") return state.compareQuarter || "All Quarters";
  return state.compareMonth ? monthName(state.compareMonth) : "All Months";
}

function recordMatchesComparePeriod(record) {
  const month = (record.date || "").slice(5, 7);
  if (state.comparePeriod === "quarter") {
    return !state.compareQuarter || quarterMonths(state.compareQuarter).includes(month);
  }
  return !state.compareMonth || month === state.compareMonth;
}

function visibleCompareColumns() {
  if (state.compareType === "Electricity") {
    return [
      { key: "electricity", label: "Elec kWh", format: formatNumber },
      { key: "electricityCharge", label: "EON Elec", format: formatMoney },
      { key: "balance", label: "Balance", format: formatMoney },
    ];
  }
  if (state.compareType === "Gas") {
    return [
      { key: "gas", label: "Gas kWh", format: formatNumber },
      { key: "gasCharge", label: "EON Gas", format: formatMoney },
      { key: "balance", label: "Balance", format: formatMoney },
    ];
  }
  if (state.compareType === "Direct Debit") {
    return [
      { key: "directDebit", label: "Direct Debit", format: formatMoney },
      { key: "balance", label: "Balance", format: formatMoney },
    ];
  }
  return [
    { key: "electricity", label: "Elec kWh", format: formatNumber },
    { key: "electricityCharge", label: "EON Elec", format: formatMoney },
    { key: "gas", label: "Gas kWh", format: formatNumber },
    { key: "gasCharge", label: "EON Gas", format: formatMoney },
    { key: "directDebit", label: "Direct Debit", format: formatMoney },
    { key: "balance", label: "Balance", format: formatMoney },
  ];
}

function renderCompare() {
  els.comparePanel.hidden = !state.showCompare;
  els.toggleCompare.textContent = state.showCompare ? "Hide Compare" : "Compare";
  els.toggleCompare.setAttribute("aria-expanded", state.showCompare ? "true" : "false");
  els.compareMonthWrap.hidden = state.comparePeriod !== "month";
  els.compareQuarterWrap.hidden = state.comparePeriod !== "quarter";
  els.comparePeriodButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.comparePeriod === state.comparePeriod);
  });

  const periodText = compareLabel();
  const yearText = state.compareYear || "All Years";
  const typeText = state.compareType || "All Types";
  els.compareTitle.textContent = `${periodText} ${typeText} Comparison`;

  const rows = state.records.filter((record) => {
    const yearMatches = !state.compareYear || (record.date || "").startsWith(state.compareYear);
    return yearMatches && recordMatchesComparePeriod(record) && recordMatchesType(record, state.compareType);
  });

  const grouped = new Map();
  rows.forEach((record) => {
    const year = (record.date || "").slice(0, 4) || "Unknown";
    if (!grouped.has(year)) grouped.set(year, []);
    grouped.get(year).push(record);
  });

  const compareRows = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, records]) => ({ year, records, totals: calculateTotals(records) }));

  els.compareContext.textContent = `${compareRows.length} ${compareRows.length === 1 ? "year" : "years"}`;
  const columns = visibleCompareColumns();
  els.compareHead.innerHTML = `
    <tr>
      <th>Year</th>
      <th>Period</th>
      <th>Records</th>
      ${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
    </tr>
  `;

  if (!compareRows.length) {
    els.compareBody.innerHTML = `<tr><td colspan="${columns.length + 3}">No records match this comparison.</td></tr>`;
    return;
  }

  els.compareBody.innerHTML = compareRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.year)}</td>
          <td>${escapeHtml(periodText)}</td>
          <td class="num">${row.records.length}</td>
          ${columns
            .map((column) => {
              const value = row.totals[column.key];
              return `<td class="num">${value === null ? "-" : escapeHtml(column.format(value))}</td>`;
            })
            .join("")}
        </tr>
      `
    )
    .join("");
}

function renderTable(records) {
  if (!records.length) {
    els.recordsBody.innerHTML = '<tr><td colspan="8">No records match these filters.</td></tr>';
    return;
  }

  els.recordsBody.innerHTML = records
    .map(
      (record) => {
        const type = displayType(record);
        return `
        <tr>
          <td>${escapeHtml(formatMonth(record.sourceMonth || record.month))}</td>
          <td>${escapeHtml(formatDate(record.date))}</td>
          <td><span class="type-pill ${typeClass(type)}">${escapeHtml(type)}</span></td>
          <td class="num">${escapeHtml(formatNumber(record.electricityKwh))}</td>
          <td class="num">${escapeHtml(formatNumber(record.gasKwh))}</td>
          <td class="num">${escapeHtml(formatMoney(record.electricityCharge))}</td>
          <td class="num">${escapeHtml(formatMoney(record.gasCharge))}</td>
          <td class="num">${escapeHtml(formatMoney(record.directDebit))}</td>
        </tr>
      `;
      }
    )
    .join("");
}

function render() {
  const records = filteredRecords();
  renderResultCount(records);
  renderSums(records);
  renderYearTotals();
  renderCompare();
  renderTable(records);
}

async function loadData() {
  const response = await fetch(`data/energy.json?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load energy data.");
  const payload = await response.json();
  state.records = Array.isArray(payload.records) ? payload.records : [];
  if (els.refreshNote) {
    const generated = payload.generatedAt ? formatDate(payload.generatedAt.slice(0, 10)) : "";
    els.refreshNote.textContent = generated
      ? `Last refreshed ${generated}`
      : "Source data unavailable";
  }
  populateMonths();
  populateYears();
  render();
}

els.monthFilter.addEventListener("change", () => {
  state.month = els.monthFilter.value;
  render();
});

els.typeFilter.addEventListener("change", () => {
  state.type = els.typeFilter.value;
  render();
});

els.yearFilter.addEventListener("change", () => {
  state.year = els.yearFilter.value;
  render();
});

els.resetFilters.addEventListener("click", () => {
  state.month = "";
  state.type = "";
  state.year = "";
  els.monthFilter.value = "";
  els.typeFilter.value = "";
  els.yearFilter.value = "";
  render();
});

els.toggleSums.addEventListener("click", () => {
  state.showSums = !state.showSums;
  render();
});

els.toggleCompare.addEventListener("click", () => {
  state.showCompare = !state.showCompare;
  render();
});

els.comparePeriodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.comparePeriod = button.dataset.comparePeriod || "month";
    if (state.comparePeriod === "quarter") {
      state.compareMonth = "";
      els.compareMonth.value = "";
    } else {
      state.compareQuarter = "";
      els.compareQuarter.value = "";
    }
    render();
  });
});

els.compareMonth.addEventListener("change", () => {
  state.compareMonth = els.compareMonth.value;
  render();
});

els.compareQuarter.addEventListener("change", () => {
  state.compareQuarter = els.compareQuarter.value;
  render();
});

els.compareYear.addEventListener("change", () => {
  state.compareYear = els.compareYear.value;
  render();
});

els.compareType.addEventListener("change", () => {
  state.compareType = els.compareType.value;
  render();
});

loadData().catch((error) => {
  if (els.refreshNote) els.refreshNote.textContent = error.message;
  els.recordsBody.innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;
});
