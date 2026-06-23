# LATAM Requests — Portal de solicitações ao time LATAM

Ferramenta interna da **Aceolution do Brasil**. Duas páginas estáticas (HTML/JS, sem build) ligadas a uma planilha Google via Apps Script.

| Arquivo | O que é | Quem usa |
|---|---|---|
| `requests.html` | Formulário público de solicitações | Qualquer pessoa da empresa |
| `dashboard.html` | Painel de acompanhamento (status, ETA, responsável, atrasados) | Só o time LATAM / liderança (URL não divulgada) |
| `apps-script/Code.gs` | Backend (Web App + planilha) | — |

---

## 1. Criar o backend (uma vez)

1. Crie uma **planilha Google nova** (ex: "LATAM Requests DB").
2. Nela: **Extensões → Apps Script**.
3. Apague o conteúdo padrão e cole **todo** o `apps-script/Code.gs`.
4. Salve (💾). Rode a função **`setup`** uma vez (menu de funções → `setup` → ▶ Executar).
   - Autorize quando pedir. Isso cria a aba **`Requests`** com os cabeçalhos.
5. **Implantar → Nova implantação → tipo: App da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
   - **Implantar** e **copie a URL** (termina em `/exec`).

## 2. Ligar o frontend

Em **`requests.html`** e **`dashboard.html`**, no topo do `<script>`, troque:

```js
const CONFIG = { scriptUrl: 'COLE_A_URL_DO_WEB_APP_AQUI' };
```

pela URL `/exec` copiada. (É a mesma URL nos dois arquivos.)

Teste a URL no browser: `SUA_URL/exec?action=ping` deve retornar um JSON com `success: true` e a versão.

## 3. Publicar as páginas

- **Rápido:** abrir os `.html` direto no browser já funciona (o JS chama o Apps Script).
- **Compartilhável:** subir num repositório no **GitHub Pages** (igual aos outros projetos LATAM). O `requests.html` você divulga; o `dashboard.html` você guarda só pro time.

---

## Personalizar

Tudo no topo do `Code.gs`, em `CONFIG`:

- **`team`** — nomes dos responsáveis que aparecem no form/dashboard. **Edite com a equipe real.**
- **`sla`** — dias úteis por prioridade (`Urgent:1, High:3, Normal:5, Low:10`).
- **`categories`**, **`countries`**, **`statuses`**, **`priorities`** — listas.

O frontend puxa essas listas via `?action=getMeta`, então **basta editar no `Code.gs`** — não precisa mexer no HTML.

> ⚠️ **Toda vez que mudar o `Code.gs`:** Implantar → **Gerenciar implantações → ✏️ Editar → Versão: Nova versão → Implantar.** Só salvar (Ctrl+S) **não** publica. Confira com `?action=ping`.

---

## Modelo de dados (aba `Requests`)

`ID · Created At · Requester Name · Requester Email · Category · Subject · Description · Project · Country · Priority · Responsible · ETA · SLA Due · Status · Link · Internal Notes · Updated At`

- **ID:** sequencial automático (`LATAM-0001`…).
- **SLA Due:** calculado automaticamente a partir de `Created At` + dias úteis da prioridade.
- **Status inicial:** `New`. O time muda no dashboard (dropdown inline ou no modal "editar").

## Endpoints (Apps Script)

| Método | Ação | Retorno |
|---|---|---|
| GET | `?action=ping` | versão + total de requests |
| GET | `?action=getMeta` | categorias, status, prioridades, time, SLA |
| GET | `?action=getRequests` | todas as solicitações |
| POST | `{type:'createRequest', ...}` | cria (gera ID + SLA) |
| POST | `{type:'updateRequest', id, ...}` | atualiza status/responsável/ETA/prioridade/notas |

POSTs são **fire-and-forget** (`mode:'no-cors'`) — o Apps Script não devolve headers CORS em POST.

## Validar sintaxe (antes de commitar)

```bash
# HTMLs:
node -e 'const fs=require("fs");const c=fs.readFileSync(process.argv[1],"utf8");const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m,js="";while((m=re.exec(c)))js+=m[1]+"\n";fs.writeFileSync("/tmp/c.js",js)' requests.html && node --check /tmp/c.js
# Apps Script:
cp apps-script/Code.gs /tmp/c.js && node --check /tmp/c.js
```
