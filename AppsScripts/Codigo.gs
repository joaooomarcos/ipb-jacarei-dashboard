// ============================================================
// IPB Jacareí — Painel de Membros
// Lê as abas "Membros" e "Exclusões" e publica data.json no GitHub
//
// SEGURANÇA: o token do GitHub NÃO fica mais neste arquivo.
// Configure em: Configurações do projeto (⚙) > Propriedades do script
//   Propriedade: GITHUB_TOKEN   Valor: seu token fine-grained
// ============================================================

var GITHUB_REPO = "joaooomarcos/ipb-jacarei-dashboard";
var GITHUB_FILE = "data.json";
var PAGES_URL   = "https://joaooomarcos.github.io/ipb-jacarei-dashboard/";

var SHEETS = {
  membros:   "Membros",
  exclusoes: ["Exclusões", "Exclusoes"]  // tenta os dois nomes
};

var IGREJAS = ["Central", "Villa Branca", "Nova Esperança"];

// Colunas (A = 0) — aba Membros; Exclusões usa as mesmas + AO..AS
var COL = {
  num_ord:    0,   // A  - Nº Ord.
  igreja:     1,   // B  - Igreja
  nome:       2,   // C  - Nome Completo
  sexo:       3,   // D  - Sexo
  comungante: 4,   // E  - Comungante (Sim / Não)
  status:     5,   // F  - Status (Ativo / Inativo)
  nec_esp:    6,   // G  - Possui necessidades especiais?
  dt_nasc:    7,   // H  - Data de Nascimento
  idade:      8,   // I  - Idade
  dt_inc:     11,  // L  - Data Inclusão
  motivo:     12,  // M  - Motivo
  cidade:     25,  // Z  - Cidade
  escolar:    30,  // AE - Escolaridade
  est_civil:  31,  // AF - Estado Civil
  filhos:     33,  // AH - Possui Filhos?
  origem:     35,  // AJ - Origem Religiosa
  // Somente na aba Exclusões:
  exc_motivo:   40,  // AO - Motivo
  exc_desc:     41,  // AP - Motivo Descrição
  exc_dt_falec: 42,  // AQ - Data do Falecimento
  exc_ata:      43,  // AR - Ata da Alteração
  exc_dt_alt:   44   // AS - Data da Alteração
};

var FAIXAS = ["0–12", "13–17", "18–29", "30–44", "45–59", "60+"];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📊 Painel de Membros")
    .addItem("Abrir painel de membros", "showDashboard")
    .addItem("🌐 Abrir painel online", "abrirPainelOnline")
    .addSeparator()
    .addItem("🔄 Publicar dados", "publicarDados")
    .addToUi();
}

function showDashboard() {
  const html = HtmlService.createHtmlOutputFromFile("Dashboard")
    .setWidth(1000)
    .setHeight(650);
  SpreadsheetApp.getUi().showModelessDialog(html, "Painel de Membros — IPB Jacareí");
}

// Menus não podem abrir URLs diretamente: abre um diálogo mínimo
// que dispara window.open e se fecha sozinho
function abrirPainelOnline() {
  const html = HtmlService.createHtmlOutput(
    '<script>window.open(' + JSON.stringify(PAGES_URL) + ', "_blank");google.script.host.close();</script>' +
    '<p style="font-family:sans-serif;font-size:13px">Abrindo o painel… ' +
    '<a href="' + PAGES_URL + '" target="_blank">clique aqui</a> se não abrir automaticamente.</p>'
  ).setWidth(330).setHeight(60);
  SpreadsheetApp.getUi().showModalDialog(html, "Painel online");
}

// ---------- Leitura das abas ----------

function lerAba(nomes, nCols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lista = Array.isArray(nomes) ? nomes : [nomes];
  let sheet = null;
  for (const n of lista) {
    sheet = ss.getSheetByName(n);
    if (sheet) break;
  }
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const cols = Math.min(nCols, sheet.getLastColumn());
  return sheet.getRange(2, 1, lastRow - 1, cols).getValues()
    .filter(r => String(r[COL.num_ord]).trim() !== "" || String(r[COL.nome]).trim() !== "");
}

function cel(r, i) {
  return i < r.length ? String(r[i] == null ? "" : r[i]).trim() : "";
}

// ---------- Agregações ----------

function getDashboardData() {
  const membros   = lerAba(SHEETS.membros, 40);
  const exclusoes = lerAba(SHEETS.exclusoes, 45);
  if (!membros.length) return JSON.stringify({ erro: "aba Membros não encontrada ou vazia" });

  const geral = calcBloco(membros, exclusoes);

  const igrejas = [];
  const porIgreja = {};
  IGREJAS.forEach(nome => {
    const m = membros.filter(r => cel(r, COL.igreja) === nome);
    const e = exclusoes.filter(r => cel(r, COL.igreja) === nome);
    const b = calcBloco(m, e);
    porIgreja[nome] = b;
    igrejas.push({
      nome,
      comungantes:     b.comungantes,
      nao_comungantes: b.nao_comungantes,
      a_parte:         b.a_parte,
      exclusoes:       b.exclusoes
    });
  });

  return JSON.stringify({
    atualizado_em: new Date().toISOString(),
    resumo: {
      comungantes:     geral.comungantes,
      nao_comungantes: geral.nao_comungantes,
      a_parte:         geral.a_parte,
      exclusoes:       geral.exclusoes,
      media_idade:     geral.media_idade
    },
    igrejas,
    sexo:          geral.sexo,
    faixas:        geral.faixas,
    crescimento:   geral.crescimento,
    fluxo:         geral.fluxo,
    motivos:       geral.motivos,
    motivos_saida: geral.motivos_saida,
    civil:         geral.civil,
    escolaridade:  geral.escolaridade,
    origem:        geral.origem,
    filhos:        geral.filhos,
    cidades:       geral.cidades,
    nec_esp:       geral.nec_esp,
    por_igreja:    porIgreja
  });
}

// Calcula todos os agregados para um conjunto de linhas (geral ou uma igreja)
function calcBloco(membros, exclusoes) {
  const ativos   = membros.filter(r => cel(r, COL.status) === "Ativo");
  const com      = ativos.filter(r => cel(r, COL.comungante) === "Sim");
  const ncom     = ativos.filter(r => cel(r, COL.comungante) !== "Sim");
  const inativos = membros.filter(r => cel(r, COL.status) !== "Ativo");

  const idades = ativos.map(toIdade).filter(n => n > 0);
  const media  = idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : 0;

  // Inclusões por ano, separadas por tipo (apenas ativos)
  const anosInc = {};
  com.forEach(r  => { const a = toAno(r[COL.dt_inc]); if (a) (anosInc[a] = anosInc[a] || { c: 0, n: 0 }).c++; });
  ncom.forEach(r => { const a = toAno(r[COL.dt_inc]); if (a) (anosInc[a] = anosInc[a] || { c: 0, n: 0 }).n++; });
  const anosSorted = Object.keys(anosInc).map(Number).sort((a, b) => a - b);

  // Fluxo: entradas (todos os registros, inclusive inativos e excluídos) × saídas,
  // cada um separado por comungante [0] / não comungante [1]
  const entradas = {}, saidas = {};
  membros.concat(exclusoes).forEach(r => {
    const a = toAno(r[COL.dt_inc]);
    if (a) (entradas[a] = entradas[a] || [0, 0])[cel(r, COL.comungante) === "Sim" ? 0 : 1]++;
  });
  exclusoes.forEach(r => {
    const a = toAno(r[COL.exc_dt_alt]) || toAno(r[COL.exc_dt_falec]);
    if (a) (saidas[a] = saidas[a] || [0, 0])[cel(r, COL.comungante) === "Sim" ? 0 : 1]++;
  });
  const anosFluxo = Object.keys(entradas).concat(Object.keys(saidas))
    .map(Number).filter((v, i, arr) => arr.indexOf(v) === i).sort((a, b) => a - b);
  const ent = a => entradas[a] || [0, 0];
  const sai = a => saidas[a]   || [0, 0];

  return {
    comungantes:     com.length,
    nao_comungantes: ncom.length,
    a_parte:         inativos.length,
    exclusoes:       exclusoes.length,
    media_idade:     media,
    sexo: {
      masculino: ativos.filter(r => cel(r, COL.sexo) === "Masculino").length,
      feminino:  ativos.filter(r => cel(r, COL.sexo) === "Feminino").length
    },
    faixas: { labels: FAIXAS, comungantes: bucketFaixas(com), nao_comungantes: bucketFaixas(ncom) },
    crescimento: {
      anos:            anosSorted,
      comungantes:     anosSorted.map(a => anosInc[a].c),
      nao_comungantes: anosSorted.map(a => anosInc[a].n)
    },
    fluxo: {
      anos:       anosFluxo,
      entradas:   anosFluxo.map(a => ent(a)[0] + ent(a)[1]),
      entradas_c: anosFluxo.map(a => ent(a)[0]),
      entradas_n: anosFluxo.map(a => ent(a)[1]),
      saidas:     anosFluxo.map(a => sai(a)[0] + sai(a)[1]),
      saidas_c:   anosFluxo.map(a => sai(a)[0]),
      saidas_n:   anosFluxo.map(a => sai(a)[1]),
      saldo:      anosFluxo.map(a => ent(a)[0] + ent(a)[1] - sai(a)[0] - sai(a)[1])
    },
    motivos:       contaCampo(ativos, COL.motivo),
    motivos_saida: contaCampo(exclusoes, COL.exc_motivo),
    civil:         contaCampo(ativos, COL.est_civil),
    escolaridade:  contaCampo(ativos, COL.escolar),
    origem:        contaCampo(ativos, COL.origem),
    filhos:        contaCampo(ativos, COL.filhos),
    cidades:       contaCampo(ativos, COL.cidade),
    nec_esp: [
      { label: "Sem nec. especiais", valor: ativos.filter(r => !ehSim(r[COL.nec_esp])).length },
      { label: "Com nec. especiais", valor: ativos.filter(r => ehSim(r[COL.nec_esp])).length }
    ]
  };
}

function bucketFaixas(rows) {
  const b = [0, 0, 0, 0, 0, 0];
  rows.forEach(r => {
    const i = toIdade(r);
    if (i > 0) b[i <= 12 ? 0 : i <= 17 ? 1 : i <= 29 ? 2 : i <= 44 ? 3 : i <= 59 ? 4 : 5]++;
  });
  return b;
}

function contaCampo(rows, col) {
  const counts = {};
  rows.forEach(r => {
    const v = cel(r, col);
    if (v) counts[v] = (counts[v] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, valor]) => ({ label, valor }));
}

function ehSim(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "sim" || s === "s";
}

function toIdade(r) {
  const v = r[COL.idade];
  if (v && !isNaN(v) && Number(v) > 0) return Number(v);
  try {
    const d = r[COL.dt_nasc] instanceof Date ? r[COL.dt_nasc] : new Date(r[COL.dt_nasc]);
    return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  } catch (_) { return 0; }
}

function toAno(dt) {
  try {
    if (!dt || dt === "") return null;
    const d = dt instanceof Date ? dt : new Date(dt);
    const ano = d.getFullYear();
    return ano > 1900 && ano <= new Date().getFullYear() ? ano : null;
  } catch (_) { return null; }
}

// ---------- Web app / publicação ----------

function doGet(e) {
  if (e && e.parameter && e.parameter.dashboard === "1") {
    return HtmlService.createHtmlOutputFromFile("Dashboard")
      .setTitle("Membros — IPB Jacareí")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return ContentService
    .createTextOutput(getDashboardData())
    .setMimeType(ContentService.MimeType.JSON);
}

function publicarDados() {
  const token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) {
    SpreadsheetApp.getUi().alert(
      "❌ Token não configurado.\n\nVá em Configurações do projeto (⚙) > Propriedades do script " +
      "e crie a propriedade GITHUB_TOKEN com o token do GitHub.");
    return;
  }

  const json = getDashboardData();
  const conteudoBase64 = Utilities.base64Encode(json, Utilities.Charset.UTF_8);

  // Busca o SHA atual do arquivo (necessário para atualizar)
  const urlGet = "https://api.github.com/repos/" + GITHUB_REPO + "/contents/" + GITHUB_FILE;
  const resGet = UrlFetchApp.fetch(urlGet, {
    headers: { "Authorization": "Bearer " + token },
    muteHttpExceptions: true
  });

  var sha = null;
  if (resGet.getResponseCode() === 200) {
    sha = JSON.parse(resGet.getContentText()).sha;
  }

  const payload = {
    message: "Dashboard atualizado em " + new Date().toLocaleString("pt-BR"),
    content: conteudoBase64
  };
  if (sha) payload.sha = sha;

  const resPut = UrlFetchApp.fetch(urlGet, {
    method: "PUT",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = resPut.getResponseCode();
  if (code === 200 || code === 201) {
    SpreadsheetApp.getUi().alert("✅ Dashboard publicado com sucesso!");
  } else {
    SpreadsheetApp.getUi().alert("❌ Erro ao publicar: " + resPut.getContentText());
  }
}
