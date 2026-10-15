# Personal Finance

Aplicativo pessoal de controle financeiro. Funciona no navegador, sem backend, e guarda os lançamentos no IndexedDB deste dispositivo.

Os dados não são sincronizados entre aparelhos. Um backup JSON é a forma de recuperar ou migrar. Limpar os dados do navegador apaga os lançamentos.

## Requisitos

- Node.js 20 ou superior
- npm

## Instalação e execução

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite, em geral `http://localhost:5173`.

## Testes e build

```bash
npm test
npm run build
npm run preview
```

O build gera a pasta `dist`, pronta para hospedagem estática. O service worker entra nessa pasta e, depois do primeiro carregamento, mantém o aplicativo disponível offline.

## Backup

Em Ajustes:

- Exportar baixa um arquivo `personal-finance-backup-AAAA-MM-DD.json`.
- Restaurar valida a versão e a integridade antes de substituir qualquer dado.
- A data do último backup fica registrada localmente.

O arquivo contém configurações, categorias, cartões, lançamentos, recorrências, parcelas, compras e baixas.

## Dados iniciais

`src/data/config.json` guarda preferências de moeda, idioma e horizonte de recorrência.

`src/data/initial-data.json` traz as categorias iniciais. A lista de lançamentos começa vazia de propósito. Os dados de demonstração só entram pelo botão em Ajustes e ficam marcados com `[Exemplo]`.

## Publicação no Azure Static Web Apps

O plano gratuito é suficiente: o site é estático e não usa API.

1. Envie o repositório para o GitHub.
2. Crie um Static Web App apontando para o repositório.
3. Use estes valores:
   - App location: `/`
   - Api location: vazio
   - Output location: `dist`
4. O workflow em `.github/workflows/azure-static-web-apps.yml` espera o segredo `AZURE_STATIC_WEB_APPS_API_TOKEN`.

`public/staticwebapp.config.json` é copiado para o build e devolve `index.html` nas rotas da SPA, para que atualizar a página em `/mes` continue funcionando.

## Regras financeiras

- Valores são armazenados em centavos inteiros.
- Datas de vencimento são dias de calendário no fuso local, no formato `aaaa-mm-dd`.
- O status de um título sai da soma das baixas ativas. Estorno mantém o histórico e tira o valor da soma.
- Uma baixa maior que o saldo pede confirmação.
- Recorrências geram títulos de forma idempotente, daqui a doze meses para trás até seis meses à frente, além da competência aberta quando ela estiver fora dessa janela.
- Compras no cartão viram parcelas de fatura. A despesa consolidada é a fatura, não a compra somada ao pagamento.
- Compra depois do dia de fechamento entra no ciclo seguinte. Se o dia de vencimento é menor ou igual ao de fechamento, a fatura vence no mês seguinte.
- A previsão dos próximos meses só usa títulos, recorrências, parcelas e compras já cadastrados.

## Evolução do banco local

O schema do IndexedDB está na versão 1, em `src/db/database.ts`. Uma mudança futura deve abrir `db.version(2)` com um método `upgrade`, sem apagar os dados existentes, e aumentar `SCHEMA_VERSION` em `src/domain/types.ts`. Backups de versão diferente são recusados antes de qualquer gravação.
