/**
 * LATAM Requests — Backend (Google Apps Script)
 * Aceolution do Brasil — Street View LATAM team
 *
 * Web App que conecta os HTMLs (requests.html + dashboard.html) a uma planilha.
 *
 * COMO USAR (resumo — passo a passo completo no README.md):
 *   1. Crie uma planilha Google nova.
 *   2. Extensões -> Apps Script -> cole este arquivo (substitui o Code.gs).
 *   3. Rode a função setup() uma vez (cria a aba "Requests" com cabeçalhos).
 *   4. Implantar -> Nova implantação -> Web App -> Executar como: Eu;
 *      Quem tem acesso: Qualquer pessoa. Copie a URL.
 *   5. Cole a URL em CONFIG.scriptUrl no topo de requests.html e dashboard.html.
 *
 * Padrão de comunicação (mesmo dos outros projetos LATAM):
 *   - GET  -> ?action=... retorna JSON
 *   - POST -> body JSON { type: '...' }  (frontend manda fire-and-forget, no-cors)
 */

// ================================================================
// CONFIG
// ================================================================
const CONFIG = {
  version: 'v1.0',

  // Deixe '' para usar a planilha onde este script está colado (recomendado).
  // Ou cole um ID se o script for standalone.
  spreadsheetId: '',

  sheetName: 'Requests',

  // SLA automático por prioridade (em DIAS ÚTEIS, a partir da criação).
  // Edite à vontade.
  sla: {
    Urgent: 1,
    High: 3,
    Normal: 5,
    Low: 10,
  },

  // Categorias (15). Mantém em sincronia com o frontend (ou o frontend puxa via getMeta).
  categories: [
    'Operations', 'Legal', 'Finance', 'Billing', 'HR', 'Recruiting',
    'Client Requests', 'Fleet', 'Accidents', 'Ramp / Payhawk', 'Contracts',
    'IT', 'Procurement', 'Business Development', 'New client',
  ],

  // Status possíveis (8). 'New' é o default na criação.
  statuses: [
    'New', 'Waiting on Me', 'Waiting Internal', 'Waiting Client',
    'Waiting Vendor', 'Completed', 'Blocked', 'Finished',
  ],

  priorities: ['Urgent', 'High', 'Normal', 'Low'],

  // Time LATAM (responsáveis selecionáveis no form). EDITE com a equipe real.
  team: ['Lucas Fuss', 'Bia', 'Pankaj', 'Other'],

  // Países/region opcionais (campo do form). EDITE conforme o escopo.
  countries: ['Brazil', 'Argentina', 'Chile', 'Colombia', 'Mexico', 'Peru', 'LATAM (all)', 'Other'],
};

// Ordem canônica das colunas na planilha. A leitura usa um mapa header->índice,
// então a ordem pode mudar sem quebrar — mas NÃO renomeie os cabeçalhos.
const HEADERS = [
  'ID', 'Created At', 'Requester Name', 'Requester Email', 'Category',
  'Subject', 'Description', 'Project', 'Country', 'Priority',
  'Responsible', 'ETA', 'SLA Due', 'Status', 'Link', 'Internal Notes', 'Updated At',
];

// ================================================================
// SETUP / SHEET
// ================================================================
function setup() {
  const sh = ensureSheet_();
  // inicializa o contador de IDs com base nas linhas existentes
  const lastRow = sh.getLastRow();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('lastRequestId')) {
    props.setProperty('lastRequestId', String(Math.max(0, lastRow - 1)));
  }
  return 'Setup OK — aba "' + CONFIG.sheetName + '" pronta. Versão ' + CONFIG.version;
}

function getSpreadsheet_() {
  if (CONFIG.spreadsheetId) return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  return SpreadsheetApp.getActive();
}

function ensureSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(CONFIG.sheetName);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.sheetName);
  }
  // garante cabeçalho na linha 1
  const firstRow = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeader = firstRow.some(function (v) { return String(v).trim() !== ''; });
  if (!hasHeader) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#1A365D').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

// header -> índice (0-based) a partir da linha 1 atual da planilha
function headerMap_(sh) {
  const row = sh.getRange(1, 1, 1, Math.max(HEADERS.length, sh.getLastColumn())).getValues()[0];
  const map = {};
  row.forEach(function (h, i) { map[String(h).trim()] = i; });
  return map;
}

// ================================================================
// HELPERS
// ================================================================
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function toIso_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return String(v);
}

// soma N dias úteis (pula sábado/domingo) a partir de uma data
function addBusinessDays_(start, days) {
  const d = new Date(start.getTime());
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  // joga para o fim do dia útil (23:59) pra contar o dia inteiro como dentro do prazo
  d.setHours(23, 59, 0, 0);
  return d;
}

function slaDueFrom_(created, priority) {
  const days = CONFIG.sla[priority];
  if (!days) return '';
  return addBusinessDays_(created, days);
}

function nextRequestId_() {
  const props = PropertiesService.getScriptProperties();
  let n = parseInt(props.getProperty('lastRequestId') || '0', 10) + 1;
  props.setProperty('lastRequestId', String(n));
  return 'LATAM-' + String(n).padStart(4, '0');
}

// ================================================================
// GET
// ================================================================
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'ping';

    if (action === 'ping') {
      const sh = ensureSheet_();
      return jsonResponse({
        success: true,
        version: CONFIG.version,
        sheet: CONFIG.sheetName,
        totalRequests: Math.max(0, sh.getLastRow() - 1),
        endpoints: ['ping', 'getMeta', 'getRequests', 'POST createRequest', 'POST updateRequest'],
        timestamp: new Date().toISOString(),
      });
    }

    if (action === 'getMeta') {
      return jsonResponse({
        success: true,
        version: CONFIG.version,
        categories: CONFIG.categories,
        statuses: CONFIG.statuses,
        priorities: CONFIG.priorities,
        team: CONFIG.team,
        countries: CONFIG.countries,
        sla: CONFIG.sla,
      });
    }

    if (action === 'getRequests') {
      return jsonResponse({ success: true, requests: getAllRequests_() });
    }

    return jsonResponse({ success: false, error: 'Ação desconhecida: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

function getAllRequests_() {
  const sh = ensureSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const map = headerMap_(sh);
  const width = Math.max(HEADERS.length, sh.getLastColumn());
  const rows = sh.getRange(2, 1, lastRow - 1, width).getValues();

  function cell(row, name) {
    const i = map[name];
    return (i === undefined) ? '' : row[i];
  }

  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const id = cell(row, 'ID');
    if (!id) continue;
    out.push({
      rowNumber: r + 2,
      id: String(id),
      createdAt: toIso_(cell(row, 'Created At')),
      requesterName: String(cell(row, 'Requester Name')),
      requesterEmail: String(cell(row, 'Requester Email')),
      category: String(cell(row, 'Category')),
      subject: String(cell(row, 'Subject')),
      description: String(cell(row, 'Description')),
      project: String(cell(row, 'Project')),
      country: String(cell(row, 'Country')),
      priority: String(cell(row, 'Priority')),
      responsible: String(cell(row, 'Responsible')),
      eta: toIso_(cell(row, 'ETA')),
      slaDue: toIso_(cell(row, 'SLA Due')),
      status: String(cell(row, 'Status')) || 'New',
      link: String(cell(row, 'Link')),
      notes: String(cell(row, 'Internal Notes')),
      updatedAt: toIso_(cell(row, 'Updated At')),
    });
  }
  // mais recentes primeiro
  out.reverse();
  return out;
}

// ================================================================
// POST
// ================================================================
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const data = JSON.parse(e.postData.contents);

    if (data.type === 'createRequest') {
      return jsonResponse(createRequest_(data));
    }

    if (data.type === 'updateRequest') {
      return jsonResponse(updateRequest_(data));
    }

    return jsonResponse({ success: false, error: 'Tipo desconhecido: ' + data.type });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function createRequest_(data) {
  const sh = ensureSheet_();
  const map = headerMap_(sh);
  const now = new Date();
  const id = nextRequestId_();
  const priority = CONFIG.priorities.indexOf(data.priority) >= 0 ? data.priority : 'Normal';
  const slaDue = slaDueFrom_(now, priority);
  const eta = data.eta ? new Date(data.eta) : '';

  const record = {
    'ID': id,
    'Created At': now,
    'Requester Name': data.requesterName || '',
    'Requester Email': data.requesterEmail || '',
    'Category': data.category || '',
    'Subject': data.subject || '',
    'Description': data.description || '',
    'Project': data.project || '',
    'Country': data.country || '',
    'Priority': priority,
    'Responsible': data.responsible || '',
    'ETA': eta,
    'SLA Due': slaDue,
    'Status': 'New',
    'Link': data.link || '',
    'Internal Notes': '',
    'Updated At': now,
  };

  const width = Math.max(HEADERS.length, sh.getLastColumn());
  const rowArr = new Array(width).fill('');
  HEADERS.forEach(function (h) {
    const i = map[h];
    if (i !== undefined) rowArr[i] = record[h];
  });
  sh.appendRow(rowArr);

  return { success: true, id: id, slaDue: toIso_(slaDue), message: 'Solicitação registrada' };
}

function updateRequest_(data) {
  if (!data.id) return { success: false, error: 'id obrigatório' };
  const sh = ensureSheet_();
  const map = headerMap_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { success: false, error: 'sem dados' };

  const idCol = map['ID'];
  const ids = sh.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(data.id)) { targetRow = i + 2; break; }
  }
  if (targetRow === -1) return { success: false, error: 'ID não encontrado: ' + data.id };

  function setCell(name, value) {
    const i = map[name];
    if (i !== undefined) sh.getRange(targetRow, i + 1).setValue(value);
  }
  function getCell(name) {
    const i = map[name];
    return (i === undefined) ? '' : sh.getRange(targetRow, i + 1).getValue();
  }

  if (data.status !== undefined && CONFIG.statuses.indexOf(data.status) >= 0) {
    setCell('Status', data.status);
  }
  if (data.responsible !== undefined) setCell('Responsible', data.responsible);
  if (data.eta !== undefined) setCell('ETA', data.eta ? new Date(data.eta) : '');
  if (data.notes !== undefined) setCell('Internal Notes', data.notes);

  // se a prioridade mudou, recalcula o SLA Due a partir da data de criação
  if (data.priority !== undefined && CONFIG.priorities.indexOf(data.priority) >= 0) {
    setCell('Priority', data.priority);
    const created = getCell('Created At');
    const createdDate = (Object.prototype.toString.call(created) === '[object Date]') ? created : new Date(created);
    setCell('SLA Due', slaDueFrom_(createdDate, data.priority));
  }

  setCell('Updated At', new Date());
  return { success: true, id: data.id, message: 'Atualizado' };
}
