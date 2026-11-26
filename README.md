# Painel Oficial de Horas

Projeto estático com endpoint serverless para consulta da única aba disponível na planilha oficial. O nome da aba pode mudar sem exigir alteração no projeto.

## Estrutura

- `index.html`: interface do painel.
- `api/consulta.js`: consulta os dados atuais da planilha oficial, sem cache, e preserva a posição original de cada registro.
- `package.json`: metadados mínimos do projeto.
- `vercel.json`: configuração básica da Vercel.

## Configuração na Vercel

A leitura da planilha usa o endpoint público GViz. Não é necessária a variável `GOOGLE_DRIVE_API_KEY` para este painel. A planilha precisa permitir leitura pública pelo endpoint utilizado.

## Publicação

Conecte este repositório à Vercel. Cada commit na branch configurada dispara uma nova implantação.
