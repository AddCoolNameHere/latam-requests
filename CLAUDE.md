# Instruções pro Claude Code — Projeto LATAM Requests

Ferramenta interna da Aceolution: portal de solicitações ao time LATAM. Ler antes de mexer.

## 👤 Sobre o usuário

- **Nome:** Lucas Fuss (Aceolution do Brasil — LATAM team)
- **Idioma:** Brazilian Portuguese (informal, direto, sem firula)
- **Estilo:** pragmático, manda screenshots de bugs, iterações pequenas, valida cada feature antes da próxima

## 🎯 O que é

Dois HTMLs estáticos + Apps Script + planilha Google. **Não relacionado só ao Street View** — é o tracker de demandas do time LATAM (Operations, Legal, Finance, Fleet, etc.).

- `requests.html` — formulário público (qualquer pessoa solicita). Solicitante preenche **tudo**, inclusive responsável e ETA.
- `dashboard.html` — painel interno (só o time, sem login, URL não divulgada). Status, ETA, responsável, atrasados, carga por pessoa.
- `apps-script/Code.gs` — backend (Web App).

Ferramenta interna → "teatro de segurança" é aceitável; sem build step; POSTs fire-and-forget (CORS workaround do Apps Script); validação manual + `node --check`.

## ⚠️ Antes de QUALQUER mudança

1. **Lê o arquivo completo** antes de editar.
2. **Valida sintaxe** depois de cada mudança (ver README → "Validar sintaxe"). Não comita com `node --check` falhando.
3. **Não quebra o contrato de dados:** nomes dos cabeçalhos da aba `Requests` (`HEADERS` no `Code.gs`) e os `type`/`action` dos endpoints. O frontend depende deles.

## 🧱 Arquitetura / contrato

- **Backend é a fonte de verdade** das listas (categorias, status, prioridades, time, SLA). O frontend puxa via `?action=getMeta` e só tem fallback hardcoded (`DEFAULTS`) pra não quebrar offline. **Mudou lista? Muda no `CONFIG` do `Code.gs`.**
- **SLA = automático por prioridade** (dias úteis): `Urgent:1, High:3, Normal:5, Low:10`. Calculado em `slaDueFrom_` / `addBusinessDays_`. Recalcula se a prioridade mudar no update.
- **ID sequencial** (`LATAM-0001`) via Script Property `lastRequestId` + `LockService` no `doPost`.
- **GET:** `fetch(scriptUrl + '?action=...').then(r => r.json())`.
- **POST:** `fetch(scriptUrl, { method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({type:'...'}) })` — fire-and-forget, dashboard atualiza otimista e refaz `getRequests` depois.

## 🔄 Deploy

**Frontend:** abrir HTML direto já funciona; pra compartilhar, GitHub Pages.

**Backend (Apps Script):** ⚠️ Ctrl+S **não publica**. Implantar → Gerenciar implantações → ✏️ Editar → Versão: **Nova versão** → Implantar. Bumpa `CONFIG.version` (`v1.X`) a cada mudança no `Code.gs` e confere com `?action=ping`.

## 📐 Convenções de código

- **HTML:** classes/IDs em kebab-case. Sem libs externas (charts são barras em CSS puro).
- **JS:** camelCase, `const`/`let` (nunca `var`), template strings / concatenação pra HTML, `esc()` em tudo que vem do usuário (XSS).
- **CSS:** variáveis em `:root`. Cores Aceolution: primary `#2C5282`, primary-dark `#1A365D`, accent `#4A9FE0`.
- **Logs:** prefixo `[Requests]` / `[Dashboard]`.

## 📋 Taxonomia (fixa, em inglês — não traduzir)

- **Categorias (15):** Operations, Legal, Finance, Billing, HR, Recruiting, Client Requests, Fleet, Accidents, Ramp / Payhawk, Contracts, IT, Procurement, Business Development, New client.
- **Status (8):** New, Waiting on Me, Waiting Internal, Waiting Client, Waiting Vendor, Completed, Blocked, Finished. (`Completed`/`Finished` = fechado, não conta como "em aberto".)
- **Prioridades:** Urgent, High, Normal, Low.

## 📝 Quando o usuário pede algo

1. **Pensa primeiro** — tradeoffs antes de codar; propõe opções se houver decisão arquitetural.
2. **Reaproveita** — copia padrão dos outros projetos LATAM (`latam-driver-checkin-clean`) em vez de reinventar (CORS, ContentService, etc.).
3. **Valida** — `node --check` antes de entregar.
4. **Bumpa versão** — se mexer no `Code.gs`, sobe `CONFIG.version` e lembra de reimplantar "Nova versão".

## 🚫 Não fazer

- Não renomear cabeçalhos da aba `Requests` nem os `action`/`type` sem ajustar os dois lados.
- Não hardcodar segredos no frontend (é público).
- Não duplicar a matriz de SLA / listas no HTML como fonte primária — backend manda, HTML só tem fallback.
- Não comitar com `node --check` falhando.
