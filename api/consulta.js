const SPREADSHEET_ID = "12xySs3rAxCTSAtBBbJMzceCUhXlTktz6rdJoJa6HfSM";

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"') {
      if (quoted && next === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(v => String(v).trim() !== "")) rows.push(row);
      row = []; cell = "";
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some(v => String(v).trim() !== "")) rows.push(row);
  return rows;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findHeaderIndex(headers, candidates) {
  const normalized = headers.map(normalize);
  return normalized.findIndex(h => candidates.some(c => h === normalize(c)));
}

function parseHours(value) {
  if (value === null || value === undefined || String(value).trim() === "") return 0;
  const s = String(value).trim().toLowerCase().replace(/,/g, ".");
  // Aceita horas decimais (ex.: 0.5h), horas/minutos (ex.: 1h 30m)
  // e números simples (ex.: 0.5), sem transformar a exibição original.
  const clock = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) return Number(clock[1]) + (Number(clock[2]) / 60) + (Number(clock[3] || 0) / 3600);
  const hm = s.match(/^(\d+(?:\.\d+)?)\s*h(?:oras?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utos?)?)?)?$/);
  if (hm) return Number(hm[1]) + (Number(hm[2] || 0) / 60);
  const minutesOnly = s.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:utos?)?)?$/);
  if (minutesOnly) return Number(minutesOnly[1]) / 60;
  const numeric = s.match(/^(\d+(?:\.\d+)?)\s*h?$/);
  if (numeric) return Number(numeric[1]);
  return 0;
}

function formatSheetHours(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Indisponível";
  // Mantém o valor decimal da planilha; não converte horas em minutos.
  if (/h(?:oras?)?$/i.test(raw)) return raw;
  return `${raw.replace(/\s+/g, "")}h`;
}

function formatMinutes(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return Math.round(parseHours(raw) * 60);
}

async function readSheet() {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`);
  url.searchParams.set("tqx", "out:csv");
  // A empresa mantém apenas uma aba na planilha e pode renomeá-la/substituí-la.
  // Sem o parâmetro "sheet", o GViz consulta a aba padrão (única aba existente).
  // O cache-buster e cache:no-store solicitam uma leitura nova a cada pesquisa.
  url.searchParams.set("_", String(Date.now()));
  const response = await fetch(url, {
    headers: { "Accept": "text/csv", "Cache-Control": "no-cache" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`A planilha respondeu com HTTP ${response.status}.`);
  const csv = await response.text();
  if (!csv || csv.trim().length < 10 || csv.includes("google.visualization.Query.setResponse")) {
    throw new Error("A resposta da planilha não veio em formato CSV.");
  }
  return parseCsv(csv);
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Digite um e-mail válido." });
  }

  try {
    const rows = await readSheet();
    let headerRowIndex = -1;
    let emailCol = -1, acceptedCol = -1, pendingCol = -1, rejectedCol = -1, statusCol = -1, totalHoursCol = -1;

    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const headers = rows[i];
      const e = findHeaderIndex(headers, ["Email", "E-mail", "User Email"]);
      const a = findHeaderIndex(headers, ["Accepted Hrs", "Accepted Hours", "Horas aceitas", "Horas aprovadas"]);
      const p = findHeaderIndex(headers, ["Pending Hrs", "Pending Hours", "Horas pendentes", "Horas em análise"]);
      const r = findHeaderIndex(headers, ["Rejected Hrs", "Rejected Hours", "Horas rejeitadas"]);
      const s = findHeaderIndex(headers, ["Account Status", "Status da conta", "Status"]);
      const t = findHeaderIndex(headers, ["Total Hrs"]);
      if (e >= 0 && a >= 0 && p >= 0 && r >= 0 && s >= 0 && t === 3) {
        headerRowIndex = i;
        emailCol = e; acceptedCol = a; pendingCol = p; rejectedCol = r; statusCol = s; totalHoursCol = t;
        break;
      }
    }

    if (headerRowIndex < 0) {
      throw new Error("Não localizei os cabeçalhos esperados ou a coluna D com o cabeçalho Total Hrs. Confira a estrutura da única aba da planilha.");
    }

    // A posição é a ordem original da linha na aba, contando também os cinco
    // registros fixos do início. Não ordenar nem descontar posições.
    const records = rows.slice(headerRowIndex + 1)
      .map((row, index) => ({
        email: String(row[emailCol] ?? "").trim().toLowerCase(),
        accepted: parseHours(row[acceptedCol]),
        acceptedDisplay: formatSheetHours(row[acceptedCol]),
        pendingDisplay: formatSheetHours(row[pendingCol]),
        rejectedDisplay: formatSheetHours(row[rejectedCol]),
        totalHoursRaw: String(row[totalHoursCol] ?? "").trim(),
        totalHoursDisplay: String(row[totalHoursCol] ?? "").trim() || "Indisponível",
        approvedMinutes: formatMinutes(row[acceptedCol]),
        pendingMinutes: formatMinutes(row[pendingCol]),
        rejectedMinutes: formatMinutes(row[rejectedCol]),
        status: normalize(row[statusCol]),
        sheetPosition: index + 1
      }))
      .filter(record => record.email && record.email.includes("@"));

    const target = records.find(record => record.email === email);
    if (!target) {
      return res.status(404).json({
        error: "E-mail não encontrado na planilha oficial. Confira o endereço e tente novamente."
      });
    }

    const isActive = target.status === "active" || target.status === "ativa" || target.status === "ativo";
    const inactiveStatuses = ["inactive", "inativa", "inativo", "disabled", "deactivated", "desativada", "desativado"];
    const accountStatus = ["active", "ativa", "ativo"].includes(target.status)
      ? "active"
      : inactiveStatuses.includes(target.status) ? "inactive" : "unknown";

    return res.status(200).json({
      email,
      period: "Dados atuais",
      approved: target.acceptedDisplay,
      pending: target.pendingDisplay,
      rejected: target.rejectedDisplay,
      totalHours: target.totalHoursDisplay,
      totalMinutes: formatMinutes(target.totalHoursRaw),
      approvedMinutes: target.approvedMinutes,
      pendingMinutes: target.pendingMinutes,
      rejectedMinutes: target.rejectedMinutes,
      accountStatus,
      rank: target.sheetPosition,
      accountActive: isActive,
      fetchedAt: new Date().toISOString(),
      source: "Planilha oficial"
    });
  } catch (error) {
    console.error("Falha na consulta à planilha:", error.message);
    return res.status(503).json({
      error: "Não foi possível ler a planilha oficial agora. Tente novamente mais tarde."
    });
  }
};
